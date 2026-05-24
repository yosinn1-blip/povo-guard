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
  snippet: string;
}

async function getMessageMeta(accessToken: string, messageId: string): Promise<GmailMeta> {
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
    `?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    snippet: string;
    payload: { headers: Array<{ name: string; value: string }> };
  };
  const get = (name: string) =>
    data.payload.headers.find((h) => h.name === name)?.value || '';
  return {
    subject: get('Subject'),
    date: new Date(get('Date')),
    to: get('To'),
    snippet: data.snippet || '',
  };
}

export interface SuspensionAlert {
  suspensionDate: Date; // povo公式の停止予告日
  alertEmailDate: Date; // その警告メールの送信日
}

/** "2026年5月1日" 形式の日本語日付をパースして Date を返す */
function parseJpDate(text: string): Date | null {
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
}

// アカウントごとの最新「利用停止予告」日を返す
export async function scanSuspensionAlerts(env: Env): Promise<Map<string, SuspensionAlert>> {
  const accessToken = await getAccessToken(env);
  const messageIds = await searchMessages(
    accessToken,
    'from:important@emails.povo.jp subject:長期間トッピング未購入による利用停止予告'
  );

  const best = new Map<string, SuspensionAlert>();

  for (const id of messageIds) {
    const msg = await getMessageMeta(accessToken, id);

    // snippet から "YYYY年M月D日より順次ご利用を停止" を抽出
    const suspensionDate = parseJpDate(
      msg.snippet.match(/(\d{4}年\d{1,2}月\d{1,2}日)より順次ご利用を停止/)?.[1] ?? ''
    );
    if (!suspensionDate) continue;

    const accountEmail = extractAccountEmail(msg.to);
    const existing = best.get(accountEmail);
    // より新しい警告メールで上書き
    if (!existing || msg.date > existing.alertEmailDate) {
      best.set(accountEmail, { suspensionDate, alertEmailDate: msg.date });
    }
  }

  return best;
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
