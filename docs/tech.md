---
id: tech
title: 기술 구성
category: tech
summary: Vercel 서버리스 + Supabase 무료 구성, 음성 접속자를 알아내는 '잠깐 연결' 방식과 그 한도, 사용하는 디스코드 API, 봇 권한, 저장 테이블, 환경변수, 폴더 구조를 정리한다.
keywords: [기술 스택, Vercel, Supabase, 서버리스, TypeScript, 게이트웨이, 잠깐 연결, voice_states, 연결 한도, REST API, 권한, Intents, 저장, 환경변수, 폴더 구조, cron]
related_files: [api/interactions.ts, api/cron.ts, src/discord/gateway-snapshot.ts, src/discord/rest.ts, scripts/register-commands.mjs, supabase/migrations]
last_updated: 2026-09-29
---

# 기술 구성

## 1. 사용 기술

| 항목 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript (Node.js 22) | |
| 실행 | **Vercel Functions** (무료 Hobby 플랜) | 명령이 올 때만 실행된다. 상시 서버가 없다 |
| 저장 | **Supabase** (무료 플랜) | 진행 중인 판과 하루 사용량 기록 |
| 디스코드 연동 | REST API는 `fetch`로 직접 호출, 잠깐 연결은 Node 내장 `WebSocket` | discord.js는 쓰지 않는다 |
| 테스트 | Vitest | |

civil-war(`gyeolhwi/civil-war`)의 봇과 같은 구조다. 서명 검증과 REST 호출, 명령 등록 스크립트는 그 코드를 참고한다.

## 2. 동작 방식

### 명령 처리 흐름

1. 디스코드가 `/team generate` 같은 명령을 `api/interactions.ts`로 보낸다.
2. 서명(Ed25519)을 검증하고, 3초 안에 "처리 중"(deferred)으로 응답한다.
3. 응답한 뒤 `waitUntil`로 나머지 작업을 이어서 처리하고, 결과로 원래 메시지를 수정한다.

### 음성 접속자를 알아내는 방법: 잠깐 연결

- 디스코드 REST API에는 **음성채널에 있는 사람 목록을 조회하는 기능이 없다.** 한 사람씩 위치를 묻는 기능만 있다.
- 그래서 명단이 필요할 때만 디스코드 게이트웨이(WebSocket)에 **잠깐 연결**한다. 연결 직후 받는 `GUILD_CREATE` 이벤트의 `voice_states`에 그 서버에서 음성에 접속한 사람 전원이 들어 있다. 목록을 받으면 바로 연결을 끊는다(1~3초).
- 연결이 필요한 시점은 두 번이다.
  - `/team generate`: 로비 인원 확인
  - assemble: 팀 채널 인원 확인
- 명령을 친 사람의 위치(로비가 어디인지)는 REST로 한 사람만 조회하면 되므로 연결하지 않는다.

### 연결 한도 (반드시 지킬 것)

| 한도 | 넘기면 | 대응 |
|---|---|---|
| 봇 전체 기준 하루 1,000번 | **모든 연결이 끊기고 봇 토큰이 강제로 초기화된다** (디스코드 공식 문서) | 연결할 때마다 Supabase에 기록하고, 하루 800번이 넘으면 연결하지 않고 "사용량 초과"로 안내한다 |
| 5초에 1번 | 연결이 거절된다 | 잠시 기다렸다가 다시 시도한다 |

### 정리 작업

- 봇이 이벤트를 받지 못하므로 "팀 채널이 비는 순간"을 알 수 없다.
- 대신 두 시점에 남은 판을 점검한다.
  - 그 서버에서 다음 명령이 들어올 때 (이미 받은 음성 접속자 목록을 같이 쓴다)
  - Vercel Cron이 하루 한 번 실행될 때 (`api/cron.ts`). 무료 플랜에서 허용되는 최소 주기다.
- 이 cron은 Supabase를 하루 한 번 사용하는 역할도 한다. Supabase 무료 플랜은 **7일 동안 사용이 없으면 프로젝트를 일시정지**하기 때문이다.

## 3. 사용하는 디스코드 API

| 동작 | API |
|---|---|
| 명령 친 사람의 위치 | `GET /guilds/{guild}/voice-states/{user}` |
| 음성 접속자 전체 | 게이트웨이 잠깐 연결 → `GUILD_CREATE.voice_states` |
| 팀 채널 생성 | `POST /guilds/{guild}/channels` (type 2, `parent_id` = 로비의 카테고리) |
| 멤버 이동 | `PATCH /guilds/{guild}/members/{user}` (`channel_id`). 에러 코드 40032는 음성 미접속 |
| 팀 채널 삭제 | `DELETE /channels/{channel}` |
| 결과 메시지 수정 | `PATCH /webhooks/{app}/{token}/messages/@original` |

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
- Intents: `GUILDS`(1) + `GUILD_VOICE_STATES`(128) = **129**. 둘 다 일반 Intent라서 개발자 포털에서 따로 켤 것이 없다.

## 5. 저장 (Supabase)

| 테이블 | 주요 컬럼 |
|---|---|
| `sessions` | `id`, `guild_id`, `lobby_id`, `host_id`, `participant_ids text[]`, `team_channel_ids text[]`, `status`, `created_at` |
| `gateway_usage` | `date`, `count` (하루 연결 횟수) |

- 디스코드 ID는 모두 문자열(`text`)로 저장한다.
- `(guild_id, lobby_id)`에 진행 중인 판은 하나만 있도록 유니크 제약을 건다. 동시에 split team을 눌러도 한쪽만 성공한다.
- 편성 결과(split team 전)도 버튼이 동작하려면 저장해야 한다. 서버리스는 메모리가 유지되지 않기 때문이다. `status = 'draft'`로 저장하고, 하루가 지난 draft는 cron이 지운다.

## 6. 환경변수

| 이름 | 용도 | 비밀 |
|---|---|---|
| `DISCORD_APPLICATION_ID` | 명령 등록, 결과 메시지 수정 | 아님 |
| `DISCORD_PUBLIC_KEY` | 요청 서명 검증 | 아님 (서버에서만 사용) |
| `DISCORD_BOT_TOKEN` | REST 호출, 잠깐 연결 | **비밀** |
| `SUPABASE_URL` | DB 주소 | 아님 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 쓰기 | **비밀** |
| `CRON_SECRET` | cron 호출 검증 | **비밀** |

`.env.local`은 git에 올리지 않는다. 등록 절차는 `docs/setup.md`를 참고한다.

## 7. 폴더 구조 (예정)

```text
team-splitter/
├── api/
│   ├── interactions.ts          # 디스코드 명령·버튼 수신 (서명 검증 → defer → 처리)
│   └── cron.ts                  # 하루 1회 정리 + Supabase 활성 유지
├── src/
│   ├── discord/verify.ts        # Ed25519 서명 검증
│   ├── discord/rest.ts          # REST 호출 (채널 생성·삭제, 이동, 메시지 수정)
│   ├── discord/gateway-snapshot.ts # 잠깐 연결해 voice_states 받기 + 한도 기록
│   ├── domain/team-generator.ts # 팀 편성 (순수 함수)
│   ├── services/session.ts      # generate, split team, assemble, 정리
│   └── store/supabase.ts        # sessions, gateway_usage
├── scripts/register-commands.mjs # 슬래시 명령 글로벌 등록
├── supabase/migrations/
├── tests/team-generator.test.ts
└── vercel.json                  # cron 설정
```
