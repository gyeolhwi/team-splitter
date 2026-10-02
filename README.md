# 셔틀봇 (배근이)

<img src="assets/persona/thumb-256.png" width="120" align="right" alt="배근이">

디스코드 내전용 팀 편성 봇입니다.
음성채널에 모인 사람들을 랜덤으로 팀을 나누고, 팀별 음성채널로 옮겨 주고, 게임이 끝나면 다시 한곳으로 모아 줍니다.
채널을 만들고 사람을 옮기는 귀찮은 일은 소심한 빵셔틀 **배근이**가 허둥지둥 대신 해 줍니다.

## 기능

- **랜덤 팀 편성**: 내가 있는 음성채널 인원을 팀 수나 팀당 인원 기준으로 나눕니다. 남는 사람은 미지정으로 표시합니다.
- **제외 지정**: 봇 계정은 자동으로 빠지고, 관전자처럼 뺄 사람은 멘션으로 지정합니다.
- **분배**: 버튼 한 번에 팀 채널(`1팀`, `2팀`…)을 만들고 팀원을 옮깁니다.
- **모으기**: 팀 채널 인원을 원래 채널로 모으고 팀 채널을 지웁니다. 원래 채널이 사라졌으면 새로 만들어 모읍니다.
- **자동 정리**: 모으기 없이 다들 흩어지면, 1분 뒤 빈 팀 채널을 알아서 지웁니다.
- **꼬임 방지**: 로비마다 진행 중인 판은 하나뿐이고, 오래된 버튼은 누르는 순간 사라집니다.

## 사용법

```
/team generate [team:팀수] [number:팀당인원] [non-target:@제외할사람]
  → 편성 결과 확인 → [split team] 으로 분배

/team assemble   (또는 [assemble] 버튼)
  → 원래 채널로 모으기
```

## 구성

TypeScript · discord.js · SQLite · Docker. AWS Lightsail 서울 서버에서 상시 실행합니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/spec.md](docs/spec.md) | 명령어, 편성 규칙, 동작, 안전장치 |
| [docs/tech.md](docs/tech.md) | 기술 구성, 봇 권한, 저장, 폴더 구조, 서버 비용 |
| [docs/persona.md](docs/persona.md) | 배근이 캐릭터와 안내 말투 |
| [docs/discord-guide.md](docs/discord-guide.md) | 이용안내 채널 게시글, 봇 소개 문구 |
| [docs/setup.md](docs/setup.md) | 봇 등록, 서버 준비, 로컬 실행, 트러블슈팅 |
| [docs/deploy.md](docs/deploy.md) | 서버 배포·업데이트 런북 |
| [INDEX.md](INDEX.md) | 문서 색인 (AI 참조용) |
