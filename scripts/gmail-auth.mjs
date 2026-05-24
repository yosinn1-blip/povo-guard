import { createServer } from 'http';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET を環境変数に設定してください');
  console.error('  GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.mjs');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n以下のURLをブラウザで開いてください（yosinn1@gmail.com でログイン）:\n');
console.log(authUrl.toString());
console.log('\n認証後、このターミナルにリフレッシュトークンが表示されます。\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('認証コードが見つかりません');
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json();

  if (tokens.error) {
    console.error('\nエラー:', tokens.error, tokens.error_description);
    res.end('<h1>エラーが発生しました。ターミナルを確認してください。</h1>');
    server.close();
    return;
  }

  console.log('\n=== リフレッシュトークン取得成功 ===');
  console.log('Refresh Token:', tokens.refresh_token);
  console.log('\n次のコマンドでWorkerにシークレットを登録してください:');
  console.log('  cd /Users/yoshiki/dev/povo-guard');
  console.log('  wrangler secret put GMAIL_CLIENT_ID');
  console.log('  wrangler secret put GMAIL_CLIENT_SECRET');
  console.log('  wrangler secret put GMAIL_REFRESH_TOKEN');
  console.log('  wrangler secret put SUPABASE_URL');
  console.log('  wrangler secret put SUPABASE_KEY');
  console.log('  wrangler secret put RESEND_API_KEY');
  console.log('  wrangler secret put NOTIFY_EMAIL');
  console.log('  wrangler secret put WORKER_SECRET');

  res.end('<h1>認証完了！ターミナルを確認してください。</h1>');
  server.close();
});

server.listen(3000, () => {
  console.log('ポート3000でコールバック待機中...');
});
