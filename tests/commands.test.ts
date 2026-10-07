import { describe, expect, it } from 'vitest';
import { formatDraft, parseMentions } from '../src/discord/commands.js';
import { MSG } from '../src/messages.js';
import type { Session } from '../src/store/db.js';

describe('parseMentions', () => {
  it('멘션에서 사용자 ID만 뽑는다', () => {
    expect(parseMentions('<@111> <@!222>,<@111> 아무글자')).toEqual(new Set(['111', '222']));
  });

  it('멘션이 없으면 빈 집합', () => {
    expect(parseMentions('철수 영희')).toEqual(new Set());
  });
});

describe('formatDraft', () => {
  const session: Session = {
    id: 's1',
    guildId: 'g',
    lobbyId: 'lobby',
    hostId: 'host',
    participantIds: ['a', 'b', 'c'],
    teams: [['a'], ['b']],
    teamChannelIds: [],
    status: 'draft',
    createdAt: 0,
  };

  it('제외한 사람을 미지정과 따로 보여준다', () => {
    const text = formatDraft(session, ['c'], ['x', 'y']);
    expect(text).toContain(`${MSG.unassigned(1)} <@c>`);
    expect(text).toContain(`${MSG.excluded(2)} <@x> <@y>`);
  });

  it('제외한 사람이 없으면 제외 줄이 없다', () => {
    expect(formatDraft(session, [], [])).not.toContain(MSG.excluded(0));
  });
});
