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
 * fixed[i] 는 i번 팀에 먼저 넣을 사람이다. 중복이 없고 팀 크기를 넘지 않는 건 호출하는 쪽이 보장한다.
 */
export function generateTeams(
  participantIds: readonly string[],
  options: TeamOptions = {},
  rand: RandomInt = randomInt,
  fixed: readonly (readonly string[])[] = [],
): TeamResult {
  const pinned = new Set(fixed.flat());
  const people = shuffle(
    participantIds.filter((id) => !pinned.has(id)),
    rand,
  );
  const sizes = plannedSizes(participantIds.length, options);

  if (sizes.length === 0) {
    return { ok: false, shortBy: (options.number ?? 1) - participantIds.length };
  }

  let cursor = 0;
  const teams = sizes.map((size, i) => {
    const own = fixed[i] ?? [];
    const rest = people.slice(cursor, cursor + size - own.length);
    cursor += rest.length;
    // 먼저 넣은 사람이 늘 앞에 오지 않게 팀 안에서도 섞는다.
    return own.length > 0 ? shuffle([...own, ...rest], rand) : rest;
  });
  return { ok: true, teams, unassigned: people.slice(cursor) };
}

/** 인원 수와 옵션으로 정해지는 팀별 인원. 빈 팀은 뺀다. */
export function plannedSizes(count: number, options: TeamOptions = {}): number[] {
  return teamSizes(count, options).filter((size) => size > 0);
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
