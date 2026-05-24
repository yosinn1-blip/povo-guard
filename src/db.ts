import type { Env, PovoAccountRow } from './types';

async function supabaseFetch(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function getAccounts(env: Env): Promise<PovoAccountRow[]> {
  return supabaseFetch(env, '/povo_accounts?select=*') as Promise<PovoAccountRow[]>;
}

export async function updateAccountExpiry(
  env: Env,
  id: string,
  lastExpiry: string,
  lastScannedAt: string
): Promise<void> {
  await supabaseFetch(env, `/povo_accounts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_expiry: lastExpiry, last_scanned_at: lastScannedAt }),
  });
}

export async function updateSuspensionDate(
  env: Env,
  id: string,
  suspensionDate: string | null
): Promise<void> {
  await supabaseFetch(env, `/povo_accounts?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ povo_suspension_date: suspensionDate }),
  });
}

// lastExpiry以降に同じthresholdで通知済みかチェック（新購入後はリセットされる）
export async function hasNotified(
  env: Env,
  accountId: string,
  threshold: number,
  lastExpiry: string
): Promise<boolean> {
  const rows = await supabaseFetch(
    env,
    `/povo_notifications?account_id=eq.${accountId}&threshold=eq.${threshold}&notified_at=gt.${lastExpiry}&select=id`
  ) as Array<{ id: string }>;
  return rows.length > 0;
}

export async function recordNotification(
  env: Env,
  accountId: string,
  daysElapsed: number,
  threshold: number
): Promise<void> {
  await supabaseFetch(env, '/povo_notifications', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, days_elapsed: daysElapsed, threshold }),
  });
}
