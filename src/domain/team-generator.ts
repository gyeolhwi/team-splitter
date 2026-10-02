import { randomInt } from 'node:crypto';

export interface TeamOptions {
  /** 팀 수 (team:N) */
  team?: number;
  /** 팀당 인원 (number:N) */
  number?: number;
}

export type TeamResult =
  | { ok: true; teams: string[][]; unassigned: string[] }
  | { ok: false; shortBy: number };

/** max 미만의 정수를 뽑는다. 테스트에서 바꿔 끼울 수 있다. */
export type RandomInt = (max: number) => number;

export function shuffle<T>(items: readonly T[], rand: RandomInt = randomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * 참가자를 섞어서 팀을 나눈다. 규칙은 docs/spec.md 4번.
 * 빈 팀은 만들지 않는다. 팀이 하나도 안 나오면 몇 명이 부족한지 돌려준다.
 */
export function generateTeams(
  participantIds: readonly string[],
  options: TeamOptions = {},
  rand: RandomInt = randomInt,
): TeamResult {
  const people = shuffle(participantIds, rand);
  const sizes = teamSizes(people.length, options);

  const teams: string[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    if (size === 0) continue;
    teams.push(people.slice(cursor, cursor + size));
    cursor += size;
  }

  if (teams.length === 0) {
    return { ok: false, shortBy: (options.number ?? 1) - people.length };
  }
  return { ok: true, teams, unassigned: people.slice(cursor) };
}

function teamSizes(count: number, { team, number }: TeamOptions): number[] {
  if (team && number) {
    // 딱 team × number 까지. 모자라면 앞 팀부터 채운다.
    const sizes: number[] = [];
    let left = count;
    for (let i = 0; i < team; i++) {
      const size = Math.min(number, left);
      sizes.push(size);
      left -= size;
    }
    return sizes;
  }
  if (number) {
    return Array.from({ length: Math.floor(count / number) }, () => number);
  }
  return evenSizes(count, team ?? 2);
}

function evenSizes(count: number, teamCount: number): number[] {
  const base = Math.floor(count / teamCount);
  const extra = count % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}
