# Who's Right? — app

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
- After changing the contract: `(cd ../contracts && forge build) && node scripts/sync-abi.mjs`.
