# INDEX

team-splitter 문서 색인. 질문을 받으면 이 파일을 먼저 읽고, `keywords`로 필요한 문서를 골라 연다.

```yaml
documents:
  - path: docs/spec.md
    title: 기능 명세
    summary: 봇의 목적과 목표, 명령어(/team generate, /team assemble)와 버튼(split team, assemble), 팀 편성 규칙, 분배·모으기 동작, 꼬이지 않게 하는 안전장치를 정의한다.
    keywords: [목적, 목표, 기능, 명령어, /team generate, /team assemble, split team, assemble, 팀 편성, team, number, non-target, 미지정, 분배, 모으기, 자동 종료, 안전장치]

  - path: docs/tech.md
    title: 기술 구성
    summary: 사용할 기술(TypeScript, discord.js), 봇 권한과 Intents, 진행 중인 판을 저장하는 JSON 파일, 폴더 구조를 정리한다.
    keywords: [기술 스택, TypeScript, Node.js, discord.js, Vitest, 권한, Intents, 저장, JSON, 환경변수, 폴더 구조]
```

문서를 고치면 해당 문서의 프론트매터와 이 색인을 같이 갱신한다.
