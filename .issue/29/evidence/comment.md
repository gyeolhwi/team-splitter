## 작업 요약

`/팀짜기` 편성 단계의 옵션 처리를 보강했습니다. 편성 로직이 팀별 지정 인원을 받을 수 있게 되었고, 지정이 없으면 결과는 기존과 같습니다.

## 변경 파일

- `src/domain/team-generator.ts` — 팀별 지정 인원 처리, `plannedSizes` 추가
- `src/services/session.ts` — 편성 대상 추출 분리, 지정 인원 검사(중복·팀 크기 초과·팀 구성 변경)
- `src/discord/commands.ts` — 편성 옵션 입력 처리
- `src/messages.ts` — 오류 문구 추가
- `tests/team-generator.test.ts`, `tests/generate.test.ts` — 편성 단위 테스트 추가

## 검증

| 항목 | 전 (`4efcc8c`) | 후 |
| --- | ---: | ---: |
| 테스트 | 63 통과 | **73 통과** |

- `npm run typecheck` / `npm run build` 통과
- 기존 `/팀짜기` 명령·옵션·메시지 변경 없음
- 원본: `.issue/29/evidence/before/test.txt`, `.issue/29/evidence/after/test.txt`

화면 변경이 없어 캡처는 생략했습니다.

## 남은 이슈

- 실서버 동작 확인
