// 슬래시 명령을 글로벌로 등록한다. 전체를 덮어쓰는(PUT) 방식이라 여러 번 실행해도 중복되지 않는다.
// 실행: npm run register  (= node --env-file=.env.local scripts/register-commands.mjs)

const { DISCORD_APPLICATION_ID: appId, DISCORD_BOT_TOKEN: token } = process.env;
if (!appId || !token) {
  console.error('DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN 환경변수가 필요합니다.');
  process.exit(1);
}

const SUB_COMMAND = 1;
const STRING = 3;
const INTEGER = 4;
const GUILD_INSTALL = 0;
const GUILD_CONTEXT = 0;

const commands = [
  {
    name: 'team',
    description: '음성채널 인원으로 팀을 나누고 모아요',
    integration_types: [GUILD_INSTALL],
    contexts: [GUILD_CONTEXT],
    options: [
      {
        type: SUB_COMMAND,
        name: 'generate',
        description: '지금 있는 음성채널 인원으로 랜덤 팀을 편성해요',
        options: [
          { type: INTEGER, name: 'team', description: '팀 수', min_value: 1, max_value: 25 },
          { type: INTEGER, name: 'number', description: '팀당 인원', min_value: 1, max_value: 25 },
          { type: STRING, name: 'non-target', description: '뺄 사람 (@멘션을 이어서 입력)' },
        ],
      },
      {
        type: SUB_COMMAND,
        name: 'assemble',
        description: '팀 채널 인원을 로비로 모으고 판을 끝내요',
      },
    ],
  },
];

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error(`등록 실패: ${res.status}`, await res.text());
  process.exit(1);
}
const saved = await res.json();
console.log(`등록 완료: ${saved.map((c) => `/${c.name}`).join(', ')} (반영까지 최대 1시간)`);
