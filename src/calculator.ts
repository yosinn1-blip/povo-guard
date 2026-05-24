import type { AccountStatus, PovoAccountRow } from './types';

export function calculateStatus(lastExpiry: Date | null): {
  daysElapsed: number;
  daysRemaining: number;
  urgency: 'safe' | 'warning' | 'danger';
} {
  if (!lastExpiry) {
    return { daysElapsed: 180, daysRemaining: 0, urgency: 'danger' };
  }

  // expiry当日からカウント（当日=0, 翌日=1）
  const startDate = new Date(lastExpiry);
  startDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysElapsed = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = 180 - Math.max(0, daysElapsed);

  const urgency =
    daysRemaining > 60 ? 'safe' :
    daysRemaining > 30 ? 'warning' : 'danger';

  return { daysElapsed: Math.max(0, daysElapsed), daysRemaining, urgency };
}

export function buildAccountStatus(account: PovoAccountRow): AccountStatus {
  const expiry = account.last_expiry ? new Date(account.last_expiry) : null;
  const { daysElapsed, daysRemaining, urgency } = calculateStatus(expiry);
  return { account, daysElapsed, daysRemaining, urgency };
}
