# INDEX

team-splitter 문서 색인. 질문을 받으면 이 파일을 먼저 읽고, `keywords`로 필요한 문서를 골라 연다.

```yaml
documents:
  - path: docs/spec.md
    title: 기능 명세
    summary: 봇의 목적과 목표, 명령어(/team generate, /team assemble)와 버튼(split team, assemble), 팀 편성 규칙, 분배·모으기 동작, 꼬이지 않게 하는 안전장치, 알려진 제약을 정의한다.
    keywords: [목적, 목표, 기능, 명령어, /team generate, /team assemble, split team, assemble, 팀 편성, team, number, non-target, 미지정, 분배, 모으기, 자동 정리, 안전장치, 제약, 재시작]

  - path: docs/tech.md
    title: 기술 구성
    summary: AWS Lightsail 서울 서버 한 대에 Docker로 상시 실행하는 구성. discord.js 게이트웨이 연결로 명령과 음성 상태를 받는 방식, 자동 정리, 사용하는 디스코드 API, 봇 권한, SQLite 저장, 환경변수, 폴더 구조, 서버 비용을 정리한다.
    keywords: [기술 스택, AWS, Lightsail, Docker, Docker Compose, 상시 실행, discord.js, 게이트웨이, voice_states, voiceStateUpdate, 자동 정리, REST API, 권한, Intents, SQLite, 저장, 환경변수, 폴더 구조, 비용]

  - path: docs/setup.md
    title: 봇 등록·배포 가이드
    summary: 디스코드 Developer Portal에서 앱·봇 등록, Installation 설정, AWS Lightsail 서버 준비(인스턴스·고정 IP·Docker), Docker Compose 배포와 업데이트, 슬래시 명령 등록, 서버 초대까지 순서대로 정리한 체크리스트와 트러블슈팅.
    keywords: [봇 등록, 셋업, Developer Portal, 봇 토큰, Application ID, Public Bot, Installation, 초대 링크, 권한, AWS, Lightsail, 고정 IP, SSH, Docker, Docker Compose, 배포, 업데이트, 로그, 스냅샷, 환경변수, 명령 등록, 트러블슈팅]

  - path: docs/persona.md
    title: 봇 페르소나 (배근이)
    summary: 셔틀봇 안내 메시지의 캐릭터 설정과 말투 규칙. 문구는 src/messages.ts, 이미지는 assets/persona/.
    keywords: [페르소나, 말투, 배근이, 캐릭터, 안내 문구, messages, 이미지, 프로필]

  - path: docs/deploy.md
    title: 서버 배포 런북
    summary: 내 맥에서 ssh aws-ubuntu-1로 Lightsail 서버에 접속해 git clone, .env 업로드, data 폴더 준비, docker compose 실행, 로그 확인까지 그대로 따라 하는 배포 절차. 업데이트, 되돌리기, 자주 쓰는 명령 포함.
    keywords: [배포, 런북, SSH, aws-ubuntu-1, git clone, scp, .env, docker compose, 업데이트, git pull, 로그, 되돌리기, 재시작]

  - path: docs/discord-guide.md
    title: 디스코드 안내 문구
    summary: 디스코드에 붙여넣는 셔틀봇(배근이) 문구 모음. 이용안내 채널 게시글, 개발자 포털 일반 정보 설명(400자). 배근이 페르소나 말투.
    keywords: [이용안내, 안내 채널, 매뉴얼, 개발자 포털, 설명, 자기소개, 페르소나, 배근이]
```

문서를 고치면 해당 문서의 프론트매터와 이 색인을 같이 갱신한다.
