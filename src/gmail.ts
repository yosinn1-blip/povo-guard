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
  suspensionDate: Date;         // povo公式の停止予告日
  terminationDate: Date | null; // povo公式の契約解除予定日
  alertEmailDate: Date;         // その警告メールの送信日
  messageId: string;            // Gmail メッセージID（ダッシュボードリンク用）
}

/** "2026年5月1日" 形式の日本語日付をパースして Date を返す */
function parseJpDate(text: string): Date | null {
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
}

/** メール本文の base64 ペイロードをテキストとして展開する（マルチパート対応）*/
function extractBodyText(payload: {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: unknown[];
}): string {
  // text/plain を優先して再帰探索
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  // マルチパートは再帰
  if (payload.parts) {
    // text/plain を先に探す
    for (const part of payload.parts as typeof payload[]) {
      if ((part as { mimeType?: string }).mimeType === 'text/plain') {
        const text = extractBodyText(part);
        if (text) return text;
      }
    }
    // 見つからなければ全パートを走査
    for (const part of payload.parts as typeof payload[]) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }
  // フォールバック: body.data がある場合はそのまま試みる
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  return '';
}

/** Gmail の URL-safe base64 → UTF-8 文字列。失敗時は空文字を返す */
function decodeBase64(b64: string): string {
  try {
    // URL-safe base64 → 通常 base64、改行・空白を除去、パディング補完
    const standard = b64
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/\s/g, '');
    const padded = standard + '==='.slice((standard.length + 3) % 4);
    // Cloudflare Workers では atob → Uint8Array → TextDecoder で日本語を正しくデコード
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** 停止予告メールはフル取得して契約解除予定日も抽出する */
async function getSuspensionMessageData(
  accessToken: string,
  messageId: string
): Promise<GmailMeta & { terminationDate: Date | null }> {
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
    `?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    snippet: string;
    payload: {
      headers: Array<{ name: string; value: string }>;
      body?: { data?: string };
      parts?: unknown[];
    };
  };
  const get = (name: string) =>
    data.payload.headers.find((h) => h.name === name)?.value || '';

  const bodyText = extractBodyText(data.payload);

  // 本文 or スニペットから "契約解除予定日：2026年6月1日" を抽出
  const searchText = bodyText || (data.snippet || '');
  let terminationDate = parseJpDate(
    searchText.match(/契約解除予定日[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日)/)?.[1] ?? ''
  );

  // 抽出できなかった場合はスニペットから停止日を取り +31日をフォールバックとする
  if (!terminationDate) {
    const suspDateFromSnippet = parseJpDate(
      (data.snippet || '').match(/(\d{4}年\d{1,2}月\d{1,2}日)より順次ご利用を停止/)?.[1] ?? ''
    );
    if (suspDateFromSnippet) {
      const td = new Date(suspDateFromSnippet);
      td.setUTCDate(td.getUTCDate() + 31);
      terminationDate = td;
    }
  }

  return {
    subject: get('Subject'),
    date: new Date(get('Date')),
    to: get('To'),
    snippet: data.snippet || '',
    terminationDate,
  };
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
    const msg = await getSuspensionMessageData(accessToken, id);

    // snippet から "YYYY年M月D日より順次ご利用を停止" を抽出
    const suspensionDate = parseJpDate(
      msg.snippet.match(/(\d{4}年\d{1,2}月\d{1,2}日)より順次ご利用を停止/)?.[1] ?? ''
    );
    if (!suspensionDate) continue;

    const accountEmail = extractAccountEmail(msg.to);
    const existing = best.get(accountEmail);
    // より新しい警告メールで上書き
    if (!existing || msg.date > existing.alertEmailDate) {
      best.set(accountEmail, {
        suspensionDate,
        terminationDate: msg.terminationDate,
        alertEmailDate: msg.date,
        messageId: id,
      });
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

// サブスクトッピングの月次課金メールをスキャンして最終支払い日を返す
// （「トッピング購入完了のお知らせ」が来ないサブスクの更新検出用）
export async function scanBillingEmails(env: Env): Promise<Map<string, Date>> {
  const accessToken = await getAccessToken(env);
  const messageIds = await searchMessages(
    accessToken,
    'from:info@povo.jp subject:ご請求のお支払いが完了しました'
  );

  const best = new Map<string, Date>();

  for (const id of messageIds) {
    const msg = await getMessageMeta(accessToken, id);

    const accountEmail = extractAccountEmail(msg.to);
    const billingDate = msg.date;

    const current = best.get(accountEmail);
    if (!current || billingDate > current) {
      best.set(accountEmail, billingDate);
    }
  }

  return best;
}
