import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  canDeletePost,
  canEditPost,
  checkCsrf,
  csrfToken,
  isAdmin,
  isAllowed,
  randomState,
  SESSION_TTL_MS,
  signSession,
  verifySession,
  type Roles,
  type User,
} from './auth.js';
import { isPostStatus, STATUS_LABEL, type BoardStore } from './board-store.js';
import { BODY_MAX, COMMENT_MAX, detailPage, formPage, listPage, messagePage, STATUS_SCRIPT, TITLE_MAX } from './html.js';
import type { Notify } from './notify.js';

const DISCORD = 'https://discord.com';
const MAX_FORM_BYTES = 32 * 1024;
const SESSION_COOKIE = 'sid';
const STATE_COOKIE = 'oauth_state';
const DENIED = '이 Discord 계정은 아직 허용 목록에 없습니다. 관리자에게 Discord ID를 추가해 달라고 요청하세요.';
/** 헤더 로고. Docker 이미지의 WORKDIR(/app) 기준 경로 */
const LOGO_PATH = 'assets/persona/thumb-256.png';

export interface BoardConfig extends Roles {
  /** 예: https://team-splitter.hwiii.com (끝 슬래시 없음) */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
}

const STATUS_SCRIPT_HASH = createHash('sha256').update(STATUS_SCRIPT).digest('base64');

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    `default-src 'none'; script-src 'sha256-${STATUS_SCRIPT_HASH}'; style-src 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_FORM_BYTES) throw new HttpError(413, '내용이 너무 깁니다.');
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function text(form: URLSearchParams, name: string, max: number, label: string): string {
  const value = (form.get(name) ?? '').trim();
  if (!value) throw new HttpError(400, `${label}을(를) 입력해 주세요.`);
  if (value.length > max) throw new HttpError(400, `${label}은(는) ${max}자까지 쓸 수 있습니다.`);
  return value;
}

function avatarUrl(id: string, hash: string | null): string {
  return hash
    ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

export function createBoardServer(
  cfg: BoardConfig,
  store: BoardStore,
  notify: Notify,
  fetchFn: typeof fetch = fetch,
): Server {
  const secure = cfg.baseUrl.startsWith('https://');
  const redirectUri = `${cfg.baseUrl}/auth/callback`;
  let logo: Buffer | undefined;
  try {
    logo = readFileSync(LOGO_PATH);
  } catch {
    console.warn(`로고 파일이 없어 헤더 로고를 비웁니다: ${LOGO_PATH}`);
  }

  function cookie(name: string, value: string, maxAgeSec: number): string {
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
  }

  function send(res: ServerResponse, status: number, html: string, extra: Record<string, string | string[]> = {}) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra });
    res.end(html);
  }

  function redirect(res: ServerResponse, location: string, setCookie?: string[]) {
    res.writeHead(303, { Location: location, ...SECURITY_HEADERS, ...(setCookie ? { 'Set-Cookie': setCookie } : {}) });
    res.end();
  }

  function startLogin(res: ServerResponse) {
    const state = randomState();
    const url = new URL('/oauth2/authorize', DISCORD);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      scope: 'identify',
      redirect_uri: redirectUri,
      state,
    }).toString();
    redirect(res, url.toString(), [cookie(STATE_COOKIE, state, 600)]);
  }

  async function callback(url: URL, cookies: Record<string, string>, res: ServerResponse) {
    if (url.searchParams.has('error')) {
      throw new HttpError(400, 'Discord 로그인이 취소됐습니다. 다시 시도해 주세요.');
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || state !== cookies[STATE_COOKIE]) {
      throw new HttpError(400, '로그인 요청이 만료됐습니다. 다시 시도해 주세요.');
    }
    const tokenRes = await fetchFn(`${DISCORD}/api/v10/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new HttpError(502, 'Discord 로그인에 실패했습니다.');
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const meRes = await fetchFn(`${DISCORD}/api/v10/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!meRes.ok) throw new HttpError(502, 'Discord 사용자 정보를 받지 못했습니다.');
    const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null; avatar: string | null };

    const clearState = cookie(STATE_COOKIE, '', 0);
    if (!isAllowed(cfg, me.id)) {
      console.warn(`게시판 진입 거부: ${me.id}`);
      return send(res, 403, messagePage('접근 권한이 없습니다', DENIED), {
        'Set-Cookie': clearState,
      });
    }
    const user: User = { id: me.id, name: me.global_name || me.username, avatar: avatarUrl(me.id, me.avatar) };
    redirect(res, '/', [clearState, cookie(SESSION_COOKIE, signSession(cfg.sessionSecret, user), SESSION_TTL_MS / 1000)]);
  }

  function postOr404(idText: string) {
    const post = store.getPost(Number(idText));
    if (!post) throw new HttpError(404, '글을 찾을 수 없습니다.');
    return post;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const cookies = parseCookies(req.headers.cookie);

    if (method === 'GET' && path === '/logo.png' && logo) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', ...SECURITY_HEADERS });
      return res.end(logo);
    }
    if (method === 'GET' && path === '/login') return startLogin(res);
    if (method === 'GET' && path === '/auth/callback') return callback(url, cookies, res);
    if (method === 'GET' && path === '/logged-out') {
      return send(res, 200, messagePage('로그아웃했습니다', '다시 들어오려면 로그인해 주세요.', { href: '/login', label: 'Discord로 로그인' }));
    }

    const sid = cookies[SESSION_COOKIE] ?? '';
    const user = verifySession(cfg.sessionSecret, sid);
    if (!user) {
      if (method === 'GET') return redirect(res, '/login');
      throw new HttpError(401, '로그인이 필요합니다.');
    }
    // 목록에서 빠진 사람은 쿠키가 남아 있어도 막는다
    if (!isAllowed(cfg, user.id)) throw new HttpError(403, DENIED);
    const who = { user, csrf: csrfToken(cfg.sessionSecret, sid) };

    if (method === 'GET') {
      if (path === '/') return send(res, 200, listPage(who, store.listPosts()));
      if (path === '/new') return send(res, 200, formPage(who));
      const detail = path.match(/^\/posts\/(\d+)$/);
      if (detail) {
        const post = postOr404(detail[1]!);
        return send(
          res,
          200,
          detailPage(who, post, store.listComments(post.id), {
            edit: canEditPost(user.id, post.authorId),
            remove: canDeletePost(cfg, user.id, post.authorId),
            setStatus: isAdmin(cfg, user.id),
          }),
        );
      }
      const edit = path.match(/^\/posts\/(\d+)\/edit$/);
      if (edit) {
        const post = postOr404(edit[1]!);
        if (!canEditPost(user.id, post.authorId)) throw new HttpError(403, '본인 글만 수정할 수 있습니다.');
        return send(res, 200, formPage(who, post));
      }
      throw new HttpError(404, '페이지를 찾을 수 없습니다.');
    }

    if (method !== 'POST') throw new HttpError(405, '지원하지 않는 요청입니다.');
    const form = await readForm(req);
    if (!checkCsrf(cfg.sessionSecret, sid, form.get('_csrf'))) {
      throw new HttpError(403, '요청이 만료됐습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }

    if (path === '/logout') return redirect(res, '/logged-out', [cookie(SESSION_COOKIE, '', 0)]);

    if (path === '/posts') {
      const title = text(form, 'title', TITLE_MAX, '제목');
      const body = text(form, 'body', BODY_MAX, '내용');
      const id = store.createPost(user, title, body);
      if (!isAdmin(cfg, user.id)) notify(`📮 새 건의 — ${title}\n작성: ${user.name}\n${cfg.baseUrl}/posts/${id}`);
      return redirect(res, `/posts/${id}`);
    }

    const action = path.match(/^\/posts\/(\d+)\/(edit|delete|status|comments)$/);
    if (!action) throw new HttpError(404, '페이지를 찾을 수 없습니다.');
    const post = postOr404(action[1]!);
    switch (action[2]) {
      case 'edit': {
        if (!canEditPost(user.id, post.authorId)) throw new HttpError(403, '본인 글만 수정할 수 있습니다.');
        store.updatePost(post.id, text(form, 'title', TITLE_MAX, '제목'), text(form, 'body', BODY_MAX, '내용'));
        return redirect(res, `/posts/${post.id}`);
      }
      case 'delete': {
        if (!canDeletePost(cfg, user.id, post.authorId)) throw new HttpError(403, '본인 글만 삭제할 수 있습니다.');
        store.deletePost(post.id);
        return redirect(res, '/');
      }
      case 'status': {
        if (!isAdmin(cfg, user.id)) throw new HttpError(403, '처리 상태는 관리자만 바꿀 수 있습니다.');
        const status = form.get('status');
        if (!isPostStatus(status)) throw new HttpError(400, '알 수 없는 상태입니다.');
        store.setStatus(post.id, status);
        return redirect(res, `/posts/${post.id}`);
      }
      default: {
        const body = text(form, 'body', COMMENT_MAX, '댓글');
        const commentId = store.addComment(post.id, user, body);
        if (!isAdmin(cfg, user.id)) {
          notify(`💬 새 댓글 — ${post.title} [${STATUS_LABEL[post.status]}]\n작성: ${user.name}\n${cfg.baseUrl}/posts/${post.id}#c${commentId}`);
        }
        return redirect(res, `/posts/${post.id}#c${commentId}`);
      }
    }
  }

  return createServer((req, res) => {
    handle(req, res).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error('게시판 요청 처리 실패', error);
      if (res.headersSent) return res.end();
      const message = error instanceof HttpError ? error.message : '잠시 후 다시 시도해 주세요.';
      send(res, status, messagePage(status === 403 ? '접근 권한이 없습니다' : '요청을 처리하지 못했습니다', message,
        // 허용 목록 밖이면 처음으로 가도 같은 화면이라 링크를 뺀다
        message === DENIED ? undefined : { href: '/', label: '처음으로' }));
    });
  });
}
