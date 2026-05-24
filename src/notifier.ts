import type { Env, AccountStatus } from './types';

const THRESHOLDS = [60, 120, 150, 160, 170] as const;

// 到達済みの全閾値を返す（Cronが1日止まっても取りこぼさないよう >= で判定）
export function getReachedThresholds(daysElapsed: number): number[] {
  return THRESHOLDS.filter((t) => daysElapsed >= t);
}

export async function sendNotification(
  env: Env,
  status: AccountStatus,
  threshold: number
): Promise<void> {
  const { account, daysRemaining, daysElapsed } = status;
  const urgency =
    daysRemaining <= 10 ? '🔴' : daysRemaining <= 30 ? '⚠️' : 'ℹ️';

  const subject = `${urgency} povo ${account.label}回線 あと${daysRemaining}日で停止`;
  const html = `
    <p><strong>${account.label}回線（${account.email}）</strong>が<br>
    あと <strong>${daysRemaining}日</strong> で利用停止になります。</p>
    <p>今すぐ最安トッピングを購入してください。<br>
    <strong>100円ガチャ</strong>が最安の延命手段です。</p>
    <p>→ <a href="https://povo.jp">povo アプリで購入する</a></p>
    <hr>
    <p style="font-size:12px;color:#888">
    最終有効期限: ${account.last_expiry} ／ 経過: ${daysElapsed}日 ／ 閾値: ${threshold}日
    </p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'povo Guard <onboarding@resend.dev>',
      to: [env.NOTIFY_EMAIL],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend error: ${res.status} ${await res.text()}`);
  }
}
