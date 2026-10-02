---
id: setup
title: 봇 등록·배포 가이드
category: ops
summary: 디스코드 Developer Portal에서 앱·봇 등록, Installation 설정, AWS Lightsail 서버 준비(인스턴스·고정 IP·Docker), Docker Compose 배포와 업데이트, 슬래시 명령 등록, 서버 초대까지 순서대로 정리한 체크리스트와 트러블슈팅.
keywords: [봇 등록, 셋업, Developer Portal, 봇 토큰, Application ID, Public Bot, Installation, 초대 링크, 권한, AWS, Lightsail, 고정 IP, SSH, Docker, Docker Compose, 배포, 업데이트, 로그, 스냅샷, 환경변수, 명령 등록, 트러블슈팅]
related_files: [.env.example, scripts/register-commands.mjs, Dockerfile, compose.yml]
last_updated: 2026-10-02
---

# 봇 등록·배포 가이드

civil-war의 `docs/ops/discord-bot-setup.md`에서 **실제로 겪었던 문제**까지 반영해 이 프로젝트에 맞게 옮긴 문서다.

## 0. 전체 순서

1. 디스코드 앱과 봇 만들기 → 값 2개 확보
2. Installation 설정 (초대 링크)
3. AWS Lightsail 서버 준비 (다른 프로젝트와 같이 쓰는 서버. 한 번만 하면 된다)
4. 서버에 봇 배포
5. 슬래시 명령 등록
6. 디스코드 서버에 초대하고 테스트

---

## 1. 디스코드 앱과 봇 만들기

[Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → 이름: `셔틀봇`

### General Information 탭

| 항목 | 처리 |
|---|---|
| Application ID | 복사 → `DISCORD_APPLICATION_ID` |
| Interactions Endpoint URL | **비워둔다.** 게이트웨이로 명령을 받으므로 쓰지 않는다. 값이 들어 있으면 명령이 봇에 오지 않는다 |
| 이용약관 / 개인정보처리방침 URL | 지금은 비워둔다. 서버가 100개가 넘어 디스코드 인증을 받을 때 필요하다 |

### Bot 탭

- **Reset Token** → 토큰 복사 → `DISCORD_BOT_TOKEN`
  - 토큰은 한 번만 보인다. 노출되면 바로 다시 Reset 한다.
- **Public Bot: ON** (누구나 자기 서버에 추가 가능)
- **Requires OAuth2 Code Grant: OFF**
- **Privileged Gateway Intents (Presence / Server Members / Message Content): 전부 OFF**
  - 이 봇은 일반 Intent(`Guilds`, `GuildVoiceStates`)만 쓴다.

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

## 3. AWS Lightsail 서버 준비

여러 프로젝트를 같이 올릴 서버다. 이미 만들어 두었다면 4번으로 넘어간다.

### 3-1. 인스턴스 만들기

[Lightsail 콘솔](https://lightsail.aws.amazon.com) → **Create instance**

| 항목 | 선택 |
|---|---|
| Region | **Seoul (ap-northeast-2)** |
| Platform | Linux/Unix |
| Blueprint | **OS Only → Ubuntu 24.04 LTS** |
| Network type | **Dual-stack** (IPv4 포함). IPv6 전용은 고르지 않는다 |
| Plan | **$24 (4GB RAM, 2 vCPU, 80GB SSD)** |
| 이름 | 예: `home-server` |

### 3-2. 고정 IP 붙이기

인스턴스 → **Networking** 탭 → **Attach static IP** → 새로 만들어 붙인다.

- 붙이지 않으면 재부팅할 때마다 IP가 바뀐다.
- 인스턴스에 붙어 있는 고정 IP는 무료다. **인스턴스를 지울 때는 고정 IP도 같이 지운다.** 남겨두면 요금이 나간다.

### 3-3. 방화벽

Networking 탭 → IPv4 Firewall

- 기본으로 SSH(22), HTTP(80)가 열려 있다. **봇만 돌린다면 더 열 포트는 없다.**
- 웹 서비스를 올릴 때 HTTPS(443)를 추가한다.

### 3-4. 접속

- 가장 쉬운 방법: 인스턴스 화면의 **Connect using SSH** 버튼 (브라우저 터미널)
- 내 맥에서 접속할 때: **Account → SSH keys**에서 서울 리전 기본 키(`.pem`)를 내려받는다.

```bash
chmod 400 ~/Downloads/LightsailDefaultKey-ap-northeast-2.pem
ssh -i ~/Downloads/LightsailDefaultKey-ap-northeast-2.pem ubuntu@<고정 IP>
```

### 3-5. Docker 설치

서버에서 실행한다.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit   # 다시 접속해야 sudo 없이 docker를 쓸 수 있다
```

다시 접속한 뒤 확인:

```bash
docker run --rm hello-world
mkdir -p ~/services   # 프로젝트는 전부 이 아래에 둔다
```

### 3-6. 자동 스냅샷 (권장)

인스턴스 → **Snapshots** 탭 → **Automatic snapshots: ON**

- 하루에 한 번 서버 전체를 백업한다. 최근 7개를 보관한다.
- 월 $1~4 정도 추가된다.
- 서버 플랜을 올릴 때도 스냅샷으로 새 인스턴스를 만들고 고정 IP를 옮겨 붙인다.

---

## 4. 서버에 봇 배포

SSH 접속, git clone, `.env` 업로드, docker compose 실행, 업데이트, 되돌리기까지 **`docs/deploy.md`** 런북을 그대로 따라 한다.

---

## 5. 슬래시 명령 등록

내 맥의 프로젝트 폴더에서 실행한다. `.env.local`에 `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`이 있어야 한다.

```bash
npm install            # 처음 한 번
npm run register       # = node --env-file=.env.local scripts/register-commands.mjs
```

- **글로벌 등록**이다. 봇이 초대된 모든 서버에 자동으로 보이므로 서버마다 따로 등록할 필요가 없다.
- 전체를 덮어쓰는 방식(PUT)이라 여러 번 실행해도 중복되지 않는다.
- 반영까지 최대 약 1시간 걸릴 수 있다.
- 명령 정의(옵션 등)를 바꿨을 때만 다시 실행한다. 코드 배포와는 별개다.

---

## 6. 디스코드 서버에 초대하고 테스트

1. 2번의 초대 링크로 서버에 추가한다. 서버 관리 권한이 있는 사람만 추가할 수 있다.
2. 서버 설정 → 멤버에서 봇이 있는지 확인한다. 봇이 실행 중이면 **온라인**으로 보인다.
3. 팀 채널을 만들 카테고리에서 봇 역할에 **채널 관리 권한이 막혀 있지 않은지** 확인한다.
4. 음성채널에 2명 이상 들어간 상태에서 `/team generate` → **[split team]** → `/team assemble` 순서로 확인한다.

> 로컬에서 먼저 확인하고 싶으면 내 맥에서 `npm run dev`로 봇을 띄운다. **서버의 봇과 동시에 켜면 명령이 두 쪽으로 들어가니** 서버 쪽을 `docker compose down`으로 멈추고 테스트한다.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 봇이 오프라인으로 보임 | 컨테이너가 꺼져 있음, 토큰이 틀림 | `docker compose ps`, `docker compose logs`로 확인. 토큰 오류면 `.env` 수정 후 `docker compose up -d` |
| 명령을 쳐도 "애플리케이션이 응답하지 않았습니다" | Developer Portal에 Interactions Endpoint URL이 들어 있음, 또는 봇이 꺼져 있음 | 1번에서 URL을 비우고 저장 / 봇 상태 확인 |
| 명령이 입력창에 안 보임 | 등록 안 함, 반영 대기 중, 디스코드 캐시 | 5번 실행 / 최대 1시간 대기 / Ctrl+R |
| 명령이 두 번 처리되거나 이상하게 동작함 | 로컬과 서버에서 봇이 동시에 실행 중 | 한쪽을 끈다 |
| 초대했는데 멤버 목록에 봇이 없음 | `bot` 스코프 없이 초대함 | 2번 설정 확인 후 다시 초대 |
| 채널 생성 실패 (403) | 카테고리에서 봇 역할의 채널 관리 권한이 막힘 | 카테고리 권한에서 봇 역할 허용 |
| 이동 실패 "음성 미접속" (40032) | 대상이 음성에 없음 | 정상 동작. 결과 메시지에 표시됨 |
| SSH 접속이 안 됨 | 키 권한, 사용자 이름, IP 오류 | `chmod 400` 확인, 사용자는 `ubuntu`, 고정 IP로 접속. 급하면 콘솔의 브라우저 SSH 사용 |
| 서버 전체가 느리거나 컨테이너가 죽음 | 메모리 부족 | `docker stats`로 확인. 부족하면 스냅샷으로 8GB 플랜으로 옮긴다 |
| 로그에 `unable to open database file`, 재시작 반복 | `data` 폴더가 root 소유 | `sudo chown -R 1000:1000 data` 후 `docker compose up -d` |
| 디스크 부족 | 오래된 Docker 이미지가 쌓임 | `docker image prune -a` |
