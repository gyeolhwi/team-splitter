import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/store/db.js';

let store: SessionStore;

function draft(id: string, lobbyId = 'lobby1', createdAt = 1000) {
  store.createDraft({
    id,
    guildId: 'guild1',
    lobbyId,
    hostId: 'host',
    participantIds: ['a', 'b'],
    teams: [['a'], ['b']],
    createdAt,
  });
}

beforeEach(() => {
  store = new SessionStore(':memory:');
});

afterEach(() => {
  store.close();
});

describe('SessionStore', () => {
  it('열려 있으면 정상, 닫히면 이상으로 점검된다', () => {
    expect(store.isHealthy()).toBe(true);
    const closed = new SessionStore(':memory:');
    closed.close();
    expect(closed.isHealthy()).toBe(false);
  });

  it('draft 를 저장하고 그대로 읽는다', () => {
    draft('s1');
    expect(store.get('s1')).toMatchObject({
      status: 'draft',
      participantIds: ['a', 'b'],
      teams: [['a'], ['b']],
      teamChannelIds: [],
    });
  });

  it('같은 로비에는 active 판이 하나만 생긴다', () => {
    draft('s1');
    draft('s2');
    expect(store.activate('s1')).toBe(true);
    expect(store.activate('s2')).toBe(false);
    expect(store.get('s2')?.status).toBe('draft');
  });

  it('다른 로비는 동시에 active 가 될 수 있다', () => {
    draft('s1', 'lobby1');
    draft('s2', 'lobby2');
    expect(store.activate('s1')).toBe(true);
    expect(store.activate('s2')).toBe(true);
    expect(store.listActive('guild1')).toHaveLength(2);
  });

  it('같은 판을 두 번 activate 하면 두 번째는 실패한다', () => {
    draft('s1');
    expect(store.activate('s1')).toBe(true);
    expect(store.activate('s1')).toBe(false);
  });

  it('revertToDraft 뒤에는 다시 activate 할 수 있다', () => {
    draft('s1');
    store.activate('s1');
    store.setTeamChannels('s1', ['c1']);
    store.revertToDraft('s1');
    expect(store.get('s1')).toMatchObject({ status: 'draft', teamChannelIds: [] });
    expect(store.activate('s1')).toBe(true);
  });

  it('같은 로비의 draft 만 지우고 active 는 남긴다', () => {
    draft('a', 'lobby1');
    draft('b', 'lobby1');
    draft('c', 'lobby2');
    store.activate('a');
    store.deleteDraftsForLobby('guild1', 'lobby1');
    expect(store.get('a')?.status).toBe('active');
    expect(store.get('b')).toBeUndefined();
    expect(store.get('c')).toBeDefined();
  });

  it('오래된 draft 만 지운다', () => {
    draft('old', 'lobby1', 100);
    draft('new', 'lobby2', 5000);
    draft('active-old', 'lobby3', 100);
    store.activate('active-old');
    expect(store.deleteDraftsBefore(1000)).toBe(1);
    expect(store.get('old')).toBeUndefined();
    expect(store.get('new')).toBeDefined();
    expect(store.get('active-old')).toBeDefined();
  });
});
