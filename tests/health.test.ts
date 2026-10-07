import { describe, expect, it } from 'vitest';
import { formatPing } from '../src/discord/commands.js';
import { findProblems, formatUptime, type HealthInput } from '../src/domain/health.js';
import { MSG } from '../src/messages.js';

const healthy: HealthInput = { gatewayMs: 42, latencyMs: 80, uptimeMs: 3_600_000, dbOk: true };

describe('findProblems', () => {
  it('모두 정상이면 문제 없음', () => {
    expect(findProblems(healthy)).toEqual([]);
  });

  it('DB 점검 실패와 느린 게이트웨이를 잡는다', () => {
    expect(findProblems({ ...healthy, dbOk: false, gatewayMs: 1500 })).toEqual(['db', 'gateway']);
  });

  it('게이트웨이를 아직 재지 못했으면(-1) 문제로 보지 않는다', () => {
    expect(findProblems({ ...healthy, gatewayMs: -1 })).toEqual([]);
  });
});

describe('formatUptime', () => {
  it.each([
    [42_000, '42초'],
    [5 * 60_000, '5분'],
    [(2 * 60 + 3) * 60_000, '2시간 3분'],
    [(3 * 24 * 60 + 5) * 60_000, '3일 0시간 5분'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatUptime(ms)).toBe(expected);
  });
});

describe('formatPing', () => {
  it('정상이면 정상 운행 문구와 수치를 보여준다', () => {
    const text = formatPing(healthy);
    expect(text.startsWith(MSG.pingOk)).toBe(true);
    expect(text).toContain('디스코드 연결 42ms · 명령 수신 80ms');
    expect(text).toContain('가동 시간 1시간 0분');
    expect(text).toContain('저장소(DB) 정상');
  });

  it('이상이 있으면 어느 항목인지 알려준다', () => {
    const text = formatPing({ ...healthy, dbOk: false });
    expect(text.startsWith(MSG.pingBad)).toBe(true);
    expect(text).toContain(MSG.pingProblem.db);
    expect(text).not.toContain(MSG.pingProblem.gateway);
    expect(text).toContain('저장소(DB) 이상');
  });
});
