import { describe, expect, it } from 'vitest';
import { parseMentions } from '../src/discord/commands.js';

describe('parseMentions', () => {
  it('멘션에서 사용자 ID만 뽑는다', () => {
    expect(parseMentions('<@111> <@!222>,<@111> 아무글자')).toEqual(new Set(['111', '222']));
  });

  it('멘션이 없으면 빈 집합', () => {
    expect(parseMentions('철수 영희')).toEqual(new Set());
  });
});
