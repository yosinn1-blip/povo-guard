import type { Env } from './types';
import { scanAllAccounts, scanBillingEmails, scanSuspensionAlerts } from './gmail';
import { buildAccountStatus } from './calculator';
import { getAccounts, updateAccountExpiry, updateSuspensionDates, hasNotified, recordNotification } from './db';
import { getReachedThresholds, sendNotification, sendSuspensionAlert } from './notifier';

// 停止予告通知の重複防止用特別閾値
const SUSPENSION_THRESHOLD = 999;

async function runDailyScan(env: Env): Promise<void> {
  // 購入履歴スキャン・課金スキャン・停止予告スキャン を並列実行
  const [purchaseMap, billingMap, suspensionMap] = await Promise.all([
    scanAllAccounts(env),
    scanBillingEmails(env),
    scanSuspensionAlerts(env),
  ]);

  // 購入完了メール と 課金メール の日付を統合して最新購入日を決定
  // サブスクトッピングは「購入完了のお知らせ」が来ないため課金メールで補完する
  const expiryMap = new Map<string, Date>();
  const allEmails = new Set([...purchaseMap.keys(), ...billingMap.keys()]);
  for (const email of allEmails) {
    const purchaseDate = purchaseMap.get(email) ?? null;
    const billingDate = billingMap.get(email) ?? null;
    const latest =
      purchaseDate && billingDate
        ? purchaseDate > billingDate ? purchaseDate : billingDate
        : purchaseDate ?? billingDate!;
    expiryMap.set(email, latest);
  }

  const accounts = await getAccounts(env);
  const now = new Date().toISOString();

  for (const account of accounts) {
    // 1. 購入日の更新
    const newExpiry = expiryMap.get(account.email);
    if (newExpiry) {
      const expiryStr = newExpiry.toISOString().slice(0, 10);
      if (expiryStr !== account.last_expiry) {
        await updateAccountExpiry(env, account.id, expiryStr, now);
        account.last_expiry = expiryStr;
        // 新しい購入が確認されたので停止予告日・解除予定日をクリア
        await updateSuspensionDates(env, account.id, null, null);
        account.povo_suspension_date = null;
        account.povo_termination_date = null;
      }
    }

    // 2. povo公式の停止予告日・契約解除予定日を更新
    const alert = suspensionMap.get(account.email);
    if (alert) {
      const suspStr = alert.suspensionDate.toISOString().slice(0, 10);
      const termStr = alert.terminationDate
        ? alert.terminationDate.toISOString().slice(0, 10)
        : null;
      // 購入日より後の停止予告のみ有効（古い予告は無視）
      const isFreshAlert = !account.last_expiry ||
        alert.alertEmailDate > new Date(account.last_expiry);

      if (isFreshAlert && (suspStr !== account.povo_suspension_date || termStr !== account.povo_termination_date || alert.messageId !== account.suspension_email_id)) {
        await updateSuspensionDates(env, account.id, suspStr, termStr, alert.messageId);
        account.povo_suspension_date = suspStr;
        account.povo_termination_date = termStr;
        account.suspension_email_id = alert.messageId;
      }

      // 停止予告の通知（重複防止: last_expiryをキーに1回だけ）
      if (isFreshAlert && account.last_expiry) {
        const alreadyNotified = await hasNotified(
          env, account.id, SUSPENSION_THRESHOLD, account.last_expiry
        );
        if (!alreadyNotified) {
          await sendSuspensionAlert(env, account, alert.suspensionDate);
          await recordNotification(env, account.id, 999, SUSPENSION_THRESHOLD);
        }
      }
    }

    // 3. 通常の閾値通知（60/120/150/160/170日）
    const status = buildAccountStatus(account);
    const thresholds = getReachedThresholds(status.daysElapsed);

    for (const threshold of thresholds) {
      if (account.last_expiry) {
        const alreadyNotified = await hasNotified(
          env, account.id, threshold, account.last_expiry
        );
        if (alreadyNotified) continue;
      }
      await sendNotification(env, status, threshold);
      await recordNotification(env, account.id, status.daysElapsed, threshold);
    }
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runDailyScan(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.headers.get('Authorization') !== `Bearer ${env.WORKER_SECRET}`) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      const accounts = await getAccounts(env);
      const statuses = accounts.map(buildAccountStatus);
      return new Response(JSON.stringify(statuses), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (request.method === 'POST' && url.pathname === '/refresh') {
      await runDailyScan(env);
      const accounts = await getAccounts(env);
      const statuses = accounts.map(buildAccountStatus);
      return new Response(JSON.stringify(statuses), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
