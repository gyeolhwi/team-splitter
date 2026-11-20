import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrfToken, parseIds, signSession, verifySession, type User } from '../src/web/auth.js';
import { BoardStore } from '../src/web/board-store.js';
import { esc } from '../src/web/html.js';
import { discordDm } from '../src/web/notify.js';
import { createBoardServer, type BoardConfig } from '../src/web/server.js';

const SECRET = 'x'.repeat(32);
const admin: User = { id: '100', name: '관리자', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
const alice: User = { id: '200', name: '앨리스', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
const bob: User = { id: '300', name: '밥', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
const stranger: User = { id: '999', name: '외부인', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };

describe('auth', () => {
  it('서명한 세션만 통과하고 위조·만료는 거부한다', () => {
    const token = signSession(SECRET, alice, 0);
    expect(verifySession(SECRET, token, 1)).toEqual(alice);
    expect(verifySession('y'.repeat(32), token, 1)).toBeNull();
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...admin, exp: 9e15 })).toString('base64url');
    expect(verifySession(SECRET, `${forged}.${sig}`, 1)).toBeNull();
    expect(verifySession(SECRET, `${payload}.${sig}`, 8 * 24 * 60 * 60_000)).toBeNull();
    expect(verifySession(SECRET, undefined)).toBeNull();
  });

  it('ID 목록을 쉼표로 나눈다', () => {
    expect([...parseIds(' 1, 2,,3 ')]).toEqual(['1', '2', '3']);
    expect(parseIds(undefined).size).toBe(0);
  });

  it('HTML 특수문자를 이스케이프한다', () => {
    expect(esc(`<script>"'&`)).toBe('&lt;script&gt;&quot;&#39;&amp;');
  });
});

describe('discordDm', () => {
  it('DM 채널을 한 번만 열고 메시지를 보낸다', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) =>
      Response.json(String(url).endsWith('/users/@me/channels') ? { id: 'dm1' } : {}),
    );
    const notify = discordDm('token', '100', fetchFn as typeof fetch);
    notify('하나');
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    notify('둘');
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3));
    expect(String(fetchFn.mock.calls[2]![0])).toContain('/channels/dm1/messages');
  });
});

describe('board server', () => {
  let store: BoardStore;
  let server: Server;
  let base: string;
  let notify: ReturnType<typeof vi.fn<(text: string) => void>>;
  let fetchFn: ReturnType<typeof vi.fn>;
  const cfg: BoardConfig = {
    baseUrl: 'http://localhost',
    clientId: 'client',
    clientSecret: 'secret',
    sessionSecret: SECRET,
    adminId: admin.id,
    allowedIds: new Set([alice.id, bob.id]),
  };

  beforeEach(async () => {
    store = new BoardStore(':memory:');
    notify = vi.fn<(text: string) => void>();
    fetchFn = vi.fn();
    server = createBoardServer(cfg, store, notify, fetchFn as unknown as typeof fetch);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });

  const sid = (user: User) => signSession(SECRET, user);
  const get = (path: string, user?: User) =>
    fetch(base + path, { redirect: 'manual', headers: user ? { cookie: `sid=${sid(user)}` } : {} });
  function post(path: string, user: User, fields: Record<string, string>, csrf = true) {
    const token = sid(user);
    const body = new URLSearchParams({ ...(csrf ? { _csrf: csrfToken(SECRET, token) } : {}), ...fields });
    return fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: `sid=${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  it('로그인 안 한 접속은 Discord 로그인으로 보낸다', async () => {
    const res = await get('/');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
    const login = await get('/login');
    expect(login.headers.get('location')).toMatch(/^https:\/\/discord\.com\/oauth2\/authorize\?.*scope=identify/);
    expect(login.headers.get('set-cookie')).toMatch(/oauth_state=.*HttpOnly; SameSite=Lax/);
  });

  function mockDiscordUser(id: string) {
    fetchFn.mockImplementation(async (url: string) =>
      url.endsWith('/oauth2/token')
        ? Response.json({ access_token: 'at' })
        : Response.json({ id, username: 'user', global_name: '표시이름', avatar: null }),
    );
  }

  it('허용 목록 밖 계정은 콜백에서 403, 허용 계정은 세션을 받는다', async () => {
    const callback = (state: string) =>
      fetch(`${base}/auth/callback?code=c&state=${state}`, { redirect: 'manual', headers: { cookie: `oauth_state=${state}` } });

    mockDiscordUser(stranger.id);
    const denied = await callback('s1');
    expect(denied.status).toBe(403);
    expect(denied.headers.get('set-cookie')).not.toContain('sid=');

    mockDiscordUser(alice.id);
    const ok = await callback('s2');
    expect(ok.status).toBe(303);
    const cookie = ok.headers.get('set-cookie')!;
    const token = decodeURIComponent(cookie.match(/sid=([^;]+)/)![1]!);
    expect(verifySession(SECRET, token)?.name).toBe('표시이름');
  });

  it('state 가 맞지 않으면 콜백을 거부한다', async () => {
    const res = await fetch(`${base}/auth/callback?code=c&state=a`, { redirect: 'manual', headers: { cookie: 'oauth_state=b' } });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('Discord 가 오류로 돌려보내면 토큰 교환 없이 안내한다', async () => {
    const res = await fetch(`${base}/auth/callback?error=access_denied&state=a`, { redirect: 'manual', headers: { cookie: 'oauth_state=a' } });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('로그인이 취소됐습니다');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('목록에서 빠진 계정은 쿠키가 남아 있어도 403', async () => {
    expect((await get('/', stranger)).status).toBe(403);
  });

  it('글·댓글을 쓰고 이스케이프해서 보여 주며 관리자에게 알린다', async () => {
    const created = await post('/posts', alice, { title: '<b>건의</b>', body: '내용' });
    expect(created.status).toBe(303);
    const path = created.headers.get('location')!;
    await post(`${path}/comments`, bob, { body: '동의합니다' });
    const html = await (await get(path, alice)).text();
    expect(html).toContain('&lt;b&gt;건의&lt;/b&gt;');
    expect(html).not.toContain('<b>건의</b>');
    expect(html).toContain('동의합니다');
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('CSRF 토큰이 없으면 POST 를 막는다', async () => {
    const res = await post('/posts', alice, { title: 't', body: 'b' }, false);
    expect(res.status).toBe(403);
    expect(store.listPosts()).toHaveLength(0);
  });

  it('상태 변경은 관리자만, 수정은 본인만, 삭제는 본인과 관리자만', async () => {
    const id = store.createPost(alice, '제목', '내용');

    expect((await post(`/posts/${id}/status`, alice, { status: 'done' })).status).toBe(403);
    expect((await post(`/posts/${id}/status`, admin, { status: 'nope' })).status).toBe(400);
    expect((await post(`/posts/${id}/status`, admin, { status: 'done' })).status).toBe(303);
    expect(store.getPost(id)?.status).toBe('done');

    expect((await post(`/posts/${id}/edit`, bob, { title: '해킹', body: 'x' })).status).toBe(403);
    expect((await post(`/posts/${id}/edit`, admin, { title: '해킹', body: 'x' })).status).toBe(403);
    expect((await post(`/posts/${id}/edit`, alice, { title: '새 제목', body: '새 내용' })).status).toBe(303);
    expect(store.getPost(id)?.title).toBe('새 제목');

    expect((await post(`/posts/${id}/delete`, bob, {})).status).toBe(403);
    expect((await post(`/posts/${id}/delete`, admin, {})).status).toBe(303);
    expect(store.getPost(id)).toBeUndefined();
  });

  it('빈 제목과 너무 긴 본문을 거부한다', async () => {
    expect((await post('/posts', alice, { title: '  ', body: 'b' })).status).toBe(400);
    expect((await post('/posts', alice, { title: 't', body: 'b'.repeat(5001) })).status).toBe(400);
  });

  it('관리자 상세에는 누르면 바로 저장되는 상태 버튼 4개가 있고 스크립트는 없다', async () => {
    const id = store.createPost(alice, '제목', '내용');
    const res = await get(`/posts/${id}`, admin);
    const html = await res.text();
    expect(html.match(/name="status" value="/g)).toHaveLength(4);
    expect(html).toContain('value="open" aria-pressed="true"');
    expect(html).toContain('role="group" aria-label="처리 상태"');
    expect(html).not.toContain('<script');
    expect(res.headers.get('content-security-policy')).not.toContain('script-src');
  });

  it('상태 탭으로 목록을 거르고 상태별 개수를 보여 준다', async () => {
    store.setStatus(store.createPost(alice, '끝난 건의', '내용'), 'done');
    store.createPost(bob, '새 건의', '내용');
    const html = await (await get('/?status=done', alice)).text();
    expect(html).toContain('끝난 건의');
    expect(html).not.toContain('새 건의');
    expect(html).toMatch(/href="\/\?status=done" aria-current="page">.*?<span class="n">1<\/span>/);
    expect(await (await get('/?status=bogus', alice)).text()).toContain('새 건의');
  });

  it('로그인 전에도 헤더 로고를 내려 준다', async () => {
    const res = await get('/logo.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('관리자 화면에만 상태 변경 폼이 보인다', async () => {
    const id = store.createPost(alice, '제목', '내용');
    expect(await (await get(`/posts/${id}`, admin)).text()).toContain('class="status-form"');
    expect(await (await get(`/posts/${id}`, alice)).text()).not.toContain('class="status-form"');
  });
});
