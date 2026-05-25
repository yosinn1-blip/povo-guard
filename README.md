# povo-guard

Public Cloudflare Workers project for lightweight scheduled guard/notification experiments.

## What is here

- Worker entrypoint under `src/`
- Wrangler configuration in `wrangler.toml`
- Tests under `tests/`

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run locally with Wrangler:

```bash
npm run dev
```

## Secrets and local files

Keep runtime secrets local. Do not commit `.env`, `.env.local`, `.dev.vars`, Wrangler state, logs, or generated build output.
