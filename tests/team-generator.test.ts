import { describe, expect, it } from 'vitest';
import { generateTeams, shuffle } from '../src/domain/team-generator.js';

const people = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);
/** 섞지 않는 난수: 항상 마지막 자리를 고른다 */
const noShuffle = (max: number) => max - 1;

function sizesOf(n: number, options = {}) {
  const result = generateTeams(people(n), options, noShuffle);
  if (!result.ok) throw new Error(`shortBy ${result.shortBy}`);
  return { sizes: result.teams.map((t) => t.length), unassigned: result.unassigned.length };
}

describe('generateTeams', () => {
  it('옵션이 없으면 2팀 균등', () => {
    expect(sizesOf(10)).toEqual({ sizes: [5, 5], unassigned: 0 });
    expect(sizesOf(7)).toEqual({ sizes: [4, 3], unassigned: 0 });
  });

  it('team:K 는 K팀에 균등하게 나눈다', () => {
    expect(sizesOf(10, { team: 3 })).toEqual({ sizes: [4, 3, 3], unassigned: 0 });
  });

  it('number:S 는 S명씩 나누고 남는 사람은 미지정', () => {
    expect(sizesOf(10, { number: 4 })).toEqual({ sizes: [4, 4], unassigned: 2 });
  });

  it('team + number 는 딱 K팀 × S명까지, 모자라면 앞 팀부터 채운다', () => {
    expect(sizesOf(10, { team: 3, number: 2 })).toEqual({ sizes: [2, 2, 2], unassigned: 4 });
    expect(sizesOf(10, { team: 3, number: 4 })).toEqual({ sizes: [4, 4, 2], unassigned: 0 });
  });

  it('빈 팀은 만들지 않는다', () => {
    expect(sizesOf(1)).toEqual({ sizes: [1], unassigned: 0 });
    expect(sizesOf(2, { team: 5 })).toEqual({ sizes: [1, 1], unassigned: 0 });
    expect(sizesOf(5, { team: 3, number: 4 })).toEqual({ sizes: [4, 1], unassigned: 0 });
  });

  it('팀이 0개면 부족한 인원을 알려준다', () => {
    expect(generateTeams(people(3), { number: 5 })).toEqual({ ok: false, shortBy: 2 });
    expect(generateTeams([], {})).toEqual({ ok: false, shortBy: 1 });
  });

  it('모든 참가자가 정확히 한 번씩 들어간다', () => {
    const result = generateTeams(people(11), { team: 3, number: 3 });
    if (!result.ok) throw new Error('unexpected');
    const all = [...result.teams.flat(), ...result.unassigned].sort();
    expect(all).toEqual(people(11).sort());
  });
});

describe('shuffle', () => {
  it('원본을 바꾸지 않고 같은 원소를 돌려준다', () => {
    const input = people(20);
    const output = shuffle(input);
    expect(input).toEqual(people(20));
    expect([...output].sort()).toEqual([...input].sort());
  });
});
