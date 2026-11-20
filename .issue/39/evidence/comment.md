## 작업 요약

게시판 이름과 화면 문구를 "건의"에서 "피드백"으로 바꿨다. 헤더는 "배근이 피드백", 목록 제목은 "피드백", 버튼은 "피드백 남기기"와 "피드백 보내기"다. 관리자 DM도 `📮 새 피드백 —` 으로 시작한다. 상태 흐름, 주소, 라우트는 그대로다.

같이 고친 것: #38 에서 넣은 상태 탭이 390px 모바일에서 넘쳐 "반려" 탭이 잘려 보였다. 탭 간격을 줄여 360·390px에서 5개가 한 줄에 들어가게 했다(측정: scrollWidth = clientWidth).

## 변경 전후

| 화면 | 전 | 후 |
| --- | --- | --- |
| 목록 390 라이트 | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/list-mobile-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/list-mobile-light.webp) |
| 목록 1280 라이트 | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/list-desktop-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/list-desktop-light.webp) |
| 쓰기 1280 라이트 | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/new-desktop-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/new-desktop-light.webp) |
| 상세 390 다크 | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/detail-mobile-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/detail-mobile-dark.webp) |

<details><summary>나머지 8쌍</summary>

| 화면 | 전 | 후 |
| --- | --- | --- |
| list-desktop-dark | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/list-desktop-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/list-desktop-dark.webp) |
| list-mobile-dark | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/list-mobile-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/list-mobile-dark.webp) |
| new-desktop-dark | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/new-desktop-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/new-desktop-dark.webp) |
| new-mobile-light | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/new-mobile-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/new-mobile-light.webp) |
| new-mobile-dark | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/new-mobile-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/new-mobile-dark.webp) |
| detail-desktop-light | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/detail-desktop-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/detail-desktop-light.webp) |
| detail-desktop-dark | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/detail-desktop-dark.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/detail-desktop-dark.webp) |
| detail-mobile-light | ![전](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/before/detail-mobile-light.webp) | ![후](https://raw.githubusercontent.com/gyeolhwi/team-splitter/main/.issue/39/evidence/after/detail-mobile-light.webp) |

</details>

## 검증

- `src/web/`, `docs/deploy.md`, `compose.yml` 에서 "건의" 검색 결과 0건 (테스트 데이터의 예시 문장은 그대로)
- `npm run typecheck` / `npm run build` 통과, `npm test` 93개 통과
- 모바일 탭: 360px, 390px 모두 한 줄에 들어감
