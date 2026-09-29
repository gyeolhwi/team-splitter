# INDEX

team-splitter 문서 색인. 질문을 받으면 이 파일을 먼저 읽고, `keywords`로 필요한 문서를 골라 연다.

```yaml
documents:
  - path: docs/spec.md
    title: 기능 명세
    summary: 봇의 목적과 목표, 명령어(/team generate, /team assemble)와 버튼(split team, assemble), 팀 편성 규칙, 분배·모으기 동작, 꼬이지 않게 하는 안전장치, 알려진 제약을 정의한다.
    keywords: [목적, 목표, 기능, 명령어, /team generate, /team assemble, split team, assemble, 팀 편성, team, number, non-target, 미지정, 분배, 모으기, 자동 정리, 안전장치, 제약, 사용량 한도]

  - path: docs/tech.md
    title: 기술 구성
    summary: Vercel 서버리스 + Supabase 무료 구성, 음성 접속자를 알아내는 '잠깐 연결' 방식과 그 한도, 사용하는 디스코드 API, 봇 권한, 저장 테이블, 환경변수, 폴더 구조를 정리한다.
    keywords: [기술 스택, Vercel, Supabase, 서버리스, TypeScript, 게이트웨이, 잠깐 연결, voice_states, 연결 한도, REST API, 권한, Intents, 저장, 환경변수, 폴더 구조, cron]

  - path: docs/setup.md
    title: 봇 등록·배포 가이드
    summary: 디스코드 Developer Portal에서 앱·봇 등록, Installation 설정, Supabase·Vercel 설정, Interactions Endpoint URL 등록, 슬래시 명령 등록, 서버 초대까지 순서대로 정리한 체크리스트와 트러블슈팅.
    keywords: [봇 등록, 셋업, Developer Portal, 봇 토큰, Public Key, Application ID, Public Bot, Installation, 초대 링크, 권한, Interactions Endpoint URL, Vercel, 배포 보호, 환경변수, Supabase, 명령 등록, 트러블슈팅]
```

문서를 고치면 해당 문서의 프론트매터와 이 색인을 같이 갱신한다.
