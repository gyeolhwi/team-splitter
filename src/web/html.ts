import type { User } from './auth.js';
import { POST_STATUSES, STATUS_LABEL, type Comment, type Post, type PostStatus } from './board-store.js';

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
export const COMMENT_MAX = 2000;
/** 상태 선택 즉시 저장. CSP 는 이 문자열의 해시만 허용한다 */
export const STATUS_SCRIPT =
  "document.querySelector('.status-form select')?.addEventListener('change',(e)=>e.target.form.requestSubmit());";

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);

const KST = { timeZone: 'Asia/Seoul' } as const;
const shortParts = new Intl.DateTimeFormat('ko-KR', { ...KST, month: 'numeric', day: 'numeric' });
/** 목록용 11.20 형식. 로캘 기본값(11. 20.)은 좁은 열에서 줄이 꺾인다 */
const shortDate = (ms: number) => {
  const parts = shortParts.formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('month')}.${get('day')}`;
};
const longDate = (ms: number) =>
  new Date(ms).toLocaleString('ko-KR', { ...KST, month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --ink: #202327;
  --sub: #686d75;
  --rule: #e4e6e9;
  --field: #f4f5f6;
  --on-ink: #ffffff;
  --st-open: #686d75;
  --st-doing: #a86400;
  --st-done: #2d7a4b;
  --st-rejected: #b23b2a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #18191b;
    --ink: #e7e8ea;
    --sub: #9a9fa6;
    --rule: #2d3034;
    --field: #202225;
    --on-ink: #18191b;
    --st-open: #9a9fa6;
    --st-doing: #e0a24a;
    --st-done: #5cb27f;
    --st-rejected: #e57a68;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.6 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  font-variant-numeric: tabular-nums;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
a { color: inherit; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
h1 { font-size: 20px; line-height: 1.4; margin: 0; }
h2 { font-size: 15px; margin: 0; }

/* 머리말 */
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--rule);
}
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; text-decoration: none; margin-right: auto; }
.brand img { width: 28px; height: 28px; border-radius: 6px; }
.me { display: flex; align-items: center; gap: 8px; color: var(--sub); font-size: 14px; }
.avatar { width: 20px; height: 20px; border-radius: 50%; vertical-align: -4px; }
main { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }

/* 버튼과 입력 */
.btn, button {
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  border: 1px solid var(--ink);
  border-radius: 6px;
  padding: 7px 14px;
  background: var(--ink);
  color: var(--on-ink);
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
}
.quiet { background: transparent; color: var(--ink); border-color: var(--rule); }
.danger { background: transparent; color: var(--st-rejected); border-color: var(--rule); }
.text { background: none; border: 0; padding: 0; color: var(--sub); font-weight: 400; }
.text:hover { color: var(--ink); text-decoration: underline; }
input[type=text], textarea, select {
  font: inherit;
  color: inherit;
  width: 100%;
  background: var(--field);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 8px 10px;
}
textarea { min-height: 200px; resize: vertical; }
.comment-form textarea { min-height: 88px; }
label { display: block; font-weight: 600; font-size: 14px; margin: 16px 0 6px; }
form.inline { display: inline; }

/* 상태 표시 */
.st { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; white-space: nowrap; }
.st::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: currentColor; }
.st-open { color: var(--st-open); }
.st-doing { color: var(--st-doing); }
.st-done { color: var(--st-done); }
.st-rejected { color: var(--st-rejected); }

/* 목록 */
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; }
.count { color: var(--sub); font-weight: 400; margin-left: 6px; }
.rows { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--ink); }
.row {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  padding: 11px 4px;
  border-bottom: 1px solid var(--rule);
  text-decoration: none;
}
.row:hover .title { text-decoration: underline; }
.title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .info { display: flex; gap: 12px; color: var(--sub); font-size: 14px; white-space: nowrap; }
.row time { color: var(--sub); font-size: 14px; text-align: right; white-space: nowrap; }
.empty { color: var(--sub); padding: 32px 4px; border-bottom: 1px solid var(--rule); }

/* 상세 */
.back { display: inline-block; color: var(--sub); font-size: 14px; margin-bottom: 16px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; color: var(--sub); font-size: 14px; margin: 10px 0 0; }
.body { white-space: pre-wrap; max-width: 68ch; margin: 20px 0 0; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
.status-form { display: inline-flex; align-items: center; gap: 6px; }
.status-form select { width: auto; padding: 2px 8px; font-size: 14px; font-weight: 600; background: var(--bg); }
.status-form button { padding: 2px 10px; }
.comments { margin-top: 40px; border-top: 1px solid var(--ink); padding-top: 16px; }
.comment { padding: 14px 0; border-bottom: 1px solid var(--rule); }
.comment .meta { margin: 0; }
.comment .body { margin-top: 6px; }
.form-actions { display: flex; align-items: center; gap: 16px; margin-top: 16px; }
.form-actions a { color: var(--sub); font-size: 14px; }
.notice p { color: var(--sub); max-width: 52ch; }

@media (max-width: 600px) {
  .me .name { display: none; }
  .row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "title title title" "st info time";
    gap: 4px 12px;
    padding: 12px 2px;
  }
  .row .st { grid-area: st; font-size: 13px; }
  .row .title { grid-area: title; white-space: normal; }
  .row .info { grid-area: info; }
  .row time { grid-area: time; }
}
`;

interface PageUser {
  user: User;
  csrf: string;
}

function layout(title: string, content: string, who?: PageUser): string {
  const me = who
    ? `<div class="me"><img class="avatar" src="${esc(who.user.avatar)}" alt=""><span class="name">${esc(who.user.name)}</span>
        <form class="inline" method="post" action="/logout">${csrfField(who.csrf)}<button class="text">로그아웃</button></form></div>`
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)} - 배근이 건의함</title><style>${CSS}</style></head>
<body><header class="top"><a class="brand" href="/"><img src="/logo.png" alt="">배근이 건의함</a>${me}</header>
<main>${content}</main></body></html>`;
}

const status = (s: PostStatus) => `<span class="st st-${s}">${STATUS_LABEL[s]}</span>`;
const byline = (p: { authorAvatar: string; authorName: string; createdAt: number }) =>
  `<span><img class="avatar" src="${esc(p.authorAvatar)}" alt=""> ${esc(p.authorName)}</span><time>${longDate(p.createdAt)}</time>`;
const csrfField = (csrf: string) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

export function listPage(who: PageUser, posts: Post[]): string {
  const rows = posts.length
    ? `<ol class="rows">${posts
        .map(
          (p) => `<li><a class="row" href="/posts/${p.id}">${status(p.status)}<span class="title">${esc(p.title)}</span>
            <span class="info">${p.commentCount ? `<span>댓글 ${p.commentCount}</span>` : ''}<span>${esc(p.authorName)}</span></span>
            <time>${shortDate(p.createdAt)}</time></a></li>`,
        )
        .join('')}</ol>`
    : '<p class="empty">아직 올라온 건의가 없습니다. 바라는 점이 있으면 첫 건의를 써 주세요.</p>';
  return layout(
    '목록',
    `<div class="bar"><h1>건의<span class="count">${posts.length}</span></h1><a class="btn" href="/new">건의 쓰기</a></div>${rows}`,
    who,
  );
}

export function detailPage(
  who: PageUser,
  post: Post,
  comments: Comment[],
  can: { edit: boolean; remove: boolean; setStatus: boolean },
): string {
  const actions = [
    can.edit ? `<a class="btn quiet" href="/posts/${post.id}/edit">수정</a>` : '',
    can.remove
      ? `<form class="inline" method="post" action="/posts/${post.id}/delete">${csrfField(who.csrf)}<button class="danger">삭제</button></form>`
      : '',
  ].join('');
  // 관리자는 상태 표시 자리에서 바로 바꾼다. 선택하면 저장되고, JS 가 꺼져 있으면 버튼이 대신 나온다
  const statusControl = can.setStatus
    ? `<form class="status-form" method="post" action="/posts/${post.id}/status">${csrfField(who.csrf)}
        <select class="st-${post.status}" name="status" aria-label="처리 상태">${POST_STATUSES.map(
          (s) => `<option value="${s}"${s === post.status ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`,
        ).join('')}</select><noscript><button class="quiet">바꾸기</button></noscript></form>`
    : status(post.status);
  const list = comments
    .map((c) => `<div class="comment" id="c${c.id}"><p class="meta">${byline(c)}</p><p class="body">${esc(c.body)}</p></div>`)
    .join('');
  return layout(
    post.title,
    `<a class="back" href="/">목록으로</a>
     <article><h1>${esc(post.title)}</h1>
       <div class="meta">${statusControl}${byline(post)}${post.updatedAt !== post.createdAt ? '<span>수정됨</span>' : ''}</div>
       <p class="body">${esc(post.body)}</p>
       ${actions ? `<div class="actions">${actions}</div>` : ''}</article>${can.setStatus ? `<script>${STATUS_SCRIPT}</script>` : ''}
     <section class="comments"><h2>댓글 ${comments.length}</h2>${list}
       <form class="comment-form" method="post" action="/posts/${post.id}/comments">${csrfField(who.csrf)}
         <label for="comment">댓글</label><textarea id="comment" name="body" maxlength="${COMMENT_MAX}" required></textarea>
         <div class="form-actions"><button>댓글 달기</button></div></form></section>`,
    who,
  );
}

export function formPage(who: PageUser, post?: Pick<Post, 'id' | 'title' | 'body'>): string {
  const editing = Boolean(post?.id);
  return layout(
    editing ? '건의 수정' : '건의 쓰기',
    `<h1>${editing ? '건의 수정' : '건의 쓰기'}</h1>
     <form method="post" action="${editing ? `/posts/${post!.id}/edit` : '/posts'}">${csrfField(who.csrf)}
       <label for="title">제목</label><input type="text" id="title" name="title" maxlength="${TITLE_MAX}" required value="${esc(post?.title ?? '')}">
       <label for="body">내용</label><textarea id="body" name="body" maxlength="${BODY_MAX}" required>${esc(post?.body ?? '')}</textarea>
       <div class="form-actions"><button>${editing ? '수정 저장' : '건의 올리기'}</button><a href="${editing ? `/posts/${post!.id}` : '/'}">취소</a></div>
     </form>`,
    who,
  );
}

export function messagePage(title: string, message: string, link?: { href: string; label: string }): string {
  return layout(
    title,
    `<div class="notice"><h1>${esc(title)}</h1><p>${esc(message)}</p>${
      link ? `<a class="btn quiet" href="${esc(link.href)}">${esc(link.label)}</a>` : ''
    }</div>`,
  );
}
