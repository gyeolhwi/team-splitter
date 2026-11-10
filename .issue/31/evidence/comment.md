## 작업 요약

편성 옵션 처리를 기존 `/팀짜기` 처리 경로 하나로 정리했습니다. 기존 명령·옵션·메시지는 바뀌지 않았습니다.

## 변경 파일

- `src/discord/commands.ts` — 명령 라우팅 정리
- `tests/commands-routing.test.ts` — 명령 처리 경로 테스트 추가

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| 테스트 | 73 통과 | **76 통과** |

- `npm run typecheck` / `npm run build` 통과
- 원본: `.issue/31/evidence/before/test.txt`, `.issue/31/evidence/after/test.txt`

화면 변경이 없어 캡처는 생략했습니다.
