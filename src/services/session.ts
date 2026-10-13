import { randomUUID } from 'node:crypto';
import { ChannelType, type Guild, type VoiceBasedChannel, type VoiceState } from 'discord.js';
import { generateTeams, type TeamOptions } from '../domain/team-generator.js';
import { ERR } from '../messages.js';
import type { Session, SessionStore } from '../store/db.js';

/** 팀 채널이 빈 뒤 다시 확인하기까지 기다리는 시간 */
const CLEANUP_DELAY_MS = 60_000;
/** 편성 결과(split team 버튼)가 유효한 시간 */
const DRAFT_TTL_MS = 10 * 60_000;
/** 끝난 판에서 사람이 남아 있는 팀 채널 이름 뒤에 붙인다. 새 판의 같은 이름 채널과 구분된다. */
const ENDED_SUFFIX = ' (종료)';
/** 끝난 판의 채널을 지우려는데 다른 작업 중이면 이만큼 뒤에 다시 시도한다 */
const ENDED_RETRY_MS = 2_000;

/** stale: 버튼이 더 이상 쓸모없어서 메시지에서 지워도 되는 경우 */
export type Failure = { ok: false; reason: string; stale?: boolean };

export type GenerateOutcome = { ok: true; session: Session; unassigned: string[]; excluded: string[] } | Failure;
export type SplitOutcome = { ok: true; session: Session; lobbyName: string; notMoved: string[] } | Failure;
export type AssembleOutcome =
  | { ok: true; lobbyName: string; lobbyRecreated: boolean; moved: number; failed: number; keptChannels: number }
  | Failure;
export type EndOutcome = { ok: true; keptChannels: number } | Failure;

export class SessionService {
  /** 팀 채널 ID → 그 채널을 지울지 다시 확인할 타이머 */
  private readonly cleanupTimers = new Map<string, NodeJS.Timeout>();
  /** split·assemble 이 진행 중인 판. 진행 중에 다른 쪽이 끼어들지 못하게 한다. */
  private readonly busy = new Set<string>();

  constructor(
    private readonly store: SessionStore,
    private readonly getGuild: (guildId: string) => Guild | undefined,
  ) {}

  isStoreHealthy(): boolean {
    return this.store.isHealthy();
  }

  generate(lobby: VoiceBasedChannel, hostId: string, options: TeamOptions, excludeIds: Set<string>): GenerateOutcome {
    const guildId = lobby.guild.id;
    const participantIds = lobby.members.filter((m) => !m.user.bot && !excludeIds.has(m.id)).map((m) => m.id);
    if (participantIds.length < 2) {
      return { ok: false, reason: ERR.tooFew };
    }
    const result = generateTeams(participantIds, options);
    if (!result.ok) {
      return { ok: false, reason: ERR.shortBy(result.shortBy) };
    }

    const session: Session = {
      id: randomUUID(),
      guildId,
      lobbyId: lobby.id,
      hostId,
      participantIds,
      teams: result.teams,
      teamChannelIds: [],
      status: 'draft',
      createdAt: Date.now(),
    };
    // 같은 로비의 이전 편성 결과는 무효로 한다. 최신 결과만 split 할 수 있다.
    this.store.deleteDraftsForLobby(guildId, lobby.id);
    this.store.createDraft(session);
    return { ok: true, session, unassigned: result.unassigned, excluded: [...excludeIds] };
  }

  async split(guild: Guild, sessionId: string, userId: string): Promise<SplitOutcome> {
    const session = this.store.get(sessionId);
    if (!session || (session.status === 'draft' && Date.now() - session.createdAt > DRAFT_TTL_MS)) {
      return { ok: false, stale: true, reason: ERR.stale };
    }
    // 이미 분배했거나 끝난 판의 버튼이다. 통과시키면 같은 로비의 지금 판을 끝내 버린다.
    if (session.status !== 'draft') return { ok: false, stale: true, reason: ERR.alreadySplit };
    if (session.hostId !== userId) return { ok: false, reason: ERR.notHost };

    const lobby = await fetchVoiceChannel(guild, session.lobbyId);
    if (!lobby) return { ok: false, reason: ERR.lobbyGone };

    // 이전 판이 남아 있으면 끝내고 새 판을 시작한다. 모으기를 안 하고 로비로 돌아왔거나,
    // 이전 판의 팀 채널에 모인 채로 다시 팀을 짠 경우다.
    const previous = this.store
      .listActive(session.guildId)
      .filter((s) => s.lobbyId === session.lobbyId || s.teamChannelIds.includes(session.lobbyId));
    for (const p of previous) {
      const ended = await this.end(guild, p.id);
      if (!ended.ok) return ended;
    }

    if (!this.store.activate(session.id)) {
      return { ok: false, reason: ERR.lobbyBusy };
    }

    this.busy.add(session.id);
    try {
      return await this.createAndMove(guild, session, lobby);
    } finally {
      this.busy.delete(session.id);
    }
  }

  private async createAndMove(guild: Guild, session: Session, lobby: VoiceBasedChannel): Promise<SplitOutcome> {
    // 채널을 전부 먼저 만들고, 하나라도 실패하면 만든 채널을 지우고 끝낸다.
    // 봇이 도중에 꺼져도 정리할 수 있게 만들 때마다 ID를 저장한다.
    const channels: VoiceBasedChannel[] = [];
    try {
      for (let i = 0; i < session.teams.length; i++) {
        channels.push(
          await guild.channels.create({
            name: `${i + 1}팀`,
            type: ChannelType.GuildVoice,
            parent: lobby.parentId ?? undefined,
          }),
        );
        this.store.setTeamChannels(
          session.id,
          channels.map((c) => c.id),
        );
      }
    } catch (error) {
      console.error(`[split ${session.id}] 팀 채널 생성 실패`, error);
      await Promise.allSettled(channels.map((c) => c.delete()));
      this.store.revertToDraft(session.id);
      return { ok: false, reason: ERR.createFailed };
    }

    const teamChannelIds = channels.map((c) => c.id);

    // 지금 로비에 있는 팀원만 옮긴다.
    const notMoved: string[] = [];
    const moves = session.teams.flatMap((team, i) =>
      team.map(async (userId) => {
        const voice = guild.voiceStates.cache.get(userId);
        if (voice?.channelId !== lobby.id) {
          notMoved.push(userId);
          return;
        }
        try {
          await voice.setChannel(channels[i]!);
        } catch (error) {
          console.error(`[split ${session.id}] ${userId} 이동 실패`, error);
          notMoved.push(userId);
        }
      }),
    );
    await Promise.all(moves);

    const activeSession: Session = { ...session, status: 'active', teamChannelIds };
    // 아무도 옮기지 못한 채널은 나가는 이벤트가 없으니 여기서 정리를 예약한다.
    this.scheduleEmptyChannels(guild, activeSession);
    return { ok: true, session: activeSession, lobbyName: lobby.name, notMoved };
  }

  /** /team assemble 을 친 사람이 속한 진행 중인 판을 찾는다. */
  findForAssemble(guildId: string, userId: string, voiceChannelId: string | null): Session | undefined {
    const active = this.store.listActive(guildId);
    if (voiceChannelId) {
      const byChannel = active.find((s) => s.lobbyId === voiceChannelId || s.teamChannelIds.includes(voiceChannelId));
      if (byChannel) return byChannel;
    }
    return active
      .filter((s) => s.hostId === userId || s.participantIds.includes(userId))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  getActive(sessionId: string): Session | undefined {
    const session = this.store.get(sessionId);
    return session?.status === 'active' ? session : undefined;
  }

  canAssemble(session: Session, userId: string): boolean {
    return session.hostId === userId || session.participantIds.includes(userId);
  }

  async assemble(guild: Guild, sessionId: string): Promise<AssembleOutcome> {
    // 분배 중이거나 이미 모으는 중이면 끼어들지 않는다.
    if (this.busy.has(sessionId)) return { ok: false, reason: ERR.busy };
    const session = this.getActive(sessionId);
    if (!session) return { ok: false, reason: ERR.ended };

    this.busy.add(sessionId);
    try {
      return await this.moveBackAndClose(guild, session);
    } finally {
      this.busy.delete(sessionId);
    }
  }

  private async moveBackAndClose(guild: Guild, session: Session): Promise<AssembleOutcome> {
    let lobby = await fetchVoiceChannel(guild, session.lobbyId);
    const lobbyRecreated = !lobby;
    if (!lobby) {
      lobby = await this.recreateLobby(guild, session);
      if (!lobby) return { ok: false, reason: ERR.lobbyRecreateFailed };
    }
    this.cancelCleanup(session);

    let moved = 0;
    let failed = 0;
    const keptChannelIds: string[] = [];
    for (const channelId of session.teamChannelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel?.isVoiceBased()) continue;

      const results = await Promise.allSettled(channel.members.map((m) => m.voice.setChannel(lobby)));
      const channelFailed = results.filter((r) => r.status === 'rejected').length;
      moved += results.length - channelFailed;
      failed += channelFailed;

      // 사람이 남아 있는 채널은 지우지 않는다. 지우면 그 사람의 음성 연결이 끊긴다.
      if (channelFailed > 0) {
        keptChannelIds.push(channelId);
        continue;
      }
      await channel.delete().catch((error) => {
        console.error(`[assemble ${session.id}] ${channelId} 삭제 실패`, error);
        keptChannelIds.push(channelId);
      });
    }

    if (keptChannelIds.length === 0) {
      this.store.delete(session.id);
    } else {
      // 남은 채널은 판에 붙여 두고 비면 자동 정리로 지운다.
      this.store.setTeamChannels(session.id, keptChannelIds);
      this.scheduleEmptyChannels(guild, { ...session, teamChannelIds: keptChannelIds });
    }
    return { ok: true, lobbyName: lobby.name, lobbyRecreated, moved, failed, keptChannels: keptChannelIds.length };
  }

  /** 아무도 옮기지 않고 판을 끝낸다. */
  async end(guild: Guild, sessionId: string): Promise<EndOutcome> {
    if (this.busy.has(sessionId)) return { ok: false, reason: ERR.busy };
    const session = this.getActive(sessionId);
    if (!session) return { ok: false, reason: ERR.ended };

    this.busy.add(sessionId);
    try {
      return { ok: true, keptChannels: await this.closeChannels(guild, session) };
    } finally {
      this.busy.delete(sessionId);
    }
  }

  /** 빈 팀 채널은 바로 지우고, 사람이 남은 채널은 이름에 (종료)를 붙여 두었다가 비면 바로 지운다. */
  private async closeChannels(guild: Guild, session: Session): Promise<number> {
    this.cancelCleanup(session);
    this.store.end(session.id);

    const keptChannelIds: string[] = [];
    for (const channelId of session.teamChannelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel?.isVoiceBased()) continue;

      if (channel.members.size === 0) {
        const deleted = await channel.delete().then(
          () => true,
          (error) => {
            console.error(`[end ${session.id}] ${channelId} 삭제 실패`, error);
            return false;
          },
        );
        if (deleted) continue;
      } else {
        await channel
          .setName(`${channel.name}${ENDED_SUFFIX}`)
          .catch((error) => console.error(`[end ${session.id}] ${channelId} 이름 변경 실패`, error));
      }
      keptChannelIds.push(channelId);
    }

    if (keptChannelIds.length === 0) {
      this.store.delete(session.id);
    } else {
      this.store.setTeamChannels(session.id, keptChannelIds);
      // 지우지 못한 빈 채널은 나가는 이벤트가 다시 오지 않으니 여기서 다시 시도를 예약한다.
      this.scheduleEmptyChannels(guild, { ...session, status: 'ended', teamChannelIds: keptChannelIds });
    }
    return keptChannelIds.length;
  }

  /** 로비가 지워졌으면 팀 채널과 같은 카테고리(= 원래 로비의 카테고리)에 새로 만든다. */
  private async recreateLobby(guild: Guild, session: Session): Promise<VoiceBasedChannel | undefined> {
    const parentId = session.teamChannelIds.map((id) => guild.channels.cache.get(id)?.parentId).find(Boolean);
    try {
      return await guild.channels.create({ name: '로비', type: ChannelType.GuildVoice, parent: parentId ?? undefined });
    } catch (error) {
      console.error(`[assemble ${session.id}] 로비 재생성 실패`, error);
      return undefined;
    }
  }

  /** 팀 채널에서 누가 나갔을 때 호출. 진행 중인 판의 채널이 비면 1분 뒤, 끝난 판의 채널이 비면 바로 지운다. */
  onVoiceStateUpdate(oldState: VoiceState): void {
    const channelId = oldState.channelId;
    if (!channelId) return;
    const session = this.store.listWithChannels(oldState.guild.id).find((s) => s.teamChannelIds.includes(channelId));
    if (session && isChannelEmpty(oldState.guild, channelId)) this.handleEmptyChannel(session, channelId);
  }

  /** 봇이 시작할 때 진행 중인 판을 같은 기준으로 한 번 점검한다. */
  checkOnStartup(): void {
    for (const session of this.store.listWithChannels()) {
      const guild = this.getGuild(session.guildId);
      if (!guild) {
        // 봇이 내보내진 서버의 판
        this.store.delete(session.id);
        continue;
      }
      // 장애로 잠깐 못 쓰는 서버는 채널 정보가 비어 보이니 건너뛴다.
      if (!guild.available) continue;
      this.scheduleEmptyChannels(guild, session);
    }
  }

  purgeOldDrafts(): void {
    const removed = this.store.deleteDraftsBefore(Date.now() - DRAFT_TTL_MS);
    if (removed > 0) console.log(`오래된 편성 결과 ${removed}개 삭제`);
  }

  private scheduleEmptyChannels(guild: Guild, session: Session): void {
    for (const channelId of session.teamChannelIds) {
      if (isChannelEmpty(guild, channelId)) this.handleEmptyChannel(session, channelId);
    }
  }

  private handleEmptyChannel(session: Session, channelId: string): void {
    if (session.status === 'ended') this.runCleanup(session.id, channelId);
    else this.scheduleCleanup(session.id, channelId);
  }

  /** 이미 예약돼 있으면 처음부터 다시 1분을 센다. */
  private scheduleCleanup(sessionId: string, channelId: string, delayMs = CLEANUP_DELAY_MS): void {
    clearTimeout(this.cleanupTimers.get(channelId));
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(channelId);
      this.runCleanup(sessionId, channelId);
    }, delayMs);
    this.cleanupTimers.set(channelId, timer);
  }

  private runCleanup(sessionId: string, channelId: string): void {
    this.cleanupIfStillEmpty(sessionId, channelId).catch((error) =>
      console.error(`[cleanup ${sessionId}] ${channelId} 실패`, error),
    );
  }

  private cancelCleanup(session: Session): void {
    for (const channelId of session.teamChannelIds) {
      clearTimeout(this.cleanupTimers.get(channelId));
      this.cleanupTimers.delete(channelId);
    }
  }

  /** 채널이 여전히 비어 있으면 그 채널만 지운다. 판의 마지막 팀 채널이었으면 판을 끝낸다. */
  private async cleanupIfStillEmpty(sessionId: string, channelId: string): Promise<void> {
    const session = this.store.get(sessionId);
    if (session?.status === 'draft' || !session?.teamChannelIds.includes(channelId)) return;
    // 분배·모으기 중이면 끝난 뒤에 다시 확인한다. 그대로 버리면 채널이 남는다.
    if (this.busy.has(sessionId)) {
      return this.scheduleCleanup(sessionId, channelId, session.status === 'ended' ? ENDED_RETRY_MS : CLEANUP_DELAY_MS);
    }
    const guild = this.getGuild(session.guildId);
    if (!guild?.available || !isChannelEmpty(guild, channelId)) return;

    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      // 지우는 동안 모으기가 같은 채널을 건드리지 못하게 막는다.
      this.busy.add(sessionId);
      try {
        await channel.delete();
      } catch (error) {
        // 지우지 못한 채널은 판에 남겨 두고 다음에 비었을 때 다시 시도한다.
        console.error(`[cleanup ${sessionId}] ${channelId} 삭제 실패`, error);
        return;
      } finally {
        this.busy.delete(sessionId);
      }
    }
    const remaining = this.store.removeTeamChannel(sessionId, channelId);
    if (remaining?.length === 0) {
      this.store.delete(sessionId);
      console.log(`[cleanup ${sessionId}] 팀 채널이 모두 정리되어 판 종료`);
    } else {
      console.log(`[cleanup ${sessionId}] 빈 팀 채널 ${channelId} 정리, 남은 채널 ${remaining?.length ?? 0}개`);
    }
  }

  stop(): void {
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
  }
}

/** 채널이 없어졌거나 아무도 없으면 비어 있는 것으로 본다. */
function isChannelEmpty(guild: Guild, channelId: string): boolean {
  const channel = guild.channels.cache.get(channelId);
  return !channel?.isVoiceBased() || channel.members.size === 0;
}

async function fetchVoiceChannel(guild: Guild, channelId: string): Promise<VoiceBasedChannel | undefined> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  return channel?.isVoiceBased() ? channel : undefined;
}
