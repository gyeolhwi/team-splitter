import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { handleInteraction, replyError } from './discord/commands.js';
import { ERR, STATUS } from './messages.js';
import { SessionService } from './services/session.js';
import { SessionStore } from './store/db.js';

const PURGE_INTERVAL_MS = 60 * 60_000;

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN 환경변수가 없습니다.');
  process.exit(1);
}

const store = new SessionStore(process.env.DB_PATH ?? 'data/team-splitter.db');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  presence: { activities: [{ type: ActivityType.Custom, name: 'custom', state: STATUS }] },
});
const service = new SessionService(store, (guildId) => client.guilds.cache.get(guildId));
let purgeTimer: NodeJS.Timeout | undefined;

client.once(Events.ClientReady, (ready) => {
  console.log(`로그인 완료: ${ready.user.tag} (서버 ${ready.guilds.cache.size}개)`);
  service.checkOnStartup();
  service.purgeOldDrafts();
  purgeTimer = setInterval(() => service.purgeOldDrafts(), PURGE_INTERVAL_MS);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction, service);
  } catch (error) {
    console.error('interaction 처리 실패', error);
    if (interaction.isRepliable()) {
      await replyError(interaction, ERR.unknown).catch(() => undefined);
    }
  }
});

client.on(Events.VoiceStateUpdate, (oldState) => service.onVoiceStateUpdate(oldState));

function shutdown(signal: string) {
  console.log(`${signal} 수신, 종료합니다.`);
  clearInterval(purgeTimer);
  service.stop();
  void client.destroy().finally(() => {
    store.close();
    process.exit(0);
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

await client.login(token);
