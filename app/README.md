# Rest My Case — app

Next.js (App Router) + TypeScript + Tailwind, wagmi + viem, Privy login. Phone-first.

```sh
pnpm install
cp .env.example .env.local   # fill in; never commit
pnpm dev
```

- `NEXT_PUBLIC_NETWORK` picks the network (`celo-sepolia` or `celo`). Addresses live in `src/lib/network.ts`;
  testnet stand-ins exist only on the `celo-sepolia` entry and are never configured on mainnet.
- Server-only secrets (`PRIVY_APP_SECRET`, `SUPABASE_SECRET_KEY`) are read only in `src/lib/server/` (`server-only`).
  Server routes authenticate users with the Privy access token (`Authorization: Bearer`).
- Supabase: run `supabase/migrations/*.sql` once in the SQL editor. RLS is on with no policies, so the browser key
  can't touch any table; all reads and writes go through `src/app/api/*` using `SUPABASE_SECRET_KEY` server-side.
- Case text is stored off-chain with a random salt; only `keccak256(abi.encode(salt, text))` goes on-chain, and the
  API only returns text whose hash matches the chain.
- After changing the contract: `(cd ../contracts && forge build) && node scripts/sync-abi.mjs`.
- Alerts go out by web push, Telegram and email, sent by the keeper once per wallet per case per kind
  (`src/lib/server/notify.ts`). Email uses Resend and is off until `RESEND_API_KEY`, `EMAIL_FROM` (on a domain verified in
  Resend) and `EMAIL_UNSUBSCRIBE_SECRET` are set; run `supabase/migrations/0012_email.sql` first. Addresses aren't stored:
  they come from the person's Privy account (email login or Google) when an alert is sent. Invites are never emailed by
  the server (the invite key stays in the browser); "Email it" opens the sender's own mail app.
