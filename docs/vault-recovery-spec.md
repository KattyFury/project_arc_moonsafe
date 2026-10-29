# Vault recovery by email (decided 2026-10-29: build LATER, not for the hackathon launch)

Today (mainnet launch for friends): no contract change. Email logins use a Privy embedded wallet, which Privy restores at the same address, so the vault stays reachable. Wallet-only logins carry the lost-key risk and are told to keep amounts small. Every account has an email (required in "Before you start") so this feature can use it.

## Why one onchain key is unavoidable
The vault contract only understands wallet signatures, not email. Something onchain must say "this email was verified, start a recovery". That is a single dedicated **recovery executor** key held by the server (a Cloudflare secret, NOT the Safe and NOT Hieu's wallet). It can only start or cancel a recovery; it can never withdraw, and nothing changes before a 7-day wait. The alternative (proving email onchain with DKIM/zk) is too heavy for now.

## Flow (Hieu's design)
1. The user logs in by email on a new wallet and taps "Recover my vault". The NEW wallet signs one line proving it controls that address.
2. The server emails "Confirm recovery to wallet 0x...". The user clicks the link (proves they hold the mailbox).
3. The server (executor key) calls `startRecovery(newOwner)` on the vault. 7-day countdown. The email and an in-app banner both carry a Cancel button. Cancelling works by email link (server calls `cancelRecovery`) AND by the current owner wallet signing in the app (this matters: if the mailbox itself was hacked, the email cannot be the only way to cancel).
4. After 7 days anyone (the server does it automatically) calls `finishRecovery()`: ownership moves to the new wallet, which then uses the vault normally. A final email confirms.

## What has to be built
- Contract (vault v3, then re-test and re-review): `recoveryExecutor` read from the factory (rotatable only by the Safe), `startRecovery(newOwner)` / `cancelRecovery()` (executor or current owner) / `finishRecovery()` (anyone, after the delay), the 7-day delay as an immutable constant, events for each step, a rule that deposits/withdrawals by the old owner still work during the countdown, and tests for: executor cannot withdraw, cancel at any time, restart after cancel, finish only after the delay, new owner is exactly the confirmed address.
- Server: store email-to-vault ownership when a vault is created; endpoints request / confirm / cancel; a daily job that finishes due recoveries; the executor key as a secret; an email provider (Resend or Postmark API key from Hieu; Cloudflare cannot mail arbitrary addresses).
- App: "Recover my vault" screen, pending-recovery banner with Cancel, copy for the emails.
- It does NOT protect against theft of the owner key (a thief withdraws at once). Optional later: a withdrawal delay for large amounts with a veto.
