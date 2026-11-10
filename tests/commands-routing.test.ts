import { ChannelType, Collection } from 'discord.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SessionService } from '../src/services/session.js';
import { SessionStore } from '../src/store/db.js';

const OPTION_USER = 'opt1';
let handleInteraction: (typeof import('../src/discord/commands.js'))['handleInteraction'];
let store: SessionStore;
let service: SessionService;

beforeAll(async () => {
  // OPERATOR_IDS 는 모듈을 불러올 때 읽으므로 먼저 넣고 불러온다.
  vi.stubEnv('OPERATOR_IDS', `${OPTION_USER},opt2`);
  ({ handleInteraction } = await import('../src/discord/commands.js'));
  store = new SessionStore(':memory:');
  service = new SessionService(store, () => undefined);
});

afterAll(() => {
  service.stop();
  store.close();
  vi.unstubAllEnvs();
});

/** 테스트에 필요한 만큼만 흉내 낸 /팀짜기 명령. 응답 방식을 calls 에 남긴다. */
async function generate(userId: string, memberIds: string[]) {
  const members = new Collection(
    memberIds.map((id) => [id, { id, displayName: id, user: { id, bot: false, username: id } }] as const),
  );
  const lobby = { id: 'lobby', name: '로비', type: ChannelType.GuildVoice, guild: { id: 'g' }, members };
  const calls: string[] = [];
  const interaction = {
    id: `i-${calls.length}-${Math.random()}`,
    commandName: '팀짜기',
    user: { id: userId },
    member: { voice: { channel: lobby } },
    options: { getInteger: () => null, getString: () => null },
    replied: false,
    deferred: false,
    inCachedGuild: () => true,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    reply: async (payload: { flags?: unknown }) => void calls.push(payload.flags ? 'ephemeral' : 'public'),
    showModal: async () => void calls.push('modal'),
  };
  await handleInteraction(interaction as never, service);
  return calls;
}

describe('/팀짜기 처리 경로', () => {
  it('일반 사용자는 바로 공개 결과를 받는다', async () => {
    expect(await generate('someone', ['a', 'b', 'c', 'd'])).toEqual(['public']);
  });

  it('설정한 사용자는 입력 팝업만 받고 채널에는 아무것도 올라가지 않는다', async () => {
    expect(await generate(OPTION_USER, [OPTION_USER, 'b', 'c', 'd'])).toEqual(['modal']);
  });

  it('설정한 사용자도 편성할 수 없는 상황이면 평소와 같은 오류를 받는다', async () => {
    expect(await generate(OPTION_USER, [OPTION_USER])).toEqual(['ephemeral']);
  });
});
