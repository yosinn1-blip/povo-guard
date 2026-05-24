import type { AccountStatus, PovoAccountRow } from './types';

export function calculateStatus(
  lastExpiry: Date | null,
  suspensionDate: Date | null = null
): {
  daysElapsed: number;
  daysRemaining: number;
  urgency: 'safe' | 'warning' | 'danger';
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // povo公式の停止予告日がある場合はそちらを優先（より正確）
  if (suspensionDate) {
    const sd = new Date(suspensionDate);
    sd.setHours(0, 0, 0, 0);
    const daysRemaining = Math.floor(
      (sd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysElapsed = lastExpiry
      ? Math.max(0, Math.floor((today.getTime() - new Date(lastExpiry).getTime()) / (1000 * 60 * 60 * 24)))
      : 180;
    const urgency = daysRemaining > 60 ? 'safe' : daysRemaining > 0 ? 'danger' : 'danger';
    return { daysElapsed, daysRemaining, urgency };
  }

  if (!lastExpiry) {
    return { daysElapsed: 180, daysRemaining: 0, urgency: 'danger' };
  }

  // 購入日からの経過日数で計算
  const startDate = new Date(lastExpiry);
  startDate.setHours(0, 0, 0, 0);

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
  const suspension = account.povo_suspension_date
    ? new Date(account.povo_suspension_date)
    : null;
  const { daysElapsed, daysRemaining, urgency } = calculateStatus(expiry, suspension);
  return { account, daysElapsed, daysRemaining, urgency };
}
