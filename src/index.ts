import type { Env } from './types';
import { scanAllAccounts } from './gmail';
import { buildAccountStatus } from './calculator';
import { getAccounts, updateAccountExpiry, hasNotified, recordNotification } from './db';
import { getReachedThresholds, sendNotification } from './notifier';

async function runDailyScan(env: Env): Promise<void> {
  const expiryMap = await scanAllAccounts(env);
  const accounts = await getAccounts(env);
  const now = new Date().toISOString();

  for (const account of accounts) {
    const newExpiry = expiryMap.get(account.email);
    if (newExpiry) {
      const expiryStr = newExpiry.toISOString().slice(0, 10);
      if (expiryStr !== account.last_expiry) {
        await updateAccountExpiry(env, account.id, expiryStr, now);
        account.last_expiry = expiryStr;
      }
    }

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
