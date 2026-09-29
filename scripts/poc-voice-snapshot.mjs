// POC: 디스코드에 "잠깐 연결"해서 음성 접속자 목록을 받아올 수 있는지 확인한다.
//
// 실행: node --env-file=.env.local scripts/poc-voice-snapshot.mjs
// 필요한 env: DISCORD_BOT_TOKEN
//
// 확인 항목:
//   1) 연결 → 목록 수신까지 걸리는 시간
//   2) GUILD_CREATE.voice_states 에 음성 접속자가 정확히 들어 있는가
//   3) 이름·봇 여부를 GUILD_CREATE.members 로 알 수 있는가 (없으면 REST 로 보충)
//   4) 연결 1회당 하루 한도(session_start_limit)가 1씩 줄어드는가
//
// 읽기 전용이다. 채널 생성·이동·삭제는 하지 않는다.

const API = "https://discord.com/api/v10";
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error("✖ DISCORD_BOT_TOKEN 이 없습니다 (.env.local 확인)");
  process.exit(1);
}
const H = { Authorization: `Bot ${TOKEN}` };
const INTENTS = 1 | 128; // GUILDS | GUILD_VOICE_STATES
const TIMEOUT_MS = 15_000;

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: H });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 1) 하루 한도 확인
const before = await api("/gateway/bot");
if (before.status !== 200) {
  console.error("✖ /gateway/bot 실패", before.status, before.json);
  process.exit(1);
}
const limit = before.json.session_start_limit;
console.log(`하루 연결 한도: 남은 ${limit.remaining} / ${limit.total} (초기화까지 ${Math.round(limit.reset_after / 60000)}분), 동시 ${limit.max_concurrency}`);

// 2) 잠깐 연결
const t0 = Date.now();
const guilds = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${before.json.url}/?v=10&encoding=json`);
  const received = [];
  let expected = null;
  const timer = setTimeout(() => {
    ws.close(1000);
    reject(new Error(`시간 초과 (${TIMEOUT_MS}ms). 받은 서버 ${received.length}개`));
  }, TIMEOUT_MS);

  const finish = () => {
    clearTimeout(timer);
    ws.close(1000);
    resolve(received);
  };

  ws.onmessage = (event) => {
    const { op, t, d } = JSON.parse(event.data);
    if (op === 10) {
      // HELLO → IDENTIFY. 몇 초 안에 끊으므로 heartbeat 는 보내지 않는다.
      ws.send(JSON.stringify({
        op: 2,
        d: { token: TOKEN, intents: INTENTS, properties: { os: "linux", browser: "team-splitter", device: "team-splitter" } },
      }));
    } else if (op === 9) {
      clearTimeout(timer);
      ws.close(1000);
      reject(new Error("세션 거절(op 9). 5초 뒤 다시 시도하세요"));
    } else if (t === "READY") {
      expected = d.guilds.length;
      console.log(`READY: ${Date.now() - t0}ms, 봇이 속한 서버 ${expected}개`);
      if (expected === 0) finish();
    } else if (t === "GUILD_CREATE") {
      received.push(d);
      if (received.length === expected) finish();
    }
  };
  ws.onerror = (e) => {
    clearTimeout(timer);
    reject(new Error(`WebSocket 오류: ${e.message ?? e.type}`));
  };
});
console.log(`목록 수신 완료: ${Date.now() - t0}ms\n`);

// 3) 서버별 음성 접속자 출력
for (const g of guilds) {
  const channelName = new Map(g.channels.map((c) => [c.id, c.name]));
  const memberById = new Map(g.members.map((m) => [m.user.id, m]));
  console.log(`■ ${g.name} (${g.id}) — 멤버 ${g.member_count}명, 음성 접속 ${g.voice_states.length}명`);

  const byChannel = new Map();
  for (const vs of g.voice_states) {
    if (!byChannel.has(vs.channel_id)) byChannel.set(vs.channel_id, []);
    byChannel.get(vs.channel_id).push(vs);
  }

  let missing = 0;
  for (const [channelId, states] of byChannel) {
    console.log(`  🔊 ${channelName.get(channelId) ?? channelId}`);
    for (const vs of states) {
      let m = memberById.get(vs.user_id);
      let source = "GUILD_CREATE";
      if (!m) {
        missing++;
        const r = await api(`/guilds/${g.id}/members/${vs.user_id}`);
        m = r.status === 200 ? r.json : null;
        source = `REST ${r.status}`;
      }
      const name = m ? (m.nick ?? m.user.global_name ?? m.user.username) : "?";
      const flags = [m?.user.bot ? "봇" : null, vs.self_mute ? "마이크 음소거" : null, vs.self_deaf ? "헤드셋 음소거" : null].filter(Boolean);
      console.log(`     - ${name} (${vs.user_id}) ${flags.length ? `[${flags.join(", ")}]` : ""} ← ${source}`);
    }
  }
  console.log(`  멤버 정보 누락(REST 로 보충): ${missing}명\n`);
}

// 4) 한도가 1 줄었는지
const after = await api("/gateway/bot");
console.log(`연결 후 남은 한도: ${after.json?.session_start_limit?.remaining} (이전 ${limit.remaining})`);
