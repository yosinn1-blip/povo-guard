import type { Env, AccountStatus, PovoAccountRow } from './types';

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
    <p>→ <a href="https://kddi-povo.app.link/">📱 povo アプリで購入する</a></p>
    <p>→ <a href="https://yosinn1-blip.github.io/povo-guard/">📊 ダッシュボードを確認する</a></p>
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

// povo公式の利用停止予告メールを検出したときの緊急通知
export async function sendSuspensionAlert(
  env: Env,
  account: PovoAccountRow,
  suspensionDate: Date
): Promise<void> {
  const dateStr = suspensionDate.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
  });
  const today = new Date();
  const daysUntil = Math.floor(
    (suspensionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isPast = daysUntil < 0;

  const subject = isPast
    ? `🚨 povo ${account.label}回線 すでに利用停止中（${dateStr}〜）`
    : `🚨 povo ${account.label}回線 ${dateStr}に利用停止予告`;

  const html = `
    <p>⚠️ <strong>povo公式からの利用停止予告を検知しました</strong></p>
    <p><strong>${account.label}回線（${account.email}）</strong><br>
    停止予定日: <strong>${dateStr}</strong>${isPast ? '（すでに停止中）' : `（あと${daysUntil}日）`}</p>
    <p style="color:red;font-weight:bold">今すぐ povo アプリでトッピングを購入してください！</p>
    <p>→ <a href="https://kddi-povo.app.link/">📱 povo アプリで購入する</a></p>
    <p>→ <a href="https://yosinn1-blip.github.io/povo-guard/">📊 ダッシュボードを確認する</a></p>
    <hr>
    <p style="font-size:12px;color:#888">
    ※ povo公式メール（important@emails.povo.jp）を検知して自動送信
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
