# Who's Right?

Stuck in an argument? Put it to a jury. Five randomly drawn, verified humans read the story, vote in secret and
say who's right. Fees are paid in G$ on Celo; jurors who vote on time share them, and if there's no verdict
everyone gets their money back.

## What it's for

Everyday disputes where you just want a fair outside opinion from people with no stake in it:

- **Roommates:** whose turn it is to take the bins out, noise, splitting bills
- **Friends:** who won the bet, who said it first, settling a group-chat standoff
- **Couples:** whether cancelling last minute was fair, whose family for the holidays
- **Money:** splitting a taxi, who owes who, a borrowed thing that came back broken
- **Just you:** "Am I wrong for not going to the wedding?" Ask the jury on your own and get a yes or no
- **Hot takes:** is a hot dog a sandwich?

A verdict is an honest outside opinion, not a legal ruling. Cases are public, so people are described by role,
never by name.

## Two ways to settle it

- **Ask the jury** (just your side): you write what happened, the jury votes Right or Wrong, and only you pay.
- **Settle it together** (both sides): you send a private invite, the other person writes their side and pays the
  same fee, and the jury picks a winner.

Anyone verified can also join the jury pool for free, get drawn at random and earn a share of the fees.

## Repo

| Folder | What |
|---|---|
| [`contracts/`](contracts/) | Foundry project: `WhosRight.sol`, tests, deploy and smoke scripts, deployments |
| [`app/`](app/) | Next.js web app |

Launch fees per party: **Standard 100 G$**, **Fast 300 G$** (owner-adjustable up to 1,000 G$).
Details, addresses and deployment steps are in [`contracts/README.md`](contracts/README.md).

## Testnet vs mainnet

The `contracts/src/testnet/` stand-ins (tG$ with a faucet, self-verify Identity) and `InsecureTestnetRandomness`
are for Celo Sepolia only. They refuse to deploy on Celo mainnet and are never used there.

## Secrets

Private keys, the Supabase service role key and the Privy app secret stay server-side, in git-ignored env files
or an encrypted Foundry keystore. Never commit them.
