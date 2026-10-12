import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
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
  it('팀 채널 목록에서 하나를 빼고 남은 목록을 돌려준다', () => {
    draft('s1');
    store.setTeamChannels('s1', ['c1', 'c2']);
    expect(store.removeTeamChannel('s1', 'c1')).toEqual(['c2']);
    expect(store.get('s1')!.teamChannelIds).toEqual(['c2']);
    expect(store.removeTeamChannel('없음', 'c1')).toBeUndefined();
  });

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

describe('ended 상태', () => {
  it('ended 판은 같은 로비의 새 active 를 막지 않는다', () => {
    draft('s1');
    store.activate('s1');
    expect(store.end('s1')).toBe(true);
    draft('s2');
    expect(store.activate('s2')).toBe(true);
    expect(store.findActiveForLobby('guild1', 'lobby1')?.id).toBe('s2');
    expect(store.listWithChannels().map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(store.listActive().map((s) => s.id)).toEqual(['s2']);
  });

  it('active 가 아니면 end 는 false', () => {
    draft('s1');
    expect(store.end('s1')).toBe(false);
  });

  it('예전 스키마 DB 를 열면 데이터를 지키고 ended 를 쓸 수 있게 바꾼다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'teamgen-'));
    const path = join(dir, 'old.db');
    const old = new Database(path);
    old.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, lobby_id TEXT NOT NULL, host_id TEXT NOT NULL,
        participant_ids TEXT NOT NULL, teams TEXT NOT NULL, team_channel_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('draft', 'active')), created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX sessions_one_active_per_lobby ON sessions (guild_id, lobby_id) WHERE status = 'active';
      INSERT INTO sessions VALUES ('old', 'guild1', 'lobby1', 'host', '["a"]', '[["a"]]', '["c1"]', 'active', 1);
    `);
    old.close();

    const migrated = new SessionStore(path);
    try {
      expect(migrated.get('old')).toMatchObject({ status: 'active', teamChannelIds: ['c1'] });
      expect(migrated.end('old')).toBe(true);
      expect(migrated.get('old')!.status).toBe('ended');
    } finally {
      migrated.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
