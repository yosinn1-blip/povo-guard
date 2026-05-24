import type { Env, ParsedTopping } from './types';

export function parseTopping(subject: string): ParsedTopping | null {
  const match = subject.match(/^(.+)を購入された方へ/);
  if (!match) return null;

  const name = match[1];

  // 24時間トッピングは1日として扱う
  if (name.match(/\(\d+時間\)/)) {
    return { name, validityDays: 1 };
  }

  // 日間トッピング
  const dayMatch = name.match(/\((\d+)日間\)/);
  if (dayMatch) {
    return { name, validityDays: parseInt(dayMatch[1], 10) };
  }

  // ガチャ等で有効期間不明の場合はfallback 7日
  return { name, validityDays: 7 };
}

export function calcExpiryFromPurchase(purchaseDate: Date, validityDays: number): Date {
  const expiry = new Date(purchaseDate);
  expiry.setUTCDate(expiry.getUTCDate() + validityDays - 1);
  return expiry;
}

export function extractAccountEmail(toHeader: string): string {
  const match = toHeader.match(/[\w.+]+@[\w.]+/);
  return match ? match[0] : toHeader;
}

// ---- Gmail API ----

async function getAccessToken(env: Env): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json() as { access_token: string; error?: string };
  if (data.error) throw new Error(`OAuth error: ${data.error}`);
  return data.access_token;
}

async function searchMessages(accessToken: string, query: string): Promise<string[]> {
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages` +
    `?q=${encodeURIComponent(query)}&maxResults=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as { messages?: Array<{ id: string }> };
  return (data.messages || []).map((m) => m.id);
}

interface GmailMeta {
  subject: string;
  date: Date;
  to: string;
}

async function getMessageMeta(accessToken: string, messageId: string): Promise<GmailMeta> {
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
    `?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    payload: { headers: Array<{ name: string; value: string }> };
  };
  const get = (name: string) =>
    data.payload.headers.find((h) => h.name === name)?.value || '';
  return {
    subject: get('Subject'),
    date: new Date(get('Date')),
    to: get('To'),
  };
}

// アカウントごとの最終トッピング購入日を返す（180日ルールは購入日起算）
export async function scanAllAccounts(env: Env): Promise<Map<string, Date>> {
  const accessToken = await getAccessToken(env);
  // 実際の購入完了メールは info@povo.jp から送信される
  const messageIds = await searchMessages(
    accessToken,
    'from:info@povo.jp subject:【povo】トッピング購入完了のお知らせ'
  );

  const best = new Map<string, Date>();

  for (const id of messageIds) {
    const msg = await getMessageMeta(accessToken, id);

    const accountEmail = extractAccountEmail(msg.to);
    const purchaseDate = msg.date;

    const current = best.get(accountEmail);
    if (!current || purchaseDate > current) {
      best.set(accountEmail, purchaseDate);
    }
  }

  return best;
}
