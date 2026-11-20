## 작업 요약

건의 게시판 화면을 이슈 트래커 같은 업무툴형으로 다시 만들었다. 무채색 바탕에 상태색 네 가지만 쓰고, 보라 강조색·카드·알약 배지·이모지를 없앴다. 배근이는 헤더 로고로만 넣었다.
코드는 쓰지 않는 `error` 매개변수, 인라인 `style=` 5곳, 한 줄로 압축된 CSS를 정리했다. 라우트·권한·폼 필드·DM 동작은 그대로다.

## 변경 전후

빨간 테두리는 비교 구간(본문 영역)이다. 같은 데이터(건의 4건, 상태 4종, 댓글 2개)로 찍었다.

| 화면 | 전 | 후 |
| --- | --- | --- |
| 목록 1280 라이트 | ![목록 1280 라이트 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/list-desktop-light.webp) | ![목록 1280 라이트 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/list-desktop-light.webp) |
| 목록 390 다크 | ![목록 390 다크 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/list-mobile-dark.webp) | ![목록 390 다크 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/list-mobile-dark.webp) |
| 상세 1280 라이트(관리자) | ![상세 1280 라이트(관리자) 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/detail-desktop-light.webp) | ![상세 1280 라이트(관리자) 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/detail-desktop-light.webp) |
| 허용 목록 밖 390 라이트 | ![허용 목록 밖 390 라이트 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/forbidden-mobile-light.webp) | ![허용 목록 밖 390 라이트 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/forbidden-mobile-light.webp) |

<details><summary>나머지 12쌍 (작성·상세·목록 × 1280/390 × 라이트/다크)</summary>

| 화면 | 전 | 후 |
| --- | --- | --- |
| list-desktop-dark | ![list-desktop-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/list-desktop-dark.webp) | ![list-desktop-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/list-desktop-dark.webp) |
| list-mobile-light | ![list-mobile-light 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/list-mobile-light.webp) | ![list-mobile-light 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/list-mobile-light.webp) |
| detail-desktop-dark | ![detail-desktop-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/detail-desktop-dark.webp) | ![detail-desktop-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/detail-desktop-dark.webp) |
| detail-mobile-light | ![detail-mobile-light 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/detail-mobile-light.webp) | ![detail-mobile-light 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/detail-mobile-light.webp) |
| detail-mobile-dark | ![detail-mobile-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/detail-mobile-dark.webp) | ![detail-mobile-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/detail-mobile-dark.webp) |
| new-desktop-light | ![new-desktop-light 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/new-desktop-light.webp) | ![new-desktop-light 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/new-desktop-light.webp) |
| new-desktop-dark | ![new-desktop-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/new-desktop-dark.webp) | ![new-desktop-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/new-desktop-dark.webp) |
| new-mobile-light | ![new-mobile-light 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/new-mobile-light.webp) | ![new-mobile-light 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/new-mobile-light.webp) |
| new-mobile-dark | ![new-mobile-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/new-mobile-dark.webp) | ![new-mobile-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/new-mobile-dark.webp) |
| forbidden-desktop-light | ![forbidden-desktop-light 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/forbidden-desktop-light.webp) | ![forbidden-desktop-light 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/forbidden-desktop-light.webp) |
| forbidden-desktop-dark | ![forbidden-desktop-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/forbidden-desktop-dark.webp) | ![forbidden-desktop-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/forbidden-desktop-dark.webp) |
| forbidden-mobile-dark | ![forbidden-mobile-dark 전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/before/forbidden-mobile-dark.webp) | ![forbidden-mobile-dark 후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/forbidden-mobile-dark.webp) |

</details>

## 주요 변경

- 목록: 상태 · 제목 · 댓글 수 · 작성자 · 날짜(11.20)를 한 줄에 표시하고, 모바일은 두 줄로 바꿨다. 줄 전체가 링크다
- 상태 표시: 색 사각형과 색 글자. 접수(회색) · 진행중(호박) · 완료(녹색) · 반려(벽돌)
- 버튼: 주 버튼은 글자색(먹색), 보조 버튼은 테두리만, 삭제는 붉은 글자
- 문구: "건의 쓰기", "건의 올리기", "수정 저장", "댓글 달기", "처리 상태 바꾸기"처럼 실제 동작을 적었다. 허용 목록 밖 화면은 관리자에게 ID 추가를 요청하라고 안내하고, 같은 화면으로 돌아오는 링크는 뺐다
- 로고: `/logo.png` 로 `assets/persona/thumb-256.png` 를 내려 준다(CSP `img-src 'self'` 추가, Dockerfile에서 이 파일 복사)

## 변경 파일

- `src/web/html.ts` — CSS 토큰 재작성, 목록 그리드, 템플릿 정리
- `src/web/server.ts` — 로고 라우트, CSP, 403 문구
- `Dockerfile` — 로고 파일 복사
- `tests/web.test.ts` — 상태 폼 검사 셀렉터를 좁히고 로고 테스트 추가

## 검증

- `npm run typecheck` / `npm run build` 통과
- `npm test` 91개 통과 (기존 90 + 로고 1)
- `src/web/html.ts` 에서 `style="` · `#5865f2` · 💬 검색 결과 0건
- 원본: [test.txt](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/35/evidence/after/test.txt)

## 남은 이슈

- 운영 배포 후 실제 도메인에서 확인 (PR merge 뒤)
