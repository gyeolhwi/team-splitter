import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type SessionStatus = 'draft' | 'active';

export interface Session {
  id: string;
  guildId: string;
  lobbyId: string;
  hostId: string;
  participantIds: string[];
  teams: string[][];
  teamChannelIds: string[];
  status: SessionStatus;
  createdAt: number;
}

interface SessionRow {
  id: string;
  guild_id: string;
  lobby_id: string;
  host_id: string;
  participant_ids: string;
  teams: string;
  team_channel_ids: string;
  status: SessionStatus;
  created_at: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  guild_id         TEXT NOT NULL,
  lobby_id         TEXT NOT NULL,
  host_id          TEXT NOT NULL,
  participant_ids  TEXT NOT NULL,
  teams            TEXT NOT NULL,
  team_channel_ids TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL CHECK (status IN ('draft', 'active')),
  created_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_lobby
  ON sessions (guild_id, lobby_id) WHERE status = 'active';
`;

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    guildId: row.guild_id,
    lobbyId: row.lobby_id,
    hostId: row.host_id,
    participantIds: JSON.parse(row.participant_ids),
    teams: JSON.parse(row.teams),
    teamChannelIds: JSON.parse(row.team_channel_ids),
    status: row.status,
    createdAt: row.created_at,
  };
}

export class SessionStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  createDraft(session: Omit<Session, 'status' | 'teamChannelIds'>): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, guild_id, lobby_id, host_id, participant_ids, teams, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
      )
      .run(
        session.id,
        session.guildId,
        session.lobbyId,
        session.hostId,
        JSON.stringify(session.participantIds),
        JSON.stringify(session.teams),
        session.createdAt,
      );
  }

  get(id: string): Session | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row && toSession(row);
  }

  listActive(guildId?: string): Session[] {
    const rows = guildId
      ? this.db.prepare(`SELECT * FROM sessions WHERE status = 'active' AND guild_id = ?`).all(guildId)
      : this.db.prepare(`SELECT * FROM sessions WHERE status = 'active'`).all();
    return (rows as SessionRow[]).map(toSession);
  }

  /**
   * draft 를 active 로 바꾼다. 같은 로비에 이미 active 판이 있거나
   * 이미 다른 요청이 바꿔 놨으면 false. 동시에 눌러도 한쪽만 성공한다.
   */
  activate(id: string): boolean {
    try {
      return (
        this.db.prepare(`UPDATE sessions SET status = 'active' WHERE id = ? AND status = 'draft'`).run(id).changes ===
        1
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw error;
    }
  }

  /** split 이 도중에 실패했을 때 다시 누를 수 있게 되돌린다. */
  revertToDraft(id: string): void {
    this.db.prepare(`UPDATE sessions SET status = 'draft', team_channel_ids = '[]' WHERE id = ?`).run(id);
  }

  setTeamChannels(id: string, channelIds: string[]): void {
    this.db.prepare('UPDATE sessions SET team_channel_ids = ? WHERE id = ?').run(JSON.stringify(channelIds), id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  /** olderThan 보다 먼저 만든 draft 를 지우고 지운 개수를 돌려준다. */
  deleteDraftsBefore(olderThan: number): number {
    return this.db.prepare(`DELETE FROM sessions WHERE status = 'draft' AND created_at < ?`).run(olderThan).changes;
  }

  close(): void {
    this.db.close();
  }
}
