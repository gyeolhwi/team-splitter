---
id: tech
title: 기술 구성
category: tech
summary: 사용할 기술(TypeScript, discord.js), 봇 권한과 Intents, 진행 중인 판을 저장하는 JSON 파일, 폴더 구조를 정리한다.
keywords: [기술 스택, TypeScript, Node.js, discord.js, Vitest, 권한, Intents, 저장, JSON, 환경변수, 폴더 구조]
related_files: [package.json, .env.example, src/index.ts, data/sessions.json]
last_updated: 2026-09-29
---

# 기술 구성

## 사용 기술

| 항목 | 선택 |
|---|---|
| 언어 | TypeScript (Node.js LTS) |
| 디스코드 라이브러리 | discord.js v14 |
| 저장 | JSON 파일 하나 (`data/sessions.json`) |
| 테스트 | Vitest |

웹 서버, 데이터베이스, Redis는 쓰지 않는다.

## 봇 권한

- 필요한 권한: View Channel, Manage Channels, Move Members, Connect, Send Messages, Embed Links
- Administrator 권한은 주지 않는다.
- Intents는 `Guilds`, `GuildVoiceStates` 두 개만 쓴다. 특권 Intent는 필요 없다.

## 저장

진행 중인 판만 저장한다. 봇이 재시작된 뒤 판을 정리할 수 있도록 하기 위해서다.

```json
{ "id": "a7k2", "guildId": "…", "lobbyId": "…", "hostId": "…",
  "participantIds": ["…"], "teamChannelIds": ["…"], "createdAt": "…" }
```

- 디스코드 ID는 문자열로 저장한다. 숫자로 바꾸면 값이 깨진다.

## 환경변수

`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`. `.env` 파일은 git에 올리지 않는다.

## 폴더 구조 (예정)

```text
team-splitter/
├── INDEX.md
├── docs/
├── src/
│   ├── index.ts                  # 봇 시작, 재시작 시 판 정리
│   ├── commands/team.ts          # /team generate, /team assemble
│   ├── domain/team-generator.ts  # 팀 편성 (순수 함수)
│   ├── services/session-service.ts # 분배, 모으기, 자동 종료
│   └── store/session-store.ts    # sessions.json 읽기/쓰기
└── tests/team-generator.test.ts
```
