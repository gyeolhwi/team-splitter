import { Collection, type VoiceBasedChannel } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ERR } from '../src/messages.js';
import { SessionService } from '../src/services/session.js';
import { SessionStore } from '../src/store/db.js';

/** 테스트에 필요한 만큼만 흉내 낸 로비 */
function fakeLobby(ids: string[]) {
  const members = new Collection(ids.map((id) => [id, { id, user: { bot: false } }] as const));
  return { id: 'lobby', guild: { id: 'guild1' }, members } as unknown as VoiceBasedChannel;
}

let store: SessionStore;
let service: SessionService;

beforeEach(() => {
  store = new SessionStore(':memory:');
  service = new SessionService(store, () => undefined);
});

afterEach(() => {
  service.stop();
  store.close();
});

const lobby = fakeLobby(['a', 'b', 'c', 'd', 'e', 'f']);

describe('generate fixed', () => {
  it('고정한 사람을 해당 팀에 넣어 저장한다', () => {
    const outcome = service.generate(lobby, 'host', { team: 2 }, new Set(), [['a', 'b'], ['c']]);
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.session.teams[0]).toEqual(expect.arrayContaining(['a', 'b']));
    expect(outcome.session.teams[1]).toContain('c');
    expect(store.get(outcome.session.id)!.teams).toEqual(outcome.session.teams);
  });

  it('로비에 없거나 제외한 사람은 무시한다', () => {
    const outcome = service.generate(lobby, 'host', { team: 2 }, new Set(['a']), [['a', 'zz']]);
    expect(outcome.ok).toBe(true);
  });

  it('한 사람을 두 팀에 넣으면 막는다', () => {
    expect(service.generate(lobby, 'host', { team: 2 }, new Set(), [['a'], ['a']])).toEqual({
      ok: false,
      reason: ERR.pinDuplicate,
    });
  });

  it('팀 크기보다 많이 넣으면 막는다', () => {
    const outcome = service.generate(lobby, 'host', { team: 3 }, new Set(), [['a', 'b', 'c']]);
    expect(outcome).toEqual({ ok: false, reason: ERR.pinOverfull(0, 2) });
  });

  it('그새 인원이 줄어 없어진 팀에 넣었으면 다시 짜라고 한다', () => {
    // 6명 인원수:3 → 2팀이었다가 3명이 남아 1팀이 된 상황
    const outcome = service.generate(fakeLobby(['a', 'b', 'c']), 'host', { number: 3 }, new Set(), [[], ['a']]);
    expect(outcome).toEqual({ ok: false, reason: ERR.pinChanged });
  });
});
