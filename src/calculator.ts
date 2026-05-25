import type { AccountStatus, PovoAccountRow } from './types';

export function calculateStatus(
  lastExpiry: Date | null,
  suspensionDate: Date | null = null,
  terminationDate: Date | null = null
): {
  daysElapsed: number;
  daysRemaining: number;
  urgency: 'safe' | 'warning' | 'danger';
  phase: 'normal' | 'suspension_pending' | 'termination_pending';
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysElapsed = lastExpiry
    ? Math.max(0, Math.floor((today.getTime() - new Date(lastExpiry).getTime()) / (1000 * 60 * 60 * 24)))
    : 180;

  if (suspensionDate) {
    const sd = new Date(suspensionDate);
    sd.setHours(0, 0, 0, 0);
    const daysUntilSuspension = Math.floor(
      (sd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 停止予告日が過ぎていて契約解除予定日がある → 解除日までのカウントダウン
    if (daysUntilSuspension < 0 && terminationDate) {
      const td = new Date(terminationDate);
      td.setHours(0, 0, 0, 0);
      const daysRemaining = Math.floor(
        (td.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { daysElapsed, daysRemaining, urgency: 'danger', phase: 'termination_pending' };
    }

    // 停止予告日までのカウントダウン
    return {
      daysElapsed,
      daysRemaining: daysUntilSuspension,
      urgency: 'danger',
      phase: 'suspension_pending',
    };
  }

  if (!lastExpiry) {
    return { daysElapsed: 180, daysRemaining: 0, urgency: 'danger', phase: 'normal' };
  }

  // 購入日からの経過日数で計算
  const startDate = new Date(lastExpiry);
  startDate.setHours(0, 0, 0, 0);

  const elapsed = Math.max(0, Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ));
  const daysRemaining = 180 - elapsed;

  const urgency =
    daysRemaining > 60 ? 'safe' :
    daysRemaining > 30 ? 'warning' : 'danger';

  return { daysElapsed: elapsed, daysRemaining, urgency, phase: 'normal' };
}

export function buildAccountStatus(account: PovoAccountRow): AccountStatus {
  const expiry = account.last_expiry ? new Date(account.last_expiry) : null;
  const suspension = account.povo_suspension_date
    ? new Date(account.povo_suspension_date)
    : null;
  const termination = account.povo_termination_date
    ? new Date(account.povo_termination_date)
    : null;
  const { daysElapsed, daysRemaining, urgency, phase } = calculateStatus(expiry, suspension, termination);
  return { account, daysElapsed, daysRemaining, urgency, phase };
}
