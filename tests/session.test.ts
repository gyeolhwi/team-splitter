import type { Guild, VoiceState } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../src/services/session.js';
import { SessionStore } from '../src/store/db.js';

/** 테스트에 필요한 만큼만 흉내 낸 음성채널 */
function fakeChannel(memberCount: number) {
  return {
    members: { size: memberCount },
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
    ['t1', fakeChannel(2)],
    ['t2', fakeChannel(2)],
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
