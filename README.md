# Team Splitter

음성채널에 모인 인원을 랜덤으로 팀으로 나누고, 팀별 음성채널로 분배한 뒤, 끝나면 다시 한곳으로 모아주는 디스코드 봇입니다.

> 상태: MVP 구현 (실제 서버 테스트 전)

## 주요 기능

- **랜덤 팀 편성**: 내가 있는 음성채널의 인원을 팀 수나 팀당 인원 기준으로 랜덤하게 나눕니다.
- **제외**: 봇 계정은 자동으로 빠지고, 관전자처럼 뺄 사람은 직접 지정합니다.
- **분배**: 팀별 음성채널을 만들고 팀원을 이동시킵니다.
- **모으기**: 팀 채널 인원을 원래 채널로 모으고 팀 채널을 삭제합니다.

## 사용법

```
/team generate [team:팀수] [number:팀당인원] [non-target:@제외할사람]
  → 편성 결과 확인 → [split team] 버튼으로 분배

/team assemble   (또는 [assemble] 버튼)
  → 원래 채널로 모으기
```

## 개발

```bash
npm install
cp .env.example .env.local   # DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN 입력
npm run register             # 슬래시 명령 등록 (명령 정의를 바꿨을 때만)
npm run dev                  # 봇 실행 (파일 저장 시 재시작)
npm test                     # 단위 테스트
```

## 기술 스택

TypeScript · discord.js · SQLite · Docker (AWS Lightsail 서울 서버에서 상시 실행)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/spec.md](docs/spec.md) | 목적, 명령어, 편성 규칙, 동작, 안전장치 |
| [docs/tech.md](docs/tech.md) | 기술 구성, 동작 방식, 봇 권한, 저장, 폴더 구조, 서버 비용 |
| [docs/setup.md](docs/setup.md) | 봇 등록, Lightsail 서버 준비, Docker 배포·업데이트, 트러블슈팅 |
| [INDEX.md](INDEX.md) | 문서 색인 (AI 참조용) |
