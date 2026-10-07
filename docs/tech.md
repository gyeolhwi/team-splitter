---
id: tech
title: 기술 구성
category: tech
summary: AWS Lightsail 서울 서버 한 대에 Docker로 상시 실행하는 구성. discord.js 게이트웨이 연결로 명령과 음성 상태를 받는 방식, 자동 정리, 사용하는 디스코드 API, 봇 권한, SQLite 저장, 환경변수, 폴더 구조, 서버 비용을 정리한다.
keywords: [기술 스택, AWS, Lightsail, Docker, Docker Compose, 상시 실행, discord.js, 게이트웨이, voice_states, voiceStateUpdate, 자동 정리, REST API, 권한, Intents, SQLite, 저장, 환경변수, 폴더 구조, 비용]
related_files: [src/index.ts, src/discord/commands.ts, src/services/session.ts, src/store/db.ts, scripts/register-commands.mjs, Dockerfile, compose.yml]
last_updated: 2026-10-07
---

# 기술 구성

## 1. 사용 기술

| 항목 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (Node.js 22) | |
| 실행 | **AWS Lightsail 서울 리전** 서버 1대 + **Docker Compose** | 봇이 항상 켜져 있다. 다른 개인 프로젝트와 서버를 같이 쓴다 |
| 디스코드 연동 | **discord.js v14** | 게이트웨이에 계속 연결해 명령·버튼·음성 상태를 받는다 |
| 저장 | **SQLite** (`better-sqlite3`) | 서버 디스크의 파일 하나. 별도 DB 서비스가 없다 |
| 테스트 | Vitest | |

### 이 구성을 고른 이유

처음에는 무료로 운영하려고 Vercel Functions + Supabase + "게이트웨이 잠깐 연결" 구조로 설계했다. 그 구조는 하루 연결 1,000번 한도(넘으면 봇 토큰 강제 초기화), Supabase 7일 일시정지를 막는 cron, 서명 검증과 배포 보호 설정 같은 우회 장치가 많았다. 다른 프로젝트도 Docker로 함께 돌릴 서버를 두기로 하면서, 봇을 상시 실행하는 구조로 바꿨다. 위 우회 장치가 모두 필요 없어진다.

## 2. 동작 방식

### 명령 처리 흐름

1. 봇이 시작하면 디스코드 게이트웨이에 연결해 계속 유지한다.
2. `/team generate` 같은 명령과 버튼 클릭이 `interactionCreate` 이벤트로 들어온다. Interactions Endpoint URL과 서명 검증이 필요 없다.
3. 3초 안에 "처리 중"(`deferReply` / `deferUpdate`)으로 응답하고, 작업이 끝나면 결과로 메시지를 수정한다.

### 음성 접속자를 알아내는 방법

- `GUILD_VOICE_STATES` Intent로 연결해 두면 discord.js가 모든 서버의 음성 상태를 메모리에 들고 있다.
- 로비 인원은 `voiceChannel.members`로 바로 읽는다. 매번 디스코드에 따로 물어보지 않는다.
- 봇 여부는 `member.user.bot`으로 판단한다.

### 정리 작업

- `voiceStateUpdate` 이벤트로 **팀 채널에서 사람이 나가는 순간**을 안다.
- 어떤 판의 팀 채널이 **전부 비면 1분 기다렸다가 다시 확인**하고, 여전히 비어 있으면 채널을 지우고 판을 끝낸다. 잠깐 나갔다 들어오는 경우에 채널이 사라지지 않게 하려는 유예 시간이다.
- 봇이 재시작되면(배포, 서버 재부팅) 시작할 때 진행 중인 판을 SQLite에서 읽어 같은 기준으로 한 번 점검한다.
- split team 전 편성 결과(draft)는 10분 동안만 유효하다. 같은 로비에서 다시 편성하면 이전 draft를 지우고, 1시간마다 만료된 draft를 지운다.

## 3. 사용하는 디스코드 API

discord.js 메서드로 호출한다. 괄호 안은 실제 REST 엔드포인트다.

| 동작 | 방법 |
|---|---|
| 명령 친 사람의 위치 | `member.voice.channel` (게이트웨이 캐시) |
| 음성 접속자 전체 | `voiceChannel.members` (게이트웨이 캐시) |
| 팀 채널 생성 | `guild.channels.create` (`POST /guilds/{guild}/channels`, type 2, `parent` = 로비의 카테고리) |
| 멤버 이동 | `member.voice.setChannel` (`PATCH /guilds/{guild}/members/{user}`). 에러 코드 40032는 음성 미접속 |
| 팀 채널 삭제 | `channel.delete` (`DELETE /channels/{channel}`) |
| 결과 메시지 수정 | `interaction.editReply` |

## 4. 봇 권한과 Intents

| 권한 | 용도 | 값 |
|---|---|---|
| View Channels | 채널 조회 | 1024 |
| Manage Channels | 팀 채널 생성·삭제 | 16 |
| Connect | 멤버를 옮길 채널에 봇도 연결 권한이 있어야 함 | 1048576 |
| Move Members | 멤버 이동 | 16777216 |

- 합계: `permissions=17826832`
- 명령 응답은 interaction 응답으로 보내므로 메시지 보내기 권한은 필요 없다.
- Administrator 권한은 주지 않는다.
- Intents: `Guilds`(1) + `GuildVoiceStates`(128). 둘 다 일반 Intent라서 개발자 포털에서 따로 켤 것이 없다.

## 5. 저장 (SQLite)

파일 위치: 컨테이너 안 `/app/data/team-splitter.db`. 서버의 `./data` 폴더에 연결(volume)해서 컨테이너를 다시 만들어도 남는다.

| 테이블 | 주요 컬럼 |
|---|---|
| `sessions` | `id`, `guild_id`, `lobby_id`, `host_id`, `participant_ids`(JSON), `teams`(JSON), `team_channel_ids`(JSON), `status`(`draft`/`active`), `created_at` |

- 디스코드 ID는 모두 문자열(`TEXT`)로 저장한다.
- `(guild_id, lobby_id)`에 진행 중(`active`)인 판은 하나만 있도록 부분 유니크 인덱스를 건다. 동시에 split team을 눌러도 한쪽만 성공한다.
- 편성 결과(draft)도 저장한다. 봇이 재시작돼도 결과 메시지의 버튼이 동작하게 하기 위해서다.
- 끝난 판은 지운다. 기록을 남기지 않는다.

## 6. 환경변수

| 이름 | 용도 | 비밀 |
|---|---|---|
| `DISCORD_APPLICATION_ID` | 명령 등록 | 아님 |
| `DISCORD_BOT_TOKEN` | 게이트웨이 연결, API 호출, 명령 등록 | **비밀** |

| `DB_PATH` | SQLite 파일 경로. 기본 `data/team-splitter.db`, Docker에서는 `/app/data/team-splitter.db` | 아님 |

- 로컬: `.env.local`, 서버: 프로젝트 폴더의 `.env`. 둘 다 git에 올리지 않는다.
- 등록 절차는 `docs/setup.md`를 참고한다.

## 7. 폴더 구조

```text
team-splitter/
├── src/
│   ├── index.ts                 # 봇 시작: 게이트웨이 연결, 이벤트 등록, 시작 시 점검
│   ├── discord/commands.ts      # 슬래시 명령·버튼 처리
│   ├── domain/team-generator.ts # 팀 편성 (순수 함수)
│   ├── domain/health.ts         # /ping 상태 판정 (순수 함수)
│   ├── messages.ts              # 사용자에게 보이는 문구 전부 (말투: docs/persona.md)
│   ├── services/session.ts      # generate, split team, assemble, 자동 정리
│   └── store/db.ts              # SQLite (sessions)
├── scripts/register-commands.mjs # 슬래시 명령 글로벌 등록
├── assets/persona/              # 봇 캐릭터 이미지, 상황별 이미지 프롬프트
├── tests/                       # team-generator, db, health 단위 테스트
├── Dockerfile
├── compose.yml                  # restart: unless-stopped, ./data 볼륨
└── .env.example

npm 스크립트: `dev`(tsx watch, `.env.local`), `build`(tsc → `dist/`), `start`, `test`(Vitest), `typecheck`, `register`(명령 등록)
```

## 8. 서버와 비용

| 항목 | 내용 |
|---|---|
| 서버 | AWS Lightsail, 서울 리전, Ubuntu 24.04 LTS |
| 플랜 | Medium: RAM 4GB, vCPU 2개(버스트형), SSD 80GB, 트래픽 월 4TB 포함 |
| 요금 | 월 $24 고정 + 부가세 10% = **약 $26.4 (약 3만 7천 원)**. 자동 스냅샷을 켜면 월 $1~4 추가 |
| 함께 쓰는 프로젝트 | 디스코드 봇 여러 개, 개인 웹 서버 등. 프로젝트마다 `~/services/<프로젝트>/`에 `compose.yml`을 둔다 |

- EC2 대신 Lightsail을 쓰는 이유: 디스크·공인 IP·트래픽이 월 고정 요금에 포함되어 같은 사양의 EC2보다 싸고 요금이 예측된다. 보안 그룹·VPC 설정 없이 화면에서 포트만 열면 된다.
- 이 봇의 메모리 사용량은 100~150MB 정도다. 4GB면 봇 3~5개, 웹 서버 3~4개, DB 1~2개를 같이 올려도 여유가 있다. 부족해지면 스냅샷으로 8GB 플랜($44)으로 옮긴다.
- 봇은 디스코드로 먼저 연결하는 쪽이라 **도메인과 열어 둘 포트가 필요 없다.** 웹 서비스를 올릴 때만 80/443 포트와 Caddy(HTTPS)를 추가한다.
