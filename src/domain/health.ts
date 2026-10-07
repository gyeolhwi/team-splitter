/** 게이트웨이 지연이 이 값을 넘으면 디스코드 연결이 불안정한 것으로 본다. */
const SLOW_GATEWAY_MS = 1000;

export interface HealthInput {
  /** 게이트웨이 하트비트 지연(ms). 연결 직후 아직 재지 못했으면 음수 */
  gatewayMs: number;
  /** 명령을 친 순간부터 봇이 받기까지 걸린 시간(ms) */
  latencyMs: number;
  uptimeMs: number;
  dbOk: boolean;
}

export type HealthProblem = 'db' | 'gateway';

export function findProblems(input: HealthInput): HealthProblem[] {
  const problems: HealthProblem[] = [];
  if (!input.dbOk) problems.push('db');
  if (input.gatewayMs > SLOW_GATEWAY_MS) problems.push('gateway');
  return problems;
}

/** 가동 시간을 `3일 4시간 5분` 처럼 큰 단위부터 보여준다. 1분 미만이면 초로 보여준다. */
export function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [days && `${days}일`, (days || hours) && `${hours}시간`, `${minutes}분`];
  return parts.filter(Boolean).join(' ');
}
