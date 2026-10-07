import { describe, expect, it } from 'vitest';
import { formatDraft, formatSplit, parseMentions } from '../src/discord/commands.js';
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
    const text = formatDraft(session, '내전방', ['c'], ['x', 'y']);
    expect(text).toContain(`${MSG.unassigned(1)} <@c>`);
    expect(text).toContain(`${MSG.excluded(2)} <@x> <@y>`);
  });

  it('제외한 사람이 없으면 제외 줄이 없다', () => {
    expect(formatDraft(session, '내전방', [], [])).not.toContain(MSG.excluded(0));
  });
});

describe('formatSplit', () => {
  it('채널 멘션 대신 팀 이름과 로비 이름을 적는다', () => {
    const session: Session = {
      id: 's1',
      guildId: 'g',
      lobbyId: 'lobby',
      hostId: 'host',
      participantIds: ['a', 'b', 'c', 'd'],
      teams: [['a', 'b'], ['c', 'd']],
      teamChannelIds: ['111', '222'],
      status: 'active',
      createdAt: 0,
    };
    const text = formatSplit(session, '내전방', []);
    expect(text).not.toContain('<#');
    expect(text).toContain(MSG.splitTitle('내전방'));
    expect(text).toContain(`${MSG.team(0, 2)} <@a> <@b>`);
    expect(text).toContain(`${MSG.team(1, 2)} <@c> <@d>`);
  });
});
