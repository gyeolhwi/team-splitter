import type { Guild, VoiceState } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../src/services/session.js';
import { SessionStore } from '../src/store/db.js';

/** 테스트에 필요한 만큼만 흉내 낸 음성채널 */
function fakeChannel(memberCount: number, name = '팀') {
  return {
    name,
    members: { size: memberCount },
    setName: vi.fn(async () => undefined),
    isVoiceBased: () => true,
    delete: vi.fn(async () => undefined),
  };
}

type FakeChannel = ReturnType<typeof fakeChannel>;

let store: SessionStore;
let service: SessionService;
let channels: Map<string, FakeChannel>;
let guild: Guild;

function startSession(teamChannelIds: string[]) {
  store.createDraft({
    id: 's1',
    guildId: 'guild1',
    lobbyId: 'lobby',
    hostId: 'host',
    participantIds: ['a', 'b'],
    teams: teamChannelIds.map((_, i) => [`p${i}`]),
    createdAt: Date.now(),
  });
  store.activate('s1');
  store.setTeamChannels('s1', teamChannelIds);
}

/** 사람이 channelId 에서 나갔다 */
function leave(channelId: string, remaining: number) {
  channels.get(channelId)!.members.size = remaining;
  service.onVoiceStateUpdate({ channelId, guild } as unknown as VoiceState);
}

beforeEach(() => {
  vi.useFakeTimers();
  store = new SessionStore(':memory:');
  channels = new Map([
    ['t1', fakeChannel(2, '1팀')],
    ['t2', fakeChannel(2, '2팀')],
  ]);
  guild = { id: 'guild1', available: true, channels: { cache: channels } } as unknown as Guild;
  service = new SessionService(store, () => guild);
  startSession(['t1', 't2']);
});

afterEach(() => {
  service.stop();
  store.close();
  vi.useRealTimers();
});

describe('빈 팀 채널 정리', () => {
  it('한 채널이 비면 1분 뒤 그 채널만 지우고 판은 유지한다', async () => {
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(channels.get('t1')!.delete).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(channels.get('t1')!.delete).toHaveBeenCalledOnce();
    expect(channels.get('t2')!.delete).not.toHaveBeenCalled();
    expect(store.get('s1')).toMatchObject({ status: 'active', teamChannelIds: ['t2'] });
  });

  it('1분 안에 다시 들어오면 지우지 않는다', async () => {
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(30_000);
    channels.get('t1')!.members.size = 1;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(channels.get('t1')!.delete).not.toHaveBeenCalled();
    expect(store.get('s1')!.teamChannelIds).toEqual(['t1', 't2']);
  });

  it('남은 채널까지 모두 지우면 판을 끝낸다', async () => {
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(60_000);
    leave('t2', 0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channels.get('t2')!.delete).toHaveBeenCalledOnce();
    expect(store.get('s1')).toBeUndefined();
  });

  it('사람이 남아 있으면 나가는 이벤트가 와도 예약하지 않는다', async () => {
    leave('t1', 1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(channels.get('t1')!.delete).not.toHaveBeenCalled();
  });

  it('삭제에 실패하면 판에 남겨 둔다', async () => {
    channels.get('t1')!.delete.mockRejectedValueOnce(new Error('권한 없음'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.get('s1')!.teamChannelIds).toEqual(['t1', 't2']);
  });

  it('채널을 지우는 동안에는 모으기가 끼어들지 못한다', async () => {
    let finishDelete!: () => void;
    channels.get('t1')!.delete.mockImplementationOnce(() => new Promise<undefined>((r) => (finishDelete = () => r(undefined))));
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await service.assemble(guild, 's1')).toMatchObject({ ok: false });
    finishDelete();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get('s1')!.teamChannelIds).toEqual(['t2']);
  });

  it('재시작 점검 때 빈 채널과 사라진 채널을 정리한다', async () => {
    channels.get('t1')!.members.size = 0;
    channels.delete('t2');
    service.checkOnStartup();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.get('s1')).toBeUndefined();
  });
});

const ENDED_RETRY = 2_000;

describe('판 종료', () => {
  it('빈 채널은 바로 지우고 사람이 남은 채널은 (종료)를 붙여 남긴다', async () => {
    channels.get('t1')!.members.size = 0;
    expect(await service.end(guild, 's1')).toEqual({ ok: true, keptChannels: 1 });
    expect(channels.get('t1')!.delete).toHaveBeenCalledOnce();
    expect(channels.get('t2')!.delete).not.toHaveBeenCalled();
    expect(channels.get('t2')!.setName).toHaveBeenCalledWith('2팀 (종료)');
    expect(store.get('s1')).toMatchObject({ status: 'ended', teamChannelIds: ['t2'] });
  });

  it('모든 채널이 비어 있으면 판 기록까지 바로 지운다', async () => {
    channels.get('t1')!.members.size = 0;
    channels.get('t2')!.members.size = 0;
    await service.end(guild, 's1');
    expect(store.get('s1')).toBeUndefined();
  });

  it('끝난 판의 채널은 비는 즉시 지우고, 다 지우면 판 기록도 지운다', async () => {
    await service.end(guild, 's1');
    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(channels.get('t1')!.delete).toHaveBeenCalledOnce();
    expect(store.get('s1')).toMatchObject({ status: 'ended', teamChannelIds: ['t2'] });

    leave('t2', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(channels.get('t2')!.delete).toHaveBeenCalledOnce();
    expect(store.get('s1')).toBeUndefined();
  });

  it('끝난 판은 모으기·종료 대상이 아니다', async () => {
    await service.end(guild, 's1');
    expect(await service.assemble(guild, 's1')).toMatchObject({ ok: false });
    expect(await service.end(guild, 's1')).toMatchObject({ ok: false });
    expect(service.findForAssemble('guild1', 'host', null)).toBeUndefined();
  });

  it('종료 때 지우지 못한 빈 채널은 다시 시도해 지운다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    channels.get('t1')!.members.size = 0;
    channels.get('t1')!.delete.mockRejectedValueOnce(new Error('일시 오류'));
    await service.end(guild, 's1');
    await vi.advanceTimersByTimeAsync(ENDED_RETRY);
    expect(channels.get('t1')!.delete).toHaveBeenCalledTimes(2);
    expect(store.get('s1')!.teamChannelIds).toEqual(['t2']);
  });

  it('끝난 판의 오래된 분배 버튼은 지금 판을 건드리지 않는다', async () => {
    await service.end(guild, 's1');
    expect(await service.split(guild, 's1', 'host')).toMatchObject({ ok: false, stale: true });
  });

  it('재시작 점검 때 끝난 판의 빈 채널은 바로 지운다', async () => {
    await service.end(guild, 's1');
    channels.get('t1')!.members.size = 0;
    service.checkOnStartup();
    await vi.advanceTimersByTimeAsync(0);
    expect(channels.get('t1')!.delete).toHaveBeenCalledOnce();
  });

  it('이전 판이 남은 로비에서 팀 분배를 누르면 이전 판을 끝내고 새 판을 시작한다', async () => {
    const lobby = { id: 'lobby', name: '로비', parentId: null, isVoiceBased: () => true };
    let created = 0;
    Object.assign(guild.channels, {
      fetch: async (id: string) => (id === 'lobby' ? lobby : null),
      create: vi.fn(async () => ({ id: `new${++created}` })),
    });
    Object.assign(guild, { voiceStates: { cache: new Map() } });
    store.createDraft({
      id: 's2',
      guildId: 'guild1',
      lobbyId: 'lobby',
      hostId: 'host',
      participantIds: ['a', 'b'],
      teams: [['a'], ['b']],
      createdAt: Date.now(),
    });

    expect(await service.split(guild, 's2', 'host')).toMatchObject({ ok: true });
    expect(store.get('s1')).toMatchObject({ status: 'ended' });
    expect(store.get('s2')).toMatchObject({ status: 'active', teamChannelIds: ['new1', 'new2'] });
  });

  it('팀 채널에서도 팀을 짤 수 있다 — 진행 중인 판과 끝난 판 모두', async () => {
    const inChannel = (id: string) =>
      ({ id, guild, members: [{ id: 'a', user: { bot: false } }, { id: 'b', user: { bot: false } }] }) as never;
    expect(service.generate(inChannel('t1'), 'host', { team: 2 }, new Set())).toMatchObject({ ok: true });
    await service.end(guild, 's1');
    expect(service.generate(inChannel('t2'), 'host', { team: 2 }, new Set())).toMatchObject({ ok: true });
  });

  it('팀 채널에서 팀 분배를 누르면 그 채널의 이전 판을 끝내고, 비면 바로 지운다', async () => {
    const t1 = { id: 't1', name: '1팀', parentId: null, isVoiceBased: () => true };
    let created = 0;
    Object.assign(guild.channels, {
      fetch: async (id: string) => (id === 't1' ? t1 : null),
      create: vi.fn(async () => ({ id: `new${++created}` })),
    });
    Object.assign(guild, { voiceStates: { cache: new Map() } });
    store.createDraft({
      id: 's2',
      guildId: 'guild1',
      lobbyId: 't1',
      hostId: 'host',
      participantIds: ['a', 'b'],
      teams: [['a'], ['b']],
      createdAt: Date.now(),
    });

    expect(await service.split(guild, 's2', 'host')).toMatchObject({ ok: true });
    expect(store.get('s1')).toMatchObject({ status: 'ended', teamChannelIds: ['t1', 't2'] });
    expect(store.get('s2')).toMatchObject({ status: 'active', teamChannelIds: ['new1', 'new2'] });

    leave('t1', 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(channels.get('t1')!.delete).toHaveBeenCalledOnce();
    expect(store.get('s1')).toMatchObject({ teamChannelIds: ['t2'] });
  });
});
