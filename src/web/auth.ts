import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface User {
  id: string;
  name: string;
  /** 아바타 이미지 전체 URL */
  avatar: string;
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

/** 쉼표로 구분한 Discord ID 목록 */
export function parseIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** DB 없이 쓰는 서명 쿠키. 내용은 보이지만 위조할 수 없다. */
export function signSession(secret: string, user: User, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: now + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(secret: string, token: string | undefined, now = Date.now()): User | null {
  const [payload, sig, extra] = (token ?? '').split('.');
  if (!payload || !sig || extra !== undefined || !safeEqual(sig, hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || data.exp < now || typeof data.id !== 'string') return null;
    return { id: data.id, name: String(data.name), avatar: String(data.avatar) };
  } catch {
    return null;
  }
}

/** 세션 쿠키에서 파생한 폼 토큰. 다른 사이트는 쿠키 값을 모르니 만들 수 없다. */
export function csrfToken(secret: string, sessionToken: string): string {
  return hmac(secret, `csrf:${sessionToken}`);
}

export function checkCsrf(secret: string, sessionToken: string, given: unknown): boolean {
  return typeof given === 'string' && safeEqual(given, csrfToken(secret, sessionToken));
}

export function randomState(): string {
  return randomBytes(16).toString('base64url');
}

export interface Roles {
  allowedIds: Set<string>;
  adminId: string;
}

export const isAdmin = (roles: Roles, userId: string) => userId === roles.adminId;
export const isAllowed = (roles: Roles, userId: string) => roles.allowedIds.has(userId) || isAdmin(roles, userId);
export const canEditPost = (userId: string, authorId: string) => userId === authorId;
export const canDeletePost = (roles: Roles, userId: string, authorId: string) =>
  userId === authorId || isAdmin(roles, userId);
