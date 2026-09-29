---
id: setup
title: 봇 등록·배포 가이드
category: ops
summary: 디스코드 Developer Portal에서 앱·봇 등록, Installation 설정, Supabase·Vercel 설정, Interactions Endpoint URL 등록, 슬래시 명령 등록, 서버 초대까지 순서대로 정리한 체크리스트와 트러블슈팅.
keywords: [봇 등록, 셋업, Developer Portal, 봇 토큰, Public Key, Application ID, Public Bot, Installation, 초대 링크, 권한, Interactions Endpoint URL, Vercel, 배포 보호, 환경변수, Supabase, 명령 등록, 트러블슈팅]
related_files: [.env.example, scripts/register-commands.mjs, api/interactions.ts, vercel.json, supabase/migrations]
last_updated: 2026-09-29
---

# 봇 등록·배포 가이드

civil-war의 `docs/ops/discord-bot-setup.md`에서 **실제로 겪었던 문제**까지 반영해 이 프로젝트에 맞게 옮긴 문서다.

## 0. 전체 순서

1. 디스코드 앱과 봇 만들기 → 값 3개 확보
2. Installation 설정 (초대 링크)
3. Supabase 프로젝트 만들기
4. Vercel 배포 + 환경변수 등록
5. Interactions Endpoint URL 등록
6. 슬래시 명령 등록
7. 서버에 초대하고 테스트

> **순서 주의:** 5번은 `DISCORD_PUBLIC_KEY`가 들어간 상태로 **배포가 끝난 뒤에만** 통과한다.

---

## 1. 디스코드 앱과 봇 만들기

[Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → 이름: `Team Splitter`

### General Information 탭

| 항목 | 환경변수 |
|---|---|
| Application ID | `DISCORD_APPLICATION_ID` |
| Public Key (64자) | `DISCORD_PUBLIC_KEY` |
| Interactions Endpoint URL | 지금은 비워둔다 → 5번에서 등록 |
| 이용약관 / 개인정보처리방침 URL | 지금은 비워둔다. 서버가 100개가 넘어 디스코드 인증을 받을 때 필요하다 |

### Bot 탭

- **Reset Token** → 토큰 복사 → `DISCORD_BOT_TOKEN`
  - 토큰은 한 번만 보인다. 노출되면 바로 다시 Reset 한다.
- **Public Bot: ON** (누구나 자기 서버에 추가 가능)
- **Requires OAuth2 Code Grant: OFF**
- **Privileged Gateway Intents (Presence / Server Members / Message Content): 전부 OFF**
  - 이 봇은 일반 Intent(`GUILDS`, `GUILD_VOICE_STATES`)만 쓴다.

---

## 2. Installation 설정 (초대 링크)

**Installation 탭**

1. **Installation Contexts:** `Guild Install`만 켠다. `User Install`은 끈다.
2. **Install Link:** `Discord Provided Link`
3. **Default Install Settings → Guild Install**
   - Scopes: `applications.commands`, **`bot`** (둘 다)
   - Permissions: View Channels, Manage Channels, Connect, Move Members
4. **Save Changes**

직접 만든 초대 링크를 쓸 때:

```
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=17826832
```

> ⚠️ **`bot` 스코프를 빠뜨리면 봇이 서버 멤버로 들어오지 않는다.** 명령어는 보이지만 채널 생성·이동이 전부 실패한다.
> 초대 화면에 **권한 4개가 나열되면 정상**이다. "명령어 만들기"만 있고 권한 목록이 없으면 `bot` 스코프가 빠진 것이다.
> 이미 잘못 초대한 서버는 올바른 링크로 **다시 초대**하면 덮어써진다.

---

## 3. Supabase

1. [Supabase](https://supabase.com) → New Project (Region: Northeast Asia (Seoul))
2. SQL Editor에서 `supabase/migrations/`의 SQL을 실행해 `sessions`, `gateway_usage` 테이블을 만든다.
3. **Project Settings → API**에서 값 복사
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**비밀**. 서버에서만 쓴다)

> 무료 플랜은 7일 동안 사용이 없으면 일시정지된다. 하루 한 번 도는 cron(`api/cron.ts`)이 이걸 막는다.

---

## 4. Vercel

1. [Vercel](https://vercel.com) → Add New Project → GitHub `gyeolhwi/team-splitter` 가져오기
2. **Settings → Deployment Protection → Vercel Authentication: OFF**
   - 켜져 있으면 디스코드 요청이 로그인 화면에 막힌다. 5번에서 "엔드포인트 URL을 인증할 수 없습니다"가 뜬다.
3. **Settings → Environment Variables** (Production)

| 변수 | 값 |
|---|---|
| `DISCORD_APPLICATION_ID` | 1번에서 확보 |
| `DISCORD_PUBLIC_KEY` | 1번에서 확보 |
| `DISCORD_BOT_TOKEN` | 1번에서 확보 |
| `SUPABASE_URL` | 3번에서 확보 |
| `SUPABASE_SERVICE_ROLE_KEY` | 3번에서 확보 |
| `CRON_SECRET` | 임의의 긴 문자열 |

4. **환경변수를 넣거나 바꾼 뒤에는 반드시 새로 배포한다.** 이미 떠 있는 배포에는 반영되지 않는다. 새 커밋을 push하는 게 가장 확실하다.

> ⚠️ `DISCORD_APPLICATION_ID`가 빠지면 결과 메시지를 수정하지 못해서, 명령이 에러 없이 "처리 중"에서 멈춘다.

---

## 5. Interactions Endpoint URL 등록

General Information → **Interactions Endpoint URL**:

```
https://<배포 도메인>/api/interactions
```

저장하면 디스코드가 확인 요청(PING)을 보내고, 봇이 PONG으로 응답하면 통과한다.

등록 전 확인 (선택):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<배포 도메인>/api/interactions
# 401 → 정상 (라우트가 살아 있고 서명 검증이 동작함)
# 404 → 배포 안 됨 또는 도메인 오류
# 401인데 응답에 _vercel_sso_nonce 쿠키가 있음 → 4-2 배포 보호가 켜져 있음
```

---

## 6. 슬래시 명령 등록

```bash
node --env-file=.env.local scripts/register-commands.mjs
```

- **글로벌 등록**이다. 봇이 초대된 모든 서버에 자동으로 보이므로 서버마다 따로 등록할 필요가 없다.
- 전체를 덮어쓰는 방식(PUT)이라 여러 번 실행해도 중복되지 않는다.
- 반영까지 최대 약 1시간 걸릴 수 있다.
- 명령 정의(옵션 등)를 바꿨을 때만 다시 실행한다. 코드 배포와는 별개다.

---

## 7. 서버에 초대하고 테스트

1. 2번의 초대 링크로 서버에 추가한다. 서버 관리 권한이 있는 사람만 추가할 수 있다.
2. 서버 설정 → 멤버에서 봇이 있는지 확인한다.
   - 봇은 항상 **오프라인으로 표시된다. 정상이다.** 상시 연결하지 않는 구조이기 때문이다.
3. 팀 채널을 만들 카테고리에서 봇 역할에 **채널 관리 권한이 막혀 있지 않은지** 확인한다.
4. 음성채널에 2명 이상 들어간 상태에서 `/team generate` → **[split team]** → `/team assemble` 순서로 확인한다.

> 슬래시 명령은 디스코드에서 사람이 직접 입력해야 한다. 서명은 디스코드만 만들 수 있어서 `curl`로는 흉내 낼 수 없다.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| "엔드포인트 URL을 인증할 수 없습니다" | Vercel 배포 보호가 켜져 있음, 또는 `DISCORD_PUBLIC_KEY` 없이 배포됨 | 4-2 끄기 / 환경변수 넣고 새로 배포 |
| 명령이 "처리 중"에서 멈춤 | `DISCORD_APPLICATION_ID` 누락, 또는 환경변수 바꾼 뒤 재배포 안 함 | 4-3, 4-4 |
| 명령이 입력창에 안 보임 | 등록 안 함, 반영 대기 중, 디스코드 캐시 | 6번 실행 / 최대 1시간 대기 / Ctrl+R |
| 초대했는데 멤버 목록에 봇이 없음 | `bot` 스코프 없이 초대함 | 2번 설정 확인 후 다시 초대 |
| 채널 생성 실패 (403) | 카테고리에서 봇 역할의 채널 관리 권한이 막힘 | 카테고리 권한에서 봇 역할 허용 |
| 이동 실패 "음성 미접속" (40032) | 대상이 음성에 없음 | 정상 동작. 결과 메시지에 표시됨 |
| "오늘 사용량 초과" 안내 | 하루 연결 800번 초과 | 다음 날 자동 해제. 자주 나오면 상시 실행 구조를 검토한다 |
| 봇 토큰 초기화 메일을 받음 | 하루 연결 1,000번 초과 | 새 토큰을 Vercel 환경변수에 넣고 재배포. 사용량 기록 로직 점검 |
| 모든 명령이 DB 에러 | Supabase 프로젝트 일시정지 | Supabase 대시보드에서 Restore. cron이 도는지 확인 |
