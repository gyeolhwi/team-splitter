import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  escapeMarkdown,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type VoiceBasedChannel,
} from 'discord.js';
import { findProblems, formatUptime, type HealthInput } from '../domain/health.js';
import { plannedSizes, type TeamOptions } from '../domain/team-generator.js';
import { ERR, MSG } from '../messages.js';
import type { Session } from '../store/db.js';
import type { AssembleOutcome, GenerateOutcome, SessionService } from '../services/session.js';

const SPLIT_PREFIX = 'split:';
const ASSEMBLE_PREFIX = 'assemble:';
const END_PREFIX = 'end:';
const RECRUIT_PREFIX = 'recruit:';
const PIN_PREFIX = 'pin:';

/** 슬래시 명령과 옵션 이름. scripts/register-commands.mjs 와 맞춘다. */
const COMMAND = { ping: 'ping', generate: '팀짜기', assemble: '모으기', recruit: '구인', seek: '구직' } as const;
const OPTION = { team: '팀수', number: '인원수', exclude: '제외', category: '카테고리', description: '설명' } as const;
const BUTTON = {
  split: '팀 분배',
  assemble: '모으기',
  end: '종료하기',
  join: '음성채널 입장',
  recruit: '구인하기',
} as const;

const RECRUIT_COLOR = 0x8ab4f8;
const SEEK_COLOR = 0x57f287;
/** 구인하기로 만든 초대링크 유효 시간(초) */
const INVITE_MAX_AGE = 60 * 60;
/** 같은 사람이 같은 구직자에게 초대를 다시 보낼 수 있을 때까지의 간격 */
const INVITE_COOLDOWN_MS = 5 * 60_000;
/** `구직자:누른사람` → 마지막으로 보낸 시각. 재시작하면 비워진다. */
const lastInviteAt = new Map<string, number>();

/** 편성 옵션 입력을 쓰는 사용자. 쉼표로 구분한다. */
const OPERATOR_IDS = new Set(
  (process.env.OPERATOR_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);
/** 팝업 한 개에 칸이 5개까지라 팀은 4개까지만 고른다 */
const MAX_PIN_TEAMS = 4;
/** 선택 메뉴 하나에 넣을 수 있는 항목 수 */
const MAX_PIN_OPTIONS = 25;
/** 팝업을 닫고 제출하지 않았을 때 남은 정보를 지우는 시간 */
const PIN_TIMEOUT_MS = 15 * 60_000;

interface PinPick {
  userId: string;
  lobbyId: string;
  options: TeamOptions;
  excludeIds: Set<string>;
  teamCount: number;
  timer: NodeJS.Timeout;
}
/** 팝업이 열려 있는 편성. 키는 명령 interaction ID. 재시작하면 비워진다. */
const pinPicks = new Map<string, PinPick>();

/** 멘션은 이름으로만 보이고 알림은 가지 않게 한다. */
const NO_PINGS = { parse: [] } as const;

export async function handleInteraction(interaction: Interaction, service: SessionService): Promise<void> {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) await replyError(interaction, ERR.guildOnly);
    return;
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === COMMAND.ping) return handlePing(interaction, service);
    if (interaction.commandName === COMMAND.generate) return handleGenerate(interaction, service);
    if (interaction.commandName === COMMAND.assemble) return handleAssembleCommand(interaction, service);
    if (interaction.commandName === COMMAND.recruit) return handleRecruit(interaction);
    if (interaction.commandName === COMMAND.seek) return handleSeek(interaction);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith(SPLIT_PREFIX)) return handleSplit(interaction, service);
    if (interaction.customId.startsWith(ASSEMBLE_PREFIX)) return handleAssembleButton(interaction, service);
    if (interaction.customId.startsWith(END_PREFIX)) return handleEndButton(interaction, service);
    if (interaction.customId.startsWith(RECRUIT_PREFIX)) return handleRecruitButton(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(PIN_PREFIX)) {
    return handlePinSubmit(interaction, service);
  }
}

async function handlePing(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const health: HealthInput = {
    gatewayMs: Math.round(interaction.client.ws.ping),
    latencyMs: Math.max(0, Date.now() - interaction.createdTimestamp),
    uptimeMs: interaction.client.uptime,
    dbOk: service.isStoreHealthy(),
  };
  const problems = findProblems(health);
  log('ping', '-', problems.length === 0 ? 'ok' : problems.join(','));
  await interaction.reply({ content: formatPing(health) });
}

async function handleGenerate(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const lobby = interaction.member.voice.channel;
  if (!lobby) return replyError(interaction, ERR.notInVoice);
  if (lobby.type !== ChannelType.GuildVoice) return replyError(interaction, ERR.notGuildVoice);

  const team = interaction.options.getInteger(OPTION.team) ?? undefined;
  const number = interaction.options.getInteger(OPTION.number) ?? undefined;
  const excludeIds = parseMentions(interaction.options.getString(OPTION.exclude) ?? '');

  if (OPERATOR_IDS.has(interaction.user.id)) {
    const members = service.participants(lobby, excludeIds);
    const sizes = plannedSizes(members.size, { team, number });
    // 그냥 짜도 실패할 상황이면 평소 경로로 보내 같은 오류를 보여준다.
    if (members.size >= 2 && sizes.length > 0) {
      // 팝업을 못 띄우면 평소 경로로 짠다.
      if (await openPinPicker(interaction, lobby.id, { team, number }, excludeIds, members, sizes)) return;
    }
  }

  const outcome = service.generate(lobby, interaction.user.id, { team, number }, excludeIds);
  log('generate', outcome.ok ? outcome.session.id : '-', `lobby=${lobby.id}`, outcome.ok ? 'ok' : outcome.reason);
  if (!outcome.ok) return replyError(interaction, outcome.reason);

  await interaction.reply(draftReply(outcome, lobby.name));
}

function draftReply(outcome: Extract<GenerateOutcome, { ok: true }>, lobbyName: string) {
  return {
    content: formatDraft(outcome.session, lobbyName, outcome.unassigned, outcome.excluded),
    components: [buttonRow({ customId: SPLIT_PREFIX + outcome.session.id, label: BUTTON.split, style: ButtonStyle.Primary })],
    allowedMentions: NO_PINGS,
  };
}

/**
 * 팝업으로 팀별 편성 옵션을 받는다. 제출하면 그 응답으로 편성 결과를 올리고, 비워 제출하면 옵션 없이 짠다.
 * 팝업을 띄웠으면 true.
 */
async function openPinPicker(
  interaction: ChatInputCommandInteraction<'cached'>,
  lobbyId: string,
  options: TeamOptions,
  excludeIds: Set<string>,
  members: ReturnType<SessionService['participants']>,
  sizes: number[],
) {
  const id = interaction.id;
  const choices = [...members.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, MAX_PIN_OPTIONS)
    .map((m) => ({ label: truncate(m.displayName, 100), description: truncate(m.user.username, 100), value: m.id }));
  const teamCount = Math.min(sizes.length, MAX_PIN_TEAMS);
  const modal = new ModalBuilder()
    .setCustomId(PIN_PREFIX + id)
    .setTitle(MSG.pinTitle)
    .addLabelComponents(
      sizes.slice(0, teamCount).map((size, i) =>
        new LabelBuilder()
          .setLabel(MSG.pinTeam(i))
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId(`${PIN_PREFIX}${i}`)
              .setRequired(false)
              .setMinValues(0)
              .setMaxValues(Math.min(size, choices.length))
              .addOptions(choices),
          ),
      ),
    );

  const timer = setTimeout(() => pinPicks.delete(id), PIN_TIMEOUT_MS);
  pinPicks.set(id, { userId: interaction.user.id, lobbyId, options, excludeIds, teamCount, timer });
  try {
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    console.error('[generate] 옵션 입력 실패', error);
    clearTimeout(timer);
    pinPicks.delete(id);
    return false;
  }
}

async function handlePinSubmit(interaction: ModalSubmitInteraction<'cached'>, service: SessionService) {
  const id = interaction.customId.slice(PIN_PREFIX.length);
  const pick = pinPicks.get(id);
  // 팝업을 받은 사람이 아니거나 그새 목록에서 빠졌으면 끝난 요청으로 본다.
  if (!pick || pick.userId !== interaction.user.id || !OPERATOR_IDS.has(interaction.user.id)) {
    return replyError(interaction, ERR.stale);
  }
  clearTimeout(pick.timer);
  pinPicks.delete(id);

  const fixed = Array.from({ length: pick.teamCount }, (_, i) => [
    ...(interaction.fields.getStringSelectValues(`${PIN_PREFIX}${i}`) ?? []),
  ]);
  const lobby = interaction.guild.channels.cache.get(pick.lobbyId);
  const outcome: GenerateOutcome = lobby?.isVoiceBased()
    ? service.generate(lobby, interaction.user.id, pick.options, pick.excludeIds, fixed)
    : { ok: false, reason: ERR.lobbyGone };
  const pinned = fixed.flat().length;
  log(
    'generate',
    outcome.ok ? outcome.session.id : '-',
    `lobby=${pick.lobbyId}`,
    outcome.ok ? 'ok' : outcome.reason,
    ...(pinned > 0 ? [`fixed=${pinned}`] : []),
  );
  if (!outcome.ok) return replyError(interaction, outcome.reason);
  await interaction.reply(draftReply(outcome, lobby!.name));
}

/** 이모지처럼 두 칸짜리 글자가 반으로 잘리지 않게 글자 단위로 자른다. */
function truncate(text: string, max: number) {
  return Array.from(text).slice(0, max).join('');
}

async function handleSplit(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  await interaction.deferUpdate();
  const sessionId = interaction.customId.slice(SPLIT_PREFIX.length);
  const outcome = await service.split(interaction.guild, sessionId, interaction.user.id);
  log(
    'split',
    sessionId,
    `message=${interaction.message.id}`,
    outcome.ok ? `ok moved=${outcome.moved} notMoved=${outcome.notMoved.length} ms=${outcome.moveMs}` : outcome.reason,
  );
  if (!outcome.ok) {
    if (outcome.stale) await interaction.editReply({ components: [] });
    return followUpError(interaction, outcome.reason);
  }

  await interaction.editReply({
    content: formatSplit(outcome.session, outcome.lobbyName, outcome.notMoved),
    components: [
      buttonRow(
        { customId: ASSEMBLE_PREFIX + outcome.session.id, label: BUTTON.assemble, style: ButtonStyle.Success },
        { customId: END_PREFIX + outcome.session.id, label: BUTTON.end, style: ButtonStyle.Secondary },
      ),
    ],
    allowedMentions: NO_PINGS,
  });
}

async function handleAssembleButton(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  const session = service.getActive(interaction.customId.slice(ASSEMBLE_PREFIX.length));
  if (!session) {
    // 끝난 판의 버튼은 누르는 순간 지운다.
    await interaction.update({ components: [] });
    return followUpError(interaction, ERR.ended);
  }
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, ERR.notMember);
  }

  await interaction.deferUpdate();
  const outcome = await service.assemble(interaction.guild, session.id);
  log('assemble', session.id, outcome.ok ? `ok moved=${outcome.moved} ms=${outcome.moveMs}` : outcome.reason);
  if (!outcome.ok) return followUpError(interaction, outcome.reason);

  await interaction.editReply({
    content: fit((withHistory) =>
      withHistory ? `${interaction.message.content}\n\n${formatAssemble(outcome)}` : formatAssemble(outcome),
    ),
    components: [],
    allowedMentions: NO_PINGS,
  });
}

async function handleEndButton(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  const session = service.getActive(interaction.customId.slice(END_PREFIX.length));
  if (!session) {
    await interaction.update({ components: [] });
    return followUpError(interaction, ERR.ended);
  }
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, ERR.notMemberEnd);
  }

  await interaction.deferUpdate();
  const outcome = await service.end(interaction.guild, session.id);
  log('end', session.id, outcome.ok ? `ok kept=${outcome.keptChannels}` : outcome.reason);
  if (!outcome.ok) return followUpError(interaction, outcome.reason);

  await interaction.editReply({
    content: fit((withHistory) =>
      withHistory
        ? `${interaction.message.content}\n\n${MSG.ended(outcome.keptChannels)}`
        : MSG.ended(outcome.keptChannels),
    ),
    components: [],
    allowedMentions: NO_PINGS,
  });
}

async function handleAssembleCommand(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const session = service.findForAssemble(
    interaction.guildId,
    interaction.user.id,
    interaction.member.voice.channelId,
  );
  if (!session) return replyError(interaction, ERR.nothingToAssemble);
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, ERR.notMember);
  }

  await interaction.deferReply();
  const outcome = await service.assemble(interaction.guild, session.id);
  log('assemble', session.id, outcome.ok ? `ok moved=${outcome.moved} ms=${outcome.moveMs}` : outcome.reason);
  if (!outcome.ok) {
    await interaction.deleteReply().catch(() => undefined);
    return followUpError(interaction, outcome.reason);
  }
  await interaction.editReply({ content: formatAssemble(outcome), allowedMentions: NO_PINGS });
}

async function handleRecruit(interaction: ChatInputCommandInteraction<'cached'>) {
  const channel = interaction.member.voice.channel;
  if (!channel) return replyError(interaction, ERR.recruitNotInVoice);

  const category = interaction.options.getString(OPTION.category, true);
  const description = interaction.options.getString(OPTION.description) ?? undefined;
  log('recruit', '-', `channel=${channel.id}`, `category=${category}`);
  await interaction.reply({
    embeds: [
      buildRecruitEmbed({
        hostId: interaction.user.id,
        category,
        channelId: channel.id,
        memberCount: channel.members.size,
        userLimit: channel.userLimit,
        description,
      }),
    ],
    components: [linkRow(BUTTON.join, channel.url)],
    allowedMentions: NO_PINGS,
  });
}

async function handleSeek(interaction: ChatInputCommandInteraction<'cached'>) {
  const category = interaction.options.getString(OPTION.category, true);
  const description = interaction.options.getString(OPTION.description) ?? undefined;
  log('seek', '-', `category=${category}`);
  await interaction.reply({
    embeds: [buildSeekEmbed({ seekerId: interaction.user.id, category, description })],
    components: [
      buttonRow({ customId: RECRUIT_PREFIX + interaction.user.id, label: BUTTON.recruit, style: ButtonStyle.Primary }),
    ],
    allowedMentions: NO_PINGS,
  });
}

/** 구직글의 구인하기 — 누른 사람의 음성채널 초대링크를 구직자 DM으로 보낸다. */
export async function handleRecruitButton(interaction: ButtonInteraction<'cached'>) {
  const seekerId = interaction.customId.slice(RECRUIT_PREFIX.length);
  if (seekerId === interaction.user.id) return replyError(interaction, ERR.recruitSelf);
  const channel = interaction.member.voice.channel;
  if (!channel) return replyError(interaction, ERR.recruitNotInVoice);
  const key = `${seekerId}:${interaction.user.id}`;
  const now = Date.now();
  if (now - (lastInviteAt.get(key) ?? 0) < INVITE_COOLDOWN_MS) return replyError(interaction, ERR.inviteCooldown);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const link = await inviteLink(channel);
  const sent = await interaction.client.users
    .send(seekerId, {
      content: MSG.inviteDm(
        interaction.user.id,
        escapeMarkdown(channel.name),
        escapeMarkdown(interaction.guild.name),
      ),
      components: [linkRow(BUTTON.join, link)],
    })
    .then(
      () => true,
      () => false,
    );
  if (sent) lastInviteAt.set(key, now);
  log('invite', '-', `seeker=${seekerId}`, `channel=${channel.id}`, sent ? 'ok' : 'dmFailed');
  await interaction.editReply({ content: sent ? MSG.inviteSent(seekerId) : ERR.dmClosed, allowedMentions: NO_PINGS });
}

/** 초대 만들기 권한이 없으면 서버 멤버끼리 쓸 수 있는 채널 링크로 대신한다. */
export async function inviteLink(channel: VoiceBasedChannel): Promise<string> {
  try {
    const invite = await channel.createInvite({ maxAge: INVITE_MAX_AGE, unique: true });
    return invite.url;
  } catch (error) {
    console.warn(`초대링크 생성 실패, 채널 링크로 대신함 (channel=${channel.id})`, error);
    return channel.url;
  }
}

function log(action: string, sessionId: string, ...details: string[]) {
  console.log(`[${action} ${sessionId.slice(0, 8)}] ${details.join(' ')}`);
}

export async function replyError(interaction: RepliableInteraction, message: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

async function followUpError(interaction: RepliableInteraction, message: string) {
  await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
}

function buttonRow(...buttons: { customId: string; label: string; style: ButtonStyle }[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    buttons.map(({ customId, label, style }) =>
      new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style),
    ),
  );
}

function linkRow(label: string, url: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url),
  );
}

export function parseMentions(text: string): Set<string> {
  return new Set([...text.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]!));
}

/** 디스코드 메시지 최대 길이 */
const MAX_CONTENT = 2000;

const mentions = (ids: readonly string[]) => ids.map((id) => `<@${id}>`).join(' ');

/** 인원이 많아 2000자를 넘으면 멘션 목록을 빼고 인원 수만 보여준다. */
function fit(build: (withMembers: boolean) => string): string {
  const full = build(true);
  return full.length <= MAX_CONTENT ? full : build(false);
}

export function formatPing(health: HealthInput): string {
  const problems = findProblems(health);
  const lines = [problems.length === 0 ? MSG.pingOk : MSG.pingBad];
  for (const problem of problems) lines.push(`- ${MSG.pingProblem[problem]}`);
  lines.push(
    '',
    `${MSG.pingGateway(health.gatewayMs)} · ${MSG.pingLatency(health.latencyMs)}`,
    MSG.pingUptime(formatUptime(health.uptimeMs)),
    MSG.pingDb(health.dbOk),
  );
  return lines.join('\n');
}

export function formatDraft(session: Session, lobbyName: string, unassigned: string[], excluded: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : '');
    const lines = [MSG.draftTitle(lobbyName), ''];
    session.teams.forEach((team, i) => lines.push(`${MSG.team(i, team.length)}${list(team)}`));
    if (unassigned.length > 0) lines.push(`${MSG.unassigned(unassigned.length)}${list(unassigned)}`);
    if (excluded.length > 0) lines.push(`${MSG.excluded(excluded.length)}${list(excluded)}`);
    lines.push('', MSG.draftFooter(session.hostId));
    return lines.join('\n');
  });
}

export function formatSplit(session: Session, lobbyName: string, notMoved: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : ` ${ids.length}명`);
    const lines = [MSG.splitTitle(lobbyName), ''];
    // 팀 채널은 모으기 뒤 지워지므로 채널 멘션 대신 팀 이름으로 적는다.
    session.teams.forEach((team, i) =>
      lines.push(`${MSG.team(i, team.length)}${withMembers ? ` ${mentions(team)}` : ''}`),
    );
    if (notMoved.length > 0) lines.push('', `${MSG.notMoved}${list(notMoved)}`);
    lines.push('', MSG.splitFooter);
    return lines.join('\n');
  });
}

function formatAssemble(outcome: Extract<AssembleOutcome, { ok: true }>): string {
  const where = MSG.lobby(outcome.lobbyName, outcome.lobbyRecreated);
  if (outcome.keptChannels > 0) return MSG.assembledPartial(where, outcome.moved, outcome.keptChannels);
  const lines = [MSG.assembled(where, outcome.moved)];
  if (outcome.failed > 0) lines.push(MSG.assembleFailed(outcome.failed));
  return lines.join('\n');
}

export function buildRecruitEmbed(input: {
  hostId: string;
  category: string;
  channelId: string;
  memberCount: number;
  userLimit: number;
  description?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(RECRUIT_COLOR)
    .setTitle(MSG.recruitTitle)
    .setDescription(MSG.recruitBody(input.hostId))
    .addFields(
      { name: MSG.fieldCategory, value: input.category },
      { name: MSG.fieldChannel, value: `<#${input.channelId}>`, inline: true },
      { name: MSG.fieldMembers, value: MSG.memberCount(input.memberCount, input.userLimit), inline: true },
    );
  if (input.description) embed.addFields({ name: MSG.fieldDescription, value: input.description });
  return embed;
}

export function buildSeekEmbed(input: { seekerId: string; category: string; description?: string }): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(SEEK_COLOR)
    .setTitle(MSG.seekTitle)
    .setDescription(MSG.seekBody(input.seekerId))
    .addFields({ name: MSG.fieldCategory, value: input.category })
    .setFooter({ text: MSG.seekFooter });
  if (input.description) embed.addFields({ name: MSG.fieldDescription, value: input.description });
  return embed;
}
