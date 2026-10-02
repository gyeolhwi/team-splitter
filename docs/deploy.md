---
id: deploy
title: 서버 배포 런북
category: setup
summary: 내 맥에서 ssh aws-ubuntu-1로 Lightsail 서버에 접속해 git clone, .env 업로드, data 폴더 준비, docker compose 실행, 로그 확인까지 그대로 따라 하는 배포 절차. 업데이트, 되돌리기, 자주 쓰는 명령 포함.
keywords: [배포, 런북, SSH, aws-ubuntu-1, git clone, scp, .env, docker compose, 업데이트, git pull, 로그, 되돌리기, 재시작]
related_files: [Dockerfile, compose.yml, .env.example, docs/setup.md]
last_updated: 2026-10-02
---

# 서버 배포 런북

내 맥에서 Lightsail 서버(`aws-ubuntu-1`)에 셔틀봇을 올리는 절차다. 위에서부터 그대로 따라 하면 된다.
각 단계 제목의 **[맥]**, **[서버]**는 명령을 실행하는 곳이다.

## 0. 준비물 (한 번만)

| 항목 | 확인 방법 |
|---|---|
| 서버 준비 완료 (인스턴스·고정 IP·Docker·`~/services`) | `docs/setup.md` 3번 |
| 맥의 `~/.ssh/config`에 `Host aws-ubuntu-1` 항목 | `ssh aws-ubuntu-1`로 접속되면 OK |
| 맥의 프로젝트 폴더에 `.env.local` (애플리케이션 ID, 봇 토큰) | `docs/setup.md` 1~2번 |

`~/.ssh/config` 항목 예시:

```
Host aws-ubuntu-1
	HostName <고정 IP>
	User ubuntu
	IdentityFile ~/.ssh/lightsail-seoul-aws-ubuntu-1.pem
```

## 1. [맥] 로컬 봇 끄기

맥에서 `npm run dev`로 봇을 켜 뒀다면 먼저 끈다(`Ctrl+C`). 같은 봇이 두 군데서 켜져 있으면 명령이 양쪽으로 들어가서 꼬인다.

## 2. [맥 → 서버] 접속 확인

```bash
ssh aws-ubuntu-1 'whoami && docker compose version && ls ~/services'
```

`ubuntu`와 Docker Compose 버전이 나오면 된다.

## 3. [서버] 코드 받기

```bash
ssh aws-ubuntu-1
cd ~/services
git clone https://github.com/gyeolhwi/team-splitter.git
cd team-splitter
mkdir -p data
exit
```

- `mkdir -p data`는 **꼭 docker 실행 전에** 한다. 없으면 Docker가 root 소유로 만들어서 봇이 DB 파일을 못 만들고 재시작을 반복한다.

## 4. [맥] 토큰 파일(.env) 올리기

맥의 프로젝트 폴더에서 실행한다. 토큰을 채팅이나 화면에 붙여넣지 않고 파일째로 보낸다.

```bash
scp .env.local aws-ubuntu-1:services/team-splitter/.env
ssh aws-ubuntu-1 'chmod 600 ~/services/team-splitter/.env && cut -d= -f1 ~/services/team-splitter/.env'
```

`DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN` 두 줄이 나오면 된다(값은 보이지 않는다).

## 5. [서버] 빌드하고 실행

```bash
ssh aws-ubuntu-1
cd ~/services/team-splitter
docker compose up -d --build
```

처음에는 이미지 빌드 때문에 몇 분 걸린다.

## 6. [서버] 실행 확인

```bash
docker compose ps                  # STATUS 가 Up 이면 실행 중
docker compose logs -f --tail 50   # "로그인 완료: 배근이#..." 가 보이면 정상. Ctrl+C 로 빠져나온다
```

디스코드에서 봇이 **온라인**으로 보이면 배포 끝이다.

- `compose.yml`의 `restart: unless-stopped` 덕분에 봇이 죽거나 서버가 재부팅돼도 자동으로 다시 켜진다.
- 진행 중인 판은 `data/team-splitter.db`에 저장된다. `data` 폴더는 지우지 않는다.

## 7. [맥] 슬래시 명령 등록 (필요할 때만)

명령 정의(`scripts/register-commands.mjs`)를 바꿨을 때만 맥에서 한 번 실행한다. 코드 배포와는 별개다.

```bash
npm run register
```

---

## 코드가 바뀌었을 때 (업데이트)

main에 merge된 뒤 실행한다.

```bash
ssh aws-ubuntu-1 'cd ~/services/team-splitter && git pull && docker compose up -d --build && docker compose logs --tail 20'
```

- 재시작하는 몇 초 동안은 봇이 응답하지 않는다. 진행 중인 판은 유지된다.
- `.env`를 바꿨을 때는 4번처럼 다시 올린 뒤 `docker compose up -d`를 실행한다.

## 문제가 생겼을 때 되돌리기

```bash
ssh aws-ubuntu-1
cd ~/services/team-splitter
git log --oneline -5                 # 되돌아갈 커밋 확인
git checkout <커밋>                   # 그 커밋으로 이동
docker compose up -d --build
# 고친 뒤 원래대로: git checkout main && git pull && docker compose up -d --build
```

## 자주 쓰는 명령 ([서버] `~/services/team-splitter`에서)

| 하고 싶은 것 | 명령 |
|---|---|
| 로그 보기 | `docker compose logs -f --tail 100` |
| 재시작 | `docker compose restart` |
| 멈추기 (로컬에서 테스트할 때) | `docker compose down` |
| 다시 켜기 | `docker compose up -d` |
| 서버 전체 메모리 확인 | `docker stats --no-stream` |
| 안 쓰는 이미지 정리 (디스크 부족) | `docker image prune -a` |

맥에서 접속하지 않고 한 번에 실행하려면 `ssh aws-ubuntu-1 'cd ~/services/team-splitter && <명령>'` 형태로 쓴다.

문제 해결은 `docs/setup.md`의 트러블슈팅 표를 본다.
