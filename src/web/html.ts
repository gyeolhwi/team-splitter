import type { User } from './auth.js';
import { POST_STATUSES, STATUS_LABEL, type Comment, type Post } from './board-store.js';

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
export const COMMENT_MAX = 2000;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);

const date = (ms: number) =>
  new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' });

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2129;--muted:#6b7280;--line:#e5e7eb;--accent:#5865f2;--danger:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--card:#202226;--text:#e8e9ec;--muted:#9aa0a8;--line:#33363c;--accent:#7c86ff;--danger:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card)}
header .brand{font-weight:700;color:inherit;text-decoration:none;margin-right:auto}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
a{color:var(--accent)}h1{font-size:22px;margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:12px}
.list{list-style:none;margin:0;padding:0}.list li{display:flex;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
.list li a{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;text-decoration:none;font-weight:600}
.meta{color:var(--muted);font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.avatar{width:22px;height:22px;border-radius:50%;vertical-align:middle}
.badge{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.s-open{color:#6b7280}.s-doing{color:#d97706}.s-done{color:#16a34a}.s-rejected{color:var(--danger)}
.body{white-space:pre-wrap;word-break:break-word;margin:12px 0 0}
form.inline{display:inline}input[type=text],textarea,select{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
textarea{min-height:160px;resize:vertical}label{display:block;font-weight:600;margin:12px 0 4px}
button,.button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:8px 14px;background:var(--accent);color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
button.ghost{background:transparent;color:var(--muted);border:1px solid var(--line)}button.danger{background:var(--danger)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.row select{width:auto}
.comment{border-top:1px solid var(--line);padding:12px 0}.empty{color:var(--muted);text-align:center;padding:24px 0}
`;

interface PageUser {
  user: User;
  csrf: string;
}

function layout(title: string, content: string, who?: PageUser): string {
  const nav = who
    ? `<span class="meta"><img class="avatar" src="${esc(who.user.avatar)}" alt="">${esc(who.user.name)}</span>
       <form class="inline" method="post" action="/logout"><input type="hidden" name="_csrf" value="${esc(who.csrf)}"><button class="ghost">로그아웃</button></form>`
    : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · 배근이 건의함</title><style>${CSS}</style></head>
<body><header><a class="brand" href="/">배근이 건의함</a>${nav}</header><main>${content}</main></body></html>`;
}

const badge = (status: Post['status']) => `<span class="badge s-${status}">${STATUS_LABEL[status]}</span>`;
const author = (p: { authorAvatar: string; authorName: string; createdAt: number }) =>
  `<img class="avatar" src="${esc(p.authorAvatar)}" alt="">${esc(p.authorName)} · ${date(p.createdAt)}`;
const csrfField = (csrf: string) => `<input type="hidden" name="_csrf" value="${esc(csrf)}">`;

export function listPage(who: PageUser, posts: Post[]): string {
  const items = posts.length
    ? `<ul class="list">${posts
        .map(
          (p) => `<li>${badge(p.status)}<a href="/posts/${p.id}">${esc(p.title)}</a>
          <span class="meta">${p.commentCount ? `💬 ${p.commentCount} · ` : ''}${esc(p.authorName)}</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="empty">아직 건의가 없습니다. 첫 건의를 남겨 주세요.</p>';
  return layout(
    '목록',
    `<div class="row" style="margin:0 0 16px"><h1 style="margin:0;flex:1">건의사항</h1><a class="button" href="/new">건의하기</a></div>
     <div class="card">${items}</div>`,
    who,
  );
}

export function detailPage(
  who: PageUser,
  post: Post,
  comments: Comment[],
  can: { edit: boolean; remove: boolean; setStatus: boolean },
): string {
  const statusForm = can.setStatus
    ? `<form class="row status-form" method="post" action="/posts/${post.id}/status">${csrfField(who.csrf)}
        <select name="status" aria-label="처리 상태">${POST_STATUSES.map(
          (s) => `<option value="${s}"${s === post.status ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`,
        ).join('')}</select><button>상태 변경</button></form>`
    : '';
  const actions = [
    can.edit ? `<a class="button" href="/posts/${post.id}/edit">수정</a>` : '',
    can.remove
      ? `<form class="inline" method="post" action="/posts/${post.id}/delete">${csrfField(who.csrf)}<button class="danger">삭제</button></form>`
      : '',
  ].join('');
  const list = comments.length
    ? comments
        .map((c) => `<div class="comment" id="c${c.id}"><div class="meta">${author(c)}</div><p class="body">${esc(c.body)}</p></div>`)
        .join('')
    : '<p class="empty">댓글이 없습니다.</p>';
  return layout(
    post.title,
    `<article class="card"><div class="meta">${badge(post.status)} ${author(post)}${
      post.updatedAt !== post.createdAt ? ' · 수정됨' : ''
    }</div>
      <h1 style="margin:8px 0 0">${esc(post.title)}</h1><p class="body">${esc(post.body)}</p>
      ${actions ? `<div class="row">${actions}</div>` : ''}${statusForm}</article>
     <section class="card"><h2 style="font-size:16px;margin:0">댓글 ${comments.length}</h2>${list}
      <form method="post" action="/posts/${post.id}/comments">${csrfField(who.csrf)}
        <label for="comment">댓글 쓰기</label><textarea id="comment" name="body" maxlength="${COMMENT_MAX}" required style="min-height:80px"></textarea>
        <div class="row"><button>등록</button></div></form></section>
     <a href="/">← 목록으로</a>`,
    who,
  );
}

export function formPage(who: PageUser, post?: Pick<Post, 'id' | 'title' | 'body'>, error?: string): string {
  const action = post?.id ? `/posts/${post.id}/edit` : '/posts';
  return layout(
    post?.id ? '수정' : '건의하기',
    `<h1>${post?.id ? '건의 수정' : '건의하기'}</h1>${error ? `<p class="s-rejected">${esc(error)}</p>` : ''}
     <form class="card" method="post" action="${action}">${csrfField(who.csrf)}
       <label for="title">제목</label><input type="text" id="title" name="title" maxlength="${TITLE_MAX}" required value="${esc(post?.title ?? '')}">
       <label for="body">내용</label><textarea id="body" name="body" maxlength="${BODY_MAX}" required>${esc(post?.body ?? '')}</textarea>
       <div class="row"><button>${post?.id ? '저장' : '등록'}</button><a href="${post?.id ? `/posts/${post.id}` : '/'}">취소</a></div>
     </form>`,
    who,
  );
}

export function messagePage(title: string, message: string, link?: { href: string; label: string }): string {
  return layout(
    title,
    `<div class="card" style="text-align:center"><h1>${esc(title)}</h1><p>${esc(message)}</p>${
      link ? `<a class="button" href="${esc(link.href)}">${esc(link.label)}</a>` : ''
    }</div>`,
  );
}
