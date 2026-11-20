import { parseIds } from './auth.js';
import { BoardStore } from './board-store.js';
import { discordDm, noNotify } from './notify.js';
import { createBoardServer } from './server.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} 환경변수가 없습니다.`);
    process.exit(1);
  }
  return value;
}

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  console.error('SESSION_SECRET 은 32자 이상이어야 합니다. (openssl rand -hex 32)');
  process.exit(1);
}
const adminId = required('ADMIN_ID');
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) console.warn('DISCORD_BOT_TOKEN 이 없어 관리자 DM 알림을 끕니다.');

const store = new BoardStore(process.env.DB_PATH ?? 'data/board.db');
const server = createBoardServer(
  {
    baseUrl: required('BOARD_BASE_URL').replace(/\/+$/, ''),
    clientId: required('DISCORD_APPLICATION_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    sessionSecret,
    adminId,
    allowedIds: parseIds(process.env.ALLOWED_IDS),
  },
  store,
  botToken ? discordDm(botToken, adminId) : noNotify,
);

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`게시판 시작: 포트 ${port}`));

function shutdown(signal: string) {
  console.log(`${signal} 수신, 게시판을 종료합니다.`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
