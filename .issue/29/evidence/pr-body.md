관련 이슈: [#29 팀짜기 편성 옵션 처리 보강](https://github.com/gyeolhwi/team-splitter/issues/29) (통합 테스트 뒤 close)

## 변경 내용
- `src/domain/team-generator.ts` — 팀별 지정 인원 처리, 지정이 없으면 기존과 같은 결과
- `src/services/session.ts` — 편성 대상 추출 분리, 지정 인원 검사
- `src/discord/commands.ts` — 편성 옵션 입력 처리. 기존 `/팀짜기` 경로는 그대로
- `src/messages.ts` — 오류 문구
- 편성 단위 테스트 추가

## 검증
- `npm test` 63 → 73 통과
- `npm run typecheck` / `npm run build` 통과

## 증거
[전후 리포트 보기](COMMENT_URL)
