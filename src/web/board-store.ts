import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { User } from './auth.js';

export const POST_STATUSES = ['open', 'doing', 'done', 'rejected'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const STATUS_LABEL: Record<PostStatus, string> = {
  open: '접수',
  doing: '진행중',
  done: '완료',
  rejected: '반려',
};
export const isPostStatus = (value: unknown): value is PostStatus =>
  POST_STATUSES.includes(value as PostStatus);

export interface Post {
  id: number;
  title: string;
  body: string;
  status: PostStatus;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  createdAt: number;
  updatedAt: number;
  commentCount: number;
}

export interface Comment {
  id: number;
  postId: number;
  body: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done', 'rejected')),
  author_id     TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  author_avatar TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  author_avatar TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_by_post ON comments (post_id);
`;

const POST_COLUMNS = `
  p.id, p.title, p.body, p.status, p.author_id AS authorId, p.author_name AS authorName,
  p.author_avatar AS authorAvatar, p.created_at AS createdAt, p.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount`;

export class BoardStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  listPosts(): Post[] {
    return this.db.prepare(`SELECT ${POST_COLUMNS} FROM posts p ORDER BY p.id DESC`).all() as Post[];
  }

  getPost(id: number): Post | undefined {
    return this.db.prepare(`SELECT ${POST_COLUMNS} FROM posts p WHERE p.id = ?`).get(id) as Post | undefined;
  }

  createPost(author: User, title: string, body: string, now = Date.now()): number {
    const info = this.db
      .prepare(
        `INSERT INTO posts (title, body, author_id, author_name, author_avatar, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(title, body, author.id, author.name, author.avatar, now, now);
    return Number(info.lastInsertRowid);
  }

  updatePost(id: number, title: string, body: string, now = Date.now()): void {
    this.db.prepare('UPDATE posts SET title = ?, body = ?, updated_at = ? WHERE id = ?').run(title, body, now, id);
  }

  setStatus(id: number, status: PostStatus): void {
    this.db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(status, id);
  }

  deletePost(id: number): void {
    this.db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }

  listComments(postId: number): Comment[] {
    return this.db
      .prepare(
        `SELECT id, post_id AS postId, body, author_id AS authorId, author_name AS authorName,
                author_avatar AS authorAvatar, created_at AS createdAt
         FROM comments WHERE post_id = ? ORDER BY id`,
      )
      .all(postId) as Comment[];
  }

  addComment(postId: number, author: User, body: string, now = Date.now()): number {
    const info = this.db
      .prepare(
        `INSERT INTO comments (post_id, body, author_id, author_name, author_avatar, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(postId, body, author.id, author.name, author.avatar, now);
    return Number(info.lastInsertRowid);
  }

  close(): void {
    this.db.close();
  }
}
