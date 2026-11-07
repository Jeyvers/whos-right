# Who's Right?

Two verified humans settle an argument with a randomly drawn jury of verified humans on Celo, paid in G$.

| Folder | What |
|---|---|
| [`contracts/`](contracts/) | Foundry project: `WhosRight.sol`, tests, deploy and smoke scripts, deployments |
| `app/` | Next.js web app (in progress) |

Launch fees per party: **Standard 100 G$**, **Fast 300 G$** (owner-adjustable up to 10,000 G$).
Details, addresses and deployment steps are in [`contracts/README.md`](contracts/README.md).

## Testnet vs mainnet

The `contracts/src/testnet/` stand-ins (tG$ with a faucet, self-verify Identity) and `InsecureTestnetRandomness`
are for Celo Sepolia only. They refuse to deploy on Celo mainnet and are never used there.

## Secrets

Private keys, the Supabase service role key and the Privy app secret stay server-side, in git-ignored env files
or an encrypted Foundry keystore. Never commit them.
