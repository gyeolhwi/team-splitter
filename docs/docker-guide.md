---
id: docker-guide
title: 도커와 서버 구조 쉽게 보기
category: setup
summary: 도커·이미지·컨테이너·컴포즈를 비유로 쉽게 설명하고, Lightsail 서버(aws-ubuntu-1)에 배근이가 어떤 구조로 배포되어 돌아가는지, 데이터는 어디 있는지, 무엇을 지우면 안 되는지, 업데이트할 때 무슨 일이 일어나는지 정리한다.
keywords: [도커, Docker, 이미지, 컨테이너, 컴포즈, Compose, Dockerfile, compose.yml, 서버 구조, services, 배포 구조, 데이터 위치, data, .env, 업데이트, 입문]
related_files: [Dockerfile, compose.yml, docs/deploy.md, docs/tech.md]
last_updated: 2026-10-07
---

# 도커와 서버 구조 쉽게 보기

배포 명령 순서는 `docs/deploy.md`를 본다. 이 문서는 "그게 다 뭔지"를 쉽게 정리한다.

## 1. 용어 한 줄씩

| 용어 | 한 줄 설명 | 비유 |
|---|---|---|
| **도커 (Docker)** | 프로그램을 상자에 담아 실행해 주는 도구 | 상자 공장 |
| **Dockerfile** | 이미지를 만드는 방법을 적은 글 | 레시피 |
| **이미지** | 레시피대로 만든 결과물. 프로그램과 실행 환경이 통째로 들어 있다 | 설치 CD |
| **컨테이너** | 이미지를 실제로 실행한 것. 배근이가 이 안에서 돌아간다 | CD로 켠 게임 |
| **컴포즈 (Compose)** | 컨테이너를 어떻게 켤지 적은 설정 (`compose.yml`) | 사용 설명서 |

```
Dockerfile ──만들기(build)──▶ 💿 이미지 ──실행(run)──▶ 📦 컨테이너
 (레시피)                      (설치 CD)               (돌아가는 배근이)
```

## 2. 왜 상자에 담나

- **설치할 게 없다**: Node.js, 라이브러리가 이미지 안에 다 들어 있다. 서버에는 도커만 있으면 된다.
- **서로 안 섞인다**: 프로젝트마다 상자가 따로라 버전이 달라도 충돌하지 않는다.
- **망가지면 새로 찍는다**: 상자는 버리고 다시 만들면 된다. 어디서 돌려도 똑같이 동작한다.

## 3. 배근이 이미지 안에 든 것

```
💿 team-splitter-bot (약 400MB)
   ├── 리눅스 (최소한만)
   ├── Node.js 22
   ├── 라이브러리 (discord.js, better-sqlite3)
   └── 배근이 코드 (빌드된 것)
```

이미지는 폴더에 보이는 파일이 아니라 **도커가 내부에 따로 보관**한다. 목록은 명령으로 본다.

```bash
ssh aws-ubuntu-1 'docker images'
```

## 4. 지금 서버 구조

```
🖥️ 서버 (aws-ubuntu-1, Lightsail 서울)
│
├── 📁 ~/services/team-splitter/     ← 배근이 폴더 (GitHub에서 받은 것)
│     ├── src/, Dockerfile ...       → 이미지를 만드는 재료
│     ├── compose.yml                → 켜는 방법 (자동 재시작, 로그 크기 등)
│     ├── .env                       → 🔑 봇 토큰
│     └── data/                      → 💾 DB 저장 공간
│
└── 🐳 도커
      ├── 💿 이미지: team-splitter-bot
      └── 📦 컨테이너: team-splitter-bot-1 (실행 중)
            └── data/ 폴더를 연결해서 읽고 씀
```

**핵심: 상자(컨테이너)는 언제든 버리고 새로 만들지만, 저장 공간(`data/`)은 상자 밖 폴더에 있어서 지워지지 않는다.**

### 폴더 안 파일은 언제 쓰이나

| 파일 | 쓰이는 때 | 역할 |
|---|---|---|
| `src/`, `package.json`, `Dockerfile` | 빌드할 때 | 이미지를 만드는 재료와 레시피 |
| `compose.yml` | 켤 때 | 컨테이너 실행 설정 |
| `.env` | 실행 중 계속 | 봇 토큰. 보안 때문에 이미지에 넣지 않고 켤 때 넣어 준다 |
| `data/` | 실행 중 계속 | DB 파일. 컨테이너가 실시간으로 읽고 쓴다 |

## 5. 데이터는 어디서 보나

데이터는 서버의 `~/services/team-splitter/data/`에 있다. `compose.yml`의 `volumes: ./data:/app/data`가 이 폴더를 컨테이너와 연결한다.

| 보고 싶은 것 | 명령 (맥 터미널) |
|---|---|
| 로그 (봇이 하는 일) | `ssh aws-ubuntu-1 'cd ~/services/team-splitter && docker compose logs -f --tail 50'` |
| 살아 있는지 | `ssh aws-ubuntu-1 'cd ~/services/team-splitter && docker compose ps'` |
| 데이터 파일 | `ssh aws-ubuntu-1 'ls -la ~/services/team-splitter/data'` |

배근이 DB에는 진행 중인 판만 잠깐 저장되고 판이 끝나면 지워진다. 열어 봐도 거의 비어 있는 게 정상이다.

## 6. 무엇을 지우면 안 되나

| 파일 | 지우면 | 복구 |
|---|---|---|
| `data/` | 저장된 데이터가 사라진다 | **불가. 서버에만 있다** |
| `.env` | 다음 재시작부터 봇이 로그인을 못 한다 | 맥의 `.env.local`을 다시 올린다 |
| 코드 (`src/` 등) | 지금 봇은 돌지만 다음 업데이트를 못 한다 | `git clone`으로 다시 받는다 |

→ 폴더는 **통째로 두는 게 맞다.**

## 7. 업데이트할 때 일어나는 일

```bash
ssh aws-ubuntu-1 'cd ~/services/team-splitter && git pull && docker compose up -d --build'
```

```
1. git pull                  코드를 최신으로 받는다
2. --build                   새 코드로 새 이미지를 만든다
3. up -d                     옛 컨테이너를 버리고 새 이미지로 새 컨테이너를 켠다
                             (data/ 는 그대로 이어서 쓴다)
```

재시작하는 몇 초 동안만 봇이 응답하지 않는다.

## 8. 다른 프로젝트를 올리면

```
📁 ~/services/
   ├── team-splitter/  →  📦 배근이 컨테이너
   ├── 블로그/          →  📦 블로그 컨테이너
   └── 다른앱/          →  📦 다른앱 컨테이너
```

**폴더 하나 = 컨테이너 하나.** 새 폴더에 코드, `Dockerfile`, `compose.yml`을 두고 `docker compose up -d --build`를 실행하면 서로 간섭 없이 따로 돌아간다.

- 웹처럼 외부에서 접속하는 서비스는 포트 겹침, Lightsail 방화벽, 도메인과 HTTPS를 추가로 챙겨야 한다.
- 서비스가 늘면 메모리 여유를 위해 스왑(1~2GB) 설정을 권한다. 지금은 스왑이 없다.
