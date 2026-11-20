import type { User } from './auth.js';
import { POST_STATUSES, STATUS_LABEL, type Comment, type Post, type PostStatus } from './board-store.js';

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
export const COMMENT_MAX = 2000;

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
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 64px; }

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
.st-open { color: var(--st-open); --c: var(--st-open); }
.st-doing { color: var(--st-doing); --c: var(--st-doing); }
.st-done { color: var(--st-done); --c: var(--st-done); }
.st-rejected { color: var(--st-rejected); --c: var(--st-rejected); }

/* 목록 */
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--rule); overflow-x: auto; }
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: -1px;
  border-bottom: 2px solid transparent;
  color: var(--sub);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.tab:hover { color: var(--ink); }
.tab[aria-current="page"] { color: var(--ink); border-bottom-color: var(--ink); }
.tabs .st { color: inherit; }
.tabs .st::before { background: var(--c); }
.tab .n { color: var(--sub); font-weight: 400; }
.rows { list-style: none; margin: 0; padding: 0; }
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

/* 상세: 본문은 왼쪽, 상태와 정보는 오른쪽 패널 */
.crumb { display: flex; gap: 8px; color: var(--sub); font-size: 14px; margin-bottom: 12px; }
.crumb a { color: var(--sub); }
.detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 248px;
  grid-template-areas: "title props" "body props" "comments props";
  grid-template-rows: auto auto 1fr;
  column-gap: 48px;
  align-items: start;
}
.detail-title { grid-area: title; font-size: 24px; line-height: 1.35; }
.detail > .body { grid-area: body; }
.detail > .comments { grid-area: comments; }
.props {
  grid-area: props;
  display: grid;
  gap: 18px;
  padding-left: 24px;
  border-left: 1px solid var(--rule);
  position: sticky;
  top: 24px;
}
.prop { display: grid; gap: 6px; font-size: 14px; }
.prop .k { color: var(--sub); font-size: 13px; }
.status-form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.status-form .pick {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  color: var(--sub);
  border: 1px solid var(--rule);
}
.status-form .pick::before { content: ""; width: 8px; height: 8px; border-radius: 2px; background: var(--c); }
.status-form .pick:hover { border-color: var(--c); color: var(--ink); }
.status-form .pick[aria-pressed="true"] {
  color: var(--c);
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 10%, transparent);
}
.prop-actions { display: flex; gap: 8px; padding-top: 18px; border-top: 1px solid var(--rule); }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; color: var(--sub); font-size: 14px; margin: 0; }
.body { white-space: pre-wrap; max-width: 68ch; margin: 16px 0 0; }
.comments { margin-top: 40px; border-top: 1px solid var(--rule); padding-top: 16px; }
.comment { padding: 14px 0; border-bottom: 1px solid var(--rule); }
.comment .meta { margin: 0; }
.comment .body { margin-top: 6px; }
.form-actions { display: flex; align-items: center; gap: 16px; margin-top: 16px; }
.form-actions a { color: var(--sub); font-size: 14px; }
.notice p { color: var(--sub); max-width: 52ch; }
main > form { max-width: 720px; }

@media (max-width: 860px) {
  /* 패널을 풀어 항목마다 제자리에: 제목, 상태, 작성자|작성일, 본문, 수정·삭제, 댓글 */
  .detail {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas: "title title" "status status" "author date" "body body" "actions actions" "comments comments";
    grid-template-rows: none;
    column-gap: 16px;
  }
  .props { display: contents; }
  .prop-status { grid-area: status; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--rule); }
  .prop-author { grid-area: author; margin-top: 14px; }
  .prop-date { grid-area: date; margin-top: 14px; }
  .detail > .body { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--rule); }
  .prop-actions { grid-area: actions; margin-top: 18px; padding-top: 0; border-top: 0; }
  .status-form { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .me .name { display: none; }
  .detail-title { font-size: 21px; }
  /* 360px 에서도 상태 탭 5개가 한 줄에 들어가게 (개수가 두 자리면 가로 스크롤) */
  .tabs { gap: 0; justify-content: space-between; }
  .tab { gap: 4px; padding: 8px 6px; font-size: 13px; }
  .status-form .pick { padding: 6px 8px; justify-content: center; }
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
<title>${esc(title)} - 배근이 피드백</title><style>${CSS}</style></head>
<body><header class="top"><a class="brand" href="/"><img src="/logo.png" alt="">배근이 피드백</a>${me}</header>
<main>${content}</main></body></html>`;
}

const status = (s: PostStatus) => `<span class="st st-${s}">${STATUS_LABEL[s]}</span>`;
const byline = (p: { authorAvatar: string; authorName: string; createdAt: number }) =>
  `<span><img class="avatar" src="${esc(p.authorAvatar)}" alt=""> ${esc(p.authorName)}</span><time>${longDate(p.createdAt)}</time>`;
const csrfField = (csrf: string) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

export function listPage(who: PageUser, posts: Post[], filter?: PostStatus): string {
  const shown = filter ? posts.filter((p) => p.status === filter) : posts;
  const tab = (href: string, label: string, n: number, current: boolean) =>
    `<a class="tab" href="${href}"${current ? ' aria-current="page"' : ''}>${label}<span class="n">${n}</span></a>`;
  const tabs = `<nav class="tabs" aria-label="상태별 보기">${tab('/', '전체', posts.length, !filter)}${POST_STATUSES.map((s) =>
    tab(`/?status=${s}`, status(s), posts.filter((p) => p.status === s).length, s === filter),
  ).join('')}</nav>`;
  const rows = shown.length
    ? `<ol class="rows">${shown
        .map(
          (p) => `<li><a class="row" href="/posts/${p.id}">${status(p.status)}<span class="title">${esc(p.title)}</span>
            <span class="info">${p.commentCount ? `<span>댓글 ${p.commentCount}</span>` : ''}<span>${esc(p.authorName)}</span></span>
            <time>${shortDate(p.createdAt)}</time></a></li>`,
        )
        .join('')}</ol>`
    : `<p class="empty">${
        filter ? `${STATUS_LABEL[filter]} 상태인 피드백이 없습니다.` : '아직 올라온 피드백이 없습니다. 불편한 점이나 바라는 점을 남겨 주세요.'
      }</p>`;
  return layout(
    '목록',
    `<div class="bar"><h1>피드백</h1><a class="btn" href="/new">피드백 남기기</a></div>${tabs}${rows}`,
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
  // 관리자는 누르면 바로 저장되는 4칸 버튼, 나머지는 상태 표시만
  const statusControl = can.setStatus
    ? `<form class="status-form" role="group" aria-label="처리 상태" method="post" action="/posts/${post.id}/status">${csrfField(who.csrf)}${POST_STATUSES.map(
        (s) =>
          `<button class="pick st-${s}" name="status" value="${s}" aria-pressed="${s === post.status}">${STATUS_LABEL[s]}</button>`,
      ).join('')}</form>`
    : status(post.status);
  const prop = (key: string, label: string, value: string) =>
    `<div class="prop prop-${key}"><span class="k">${label}</span>${value}</div>`;
  const edited = post.updatedAt !== post.createdAt ? ' <span class="k">(수정됨)</span>' : '';
  const list = comments
    .map((c) => `<div class="comment" id="c${c.id}"><p class="meta">${byline(c)}</p><p class="body">${esc(c.body)}</p></div>`)
    .join('');
  return layout(
    post.title,
    `<nav class="crumb" aria-label="위치"><a href="/">피드백 목록</a><span>#${post.id}</span></nav>
     <div class="detail">
       <h1 class="detail-title">${esc(post.title)}</h1>
       <aside class="props" aria-label="피드백 정보">
         ${prop('status', '상태', statusControl)}
         ${prop('author', '작성자', `<span><img class="avatar" src="${esc(post.authorAvatar)}" alt=""> ${esc(post.authorName)}</span>`)}
         ${prop('date', '작성일', `<span><time>${longDate(post.createdAt)}</time>${edited}</span>`)}
         ${actions ? `<div class="prop-actions">${actions}</div>` : ''}
       </aside>
       <p class="body">${esc(post.body)}</p>
       <section class="comments"><h2>댓글 ${comments.length}</h2>${list}
         <form class="comment-form" method="post" action="/posts/${post.id}/comments">${csrfField(who.csrf)}
           <label for="comment">댓글</label><textarea id="comment" name="body" maxlength="${COMMENT_MAX}" required></textarea>
           <div class="form-actions"><button>댓글 달기</button></div></form></section>
     </div>`,
    who,
  );
}

export function formPage(who: PageUser, post?: Pick<Post, 'id' | 'title' | 'body'>): string {
  const editing = Boolean(post?.id);
  return layout(
    editing ? '피드백 수정' : '피드백 남기기',
    `<h1>${editing ? '피드백 수정' : '피드백 남기기'}</h1>
     <form method="post" action="${editing ? `/posts/${post!.id}/edit` : '/posts'}">${csrfField(who.csrf)}
       <label for="title">제목</label><input type="text" id="title" name="title" maxlength="${TITLE_MAX}" required value="${esc(post?.title ?? '')}">
       <label for="body">내용</label><textarea id="body" name="body" maxlength="${BODY_MAX}" required>${esc(post?.body ?? '')}</textarea>
       <div class="form-actions"><button>${editing ? '수정 저장' : '피드백 보내기'}</button><a href="${editing ? `/posts/${post!.id}` : '/'}">취소</a></div>
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
