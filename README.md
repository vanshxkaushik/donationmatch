# DonationMatch

1:1 matched giving campaigns on Stellar. A matcher deposits a pool of XLM. Every donor's contribution is instantly matched up to the remaining pool — both donation and match go directly to the beneficiary in a single on-chain transaction.

## Live Links

| | |
|---|---|
| **Frontend** | `https://donationmatch-app.vercel.app` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CDCEFOCJPSPB7BUNOOITJAO6DSU75T5V6H4HY325QKX42ASBNOIHSNLN` |

## How It Works

1. **Matcher** creates a campaign, deposits a match pool (e.g. 100 XLM)
2. **Donors** call `donate()` with any amount ≥ 0.1 XLM
3. Contract calculates `match = min(donation, remaining_pool)`
4. Beneficiary receives `donation + match` in one atomic transfer
5. Pool depletes over time — status changes from `Active` → `Exhausted`
6. Matcher can close at any time to reclaim unused pool

## Why This Project Matters

This project turns a familiar real-world workflow into a verifiable on-chain primitive on Stellar: transparent state transitions, user-authenticated actions, and deterministic outcomes.

## Architecture

- **Smart Contract Layer**: Soroban contract enforces business rules, authorization, and state transitions.
- **Client Layer**: React + Vite frontend handles wallet UX, transaction composition, and real-time status views.
- **Wallet/Auth Layer**: Freighter signs every state-changing action so operations are attributable and non-repudiable.
- **Infra Layer**: Stellar Testnet + Soroban RPC for execution; Vercel for frontend hosting.
## Contract Functions

```rust
create_campaign(matcher, beneficiary, title, description, match_pool: i128, xlm_token) -> u64
donate(donor, campaign_id, amount: i128, xlm_token)    // atomic: donation + match → beneficiary
close_campaign(matcher, campaign_id, xlm_token)         // reclaims remaining pool
get_campaign(id) -> Campaign
get_recent() -> Vec<u64>
count() -> u64
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter API 6.0.1 |
| Stellar SDK | 14.6.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```



