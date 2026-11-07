# MoonSafe VaultV2 / VaultFactoryV2: security review (max depth)

Scope: `contracts/VaultV2.sol`, `contracts/VaultFactoryV2.sol`. Target: Arc mainnet (chain ID 5042), native USDC with 18 decimals, Solidity 0.8.28, evm cancun. Product rules: CORE V2 section 7 (`docs/CORE.md`).
This is a best-effort review against Arc Studio's internal rule corpus plus manual analysis. It is not a substitute for an independent third-party audit before mainnet.

## Result

No critical, high or medium issues were found in the two contracts. No contract source was changed. Findings below are low or informational; each has a recommended fix and the web app obligations they imply.

| # | Severity | Title | Location |
|---|----------|-------|----------|
| L-1 | Low | Signature deadline has no upper bound | VaultV2.sol `withdraw` L118, `importVault` L131 |
| L-2 | Low | Recovery into a wallet that already owns a vault reverts | VaultFactoryV2.sol `onOwnerChanged` L131 |
| L-3 | Low | `passwordKey` is unchecked at creation (typo or wrong address locks the vault) | VaultFactoryV2.sol `createVault` L103, VaultV2.sol `initialize` L76 |
| L-4 | Low | `depositFor` accepts funds from anyone (unsolicited or tainted funds, blocklist exposure) | VaultV2.sol L96 |
| L-5 | Low | Floating pragma `^0.8.20` while the target is 0.8.28 | both files L2 |
| I-1 | Info | Effective security is the password alone against password theft | design |
| I-2 | Info | The paper alone identifies the vault (no vault address needed) | design |
| I-3 | Info | Circle blocklist can freeze a vault, owner wallet or fee recipient | Arc |
| I-4 | Info | Anyone can initialize a raw clone; only `factory.isVault` is authoritative | VaultV2.sol L76 |
| I-5 | Info | Native value forced into the factory is stuck by design | VaultFactoryV2.sol |
| I-6 | Info | Installed OpenZeppelin is 5.6.1, request was 5.1.0 | package.json |
| I-7 | Info | Slither: 8 results, all expected | both |

## Test status and what changed in the test setup

- Foundry already picks up `contracts/test/VaultV2.t.sol` (`test = "contracts/test"`), so nothing was moved or reconfigured. Original suite: 43 of 43 pass.
- Added `contracts/test/VaultV2Audit.t.sol` (28 tests, including a stateful invariant test of the factory index and fee balance). It documents and proves the properties reviewed here.
- Final run: 71 tests pass, 0 fail.
- The sandbox has OpenZeppelin 5.6.1 installed. I did not change the pin. The full suite (71 tests) was also run against OpenZeppelin 5.1.0 in a throwaway copy of the project outside the repository, and passes there too.

## Access control

- Vault: `withdraw` and `deposit` are `onlyOwner`. `importVault` is open to any caller but needs a password signature bound to `msg.sender`. `initialize` is single-use; the implementation is locked in its constructor.
- Factory: `setFee`, `setFeeRecipient`, `setCreationPaused` are `onlyOwner` (Ownable2Step; `renounceOwnership` disabled). `onOwnerChanged` is gated by `_isVault[msg.sender]`.
- Factory owner reach into vaults: none. The factory has no function that calls a vault except the `meetsMinimum` view. It holds no key. Pausing blocks only `createVault`. Tests: `test_Admin_*`.

## Signature scheme

- EIP-712 domain is OpenZeppelin `EIP712("MoonSafeVault", "2")`. On a clone `address(this) != _cachedThis`, so the separator is rebuilt from the clone address and live `block.chainid`. Verified: `verifyingContract` is the clone, `chainId` follows `vm.chainId`, two clones never share a separator, and the implementation's separator differs. Tests: `test_Domain_*`.
- Replay across vaults: blocked by the clone address in the domain even when the same password key is reused. Across chains: blocked by chain ID. Across owners: blocked by the shared nonce; an import advances the nonce, so any unused withdraw signature dies on ownership change.
- Malleability: OpenZeppelin ECDSA accepts only 65-byte signatures with low `s` and `v` of 27 or 28. High-s twins, ERC-2098 compact form, `v` of 0 or 1 and trailing bytes are all rejected (`test_Sig_OnlyCanonical65ByteForm`). Malleability would be harmless anyway because replay protection is the nonce, not signature uniqueness. A zero `ecrecover` result can never match, including on the implementation whose password key is zero.
- Front-running `withdraw`: the caller must be the owner, so a mempool copy is useless to anyone else. Front-running `importVault`: the signature commits to `msg.sender`, so a copy fails with no nonce consumed and the legitimate import still lands (`test_Import_CopiedSignatureFromMempoolIsUselessAndLegitImportStillLands`). Nobody without the password can advance the nonce, so a signed import or withdraw cannot be invalidated by a third party (fuzzed).
- Deadline: inclusive (`block.timestamp > deadline` reverts). See L-1.
- Contract wallets can import and withdraw (`test_ContractWalletCanImportAndWithdraw`).

## Reentrancy

- `withdraw` is `nonReentrant`, increments the nonce before the native call, and reverts everything on failure. `importVault` finishes its state changes before the only external call, which goes to the trusted factory; the factory callback makes no external calls.
- Factory `createVault` and `withdrawFees` share one lock. A refund callback that re-enters either one fails, which reverts the whole creation (`test_Fee_RefundReentrancyIsBlockedAndRevertsWholeCreation`).

## Factory index (`getVault` / `hasVault`)

- Invariant, fuzzed over 128,000 creates and imports per run: every vault is indexed under its current owner, and every index entry points at a vault that wallet owns. An entry is written only in `createVault` (slot must be empty) and `onOwnerChanged` (slot must be empty), and cleared only by the vault that holds it.
- Corruption: an outsider cannot call the callback. A raw clone initialized with the real factory address is rejected with `NotAVault` (`test_Index_UnregisteredCloneCannotTouchIndex`). A registered vault runs fixed code: it can only report its own true previous owner and the caller who proved the password, and only for itself.
- Griefing or blocking an import: no third party can. The destination wallet's index slot can only be filled by that wallet itself, the nonce can only move with the password, and the callback has no admin-controlled failure path (not affected by pause, fee, or fee recipient). The one revert is L-2.

## Fee accounting

- `accruedFees` increases by the fee read once at the top of `createVault`; the excess is refunded after state is final. Fuzzed: wallet delta equals the fee, factory balance equals accrued fees, for any fee in 0 to 10 USDC and any payment at or above it.
- A fee raised between signing and inclusion makes the creation revert with no loss. A reverting fee recipient cannot block creation or import; the owner replaces it and fees are intact. Forced value in the factory is not accounted and cannot be withdrawn (I-5).
- Max fee is `10 ether`, which is 10 USDC at 18 decimals. This matches the spec.

## Can MoonSafe or the factory owner move funds or change an owner?

No. The factory owner can set the fee (max 10 USDC), set the fee recipient (which only redirects accrued creation fees), and pause new creations. A compromised Safe can therefore at worst change those three things. No vault function accepts the factory as an authority, and the factory does not hold the vault's password key.

## Findings in detail

### L-1 Signature deadline has no upper bound (Low)
Location: `VaultV2.sol` L118, L131.
Scenario: the app signs a withdraw (amount A to recipient R) with a far-future deadline, the transaction is never sent or is dropped, and the owner wallet is compromised later. The attacker can submit that signature and move A to R only (the signature is bound to R and A). With a deadline of "max uint" this window never closes until the nonce moves.
Fix: the app uses deadlines of 10 to 30 minutes and never reuses a signature. On-chain option: revert if `deadline > block.timestamp + 1 days`. Not applied, since the spec does not require it and the worst case is limited to the recipient the user already chose.

### L-2 Recovery into a wallet that already owns a vault reverts (Low)
Location: `VaultFactoryV2.sol` L131 via `VaultV2.sol` L138.
Scenario: Alice lost wallet W1 and tries to recover into W2, which already has its own vault. The import reverts with `VaultAlreadyExists`, no state changes and the nonce is kept. She recovers into a fresh wallet instead.
No third party can trigger this and no funds are at risk, so this is rated Low (an automated reviewer rated it Medium; the difference is that the failure is deterministic, self-inflicted, and has a free workaround).
Fix: the app checks `factory.hasVault(newWallet)` before asking for the import signature and tells the user to use a wallet with no vault. Changing the contract would mean letting the index fall out of step with ownership, which is worse.

### L-3 `passwordKey` is unchecked at creation (Low)
Location: `VaultFactoryV2.sol` L103, `VaultV2.sol` L76.
Scenario: the app passes the wrong address (for example the connected wallet, or a key derived from a mistyped or different password string). The vault accepts it, the user deposits, and withdrawal and recovery are impossible forever.
Fix (app): after `createVault`, require the user to re-type the paper password, derive the address and compare with `vault.passwordKey()` before showing any deposit button. Optional on-chain hardening: reject `passwordKey == msg.sender`. Not applied.

### L-4 `depositFor` accepts funds from anyone (Low)
Location: `VaultV2.sol` L96.
Scenario: a third party sends unwanted or tainted USDC to a victim's vault. If Circle later blocklists the vault for that reason, the victim's whole balance is frozen. The risk is regulatory, not a code bug, and forced sends cannot be blocked anyway.
Fix: keep if the gift feature is wanted; otherwise remove `depositFor`. The app should always show the vault balance from `getBalance()`, not from `Deposited` events.

### L-5 Floating pragma (Low)
Both files use `^0.8.20`; tests were compiled with 0.8.28. Pin to `pragma solidity 0.8.28;` before the mainnet deployment so the deployed bytecode is reproducible.

### I-1 Effective security against password theft (Info, accepted by the spec)
Because `importVault` needs only the password signature, anyone who obtains the password can become owner immediately and then withdraw. Wallet plus password protects against loss or theft of the wallet alone, and against theft of the password alone only while the owner reacts first. Marketing and in-app copy must not claim that both are always required to move funds.

### I-2 The paper alone identifies the vault (Info)
`passwordKey` is public through `passwordKey()` and the `VaultCreated` event. Anyone holding the password can derive the address and look the vault up, so they do not need to know the vault address, which is slightly stronger than the spec's accepted-risk wording.

### I-3 Circle blocklist (Info)
A blocklisted recipient makes `withdraw` revert atomically (nonce and funds untouched; the user signs again for another recipient). A blocklisted vault, owner or factory cannot be mitigated in code. A blocklisted fee recipient only blocks `withdrawFees` until the Safe replaces it. A blocklisted factory address would make refunds of excess payment fail, so the app should send the exact fee. I did not verify live Arc node behaviour for these cases.

### I-4 Raw clones (Info)
Anyone can clone the implementation and call `initialize` with arbitrary values. Such a clone cannot touch the factory index. The app must treat a vault as real only if `factory.isVault(vault)` is true and the factory address is the pinned one.

### I-5 Forced value in the factory (Info)
Value sent to the factory by force is never accounted and cannot be withdrawn. This is documented in the contract and harmless.

### I-6 OpenZeppelin version (Info)
The project pins 5.6.1; you asked for 5.1.0. The contracts use only APIs present in both and compile under both.

### I-7 Slither (Info)
8 results: `arbitrary-send-eth` (the withdrawal itself, gated by owner and password signature), `unused-return` (the error code is checked), `timestamp` (the deadline), `low-level-calls`, and `missing-inheritance` (the factory may inherit `IVaultIndex`). None is a defect.

## Is the password-derived key scheme sound?

Yes, with conditions.

- Entropy: 24 characters from a 32-character alphabet is exactly 120 bits (the alphabet has 32 symbols; `byte % 32` has no bias). Brute-forcing a public `passwordKey` costs about 2^120 hash plus point multiplications. That is infeasible, and attacking many vaults at once does not help in any practical way. A fast hash such as keccak256 is therefore acceptable here. It would not be acceptable for a user-chosen or lower-entropy password.
- The signature reveals the public key, not the password. A signature seen in the mempool is useless to others because it commits to `msg.sender` (import) or requires the owner wallet (withdraw), the vault, the chain, the nonce and the deadline.
- `mod n`: the bias is negligible, but the app must reject a zero scalar.

What the web app must do:

1. Generate the password with `crypto.getRandomValues` only, uniformly, never `Math.random`, never user-chosen, never reused across vaults.
2. Freeze the derivation exactly: UTF-8 bytes, uppercase, dashes and spaces removed, alphabet validated (reject `0`, `1`, `I`, `O` instead of guessing), with fixed test vectors in the repository. A change would orphan existing vaults.
3. Defense in depth (recommended): run the password through a slow KDF such as Argon2id or scrypt before keccak256. It costs nothing at 120 bits and protects if part of the paper is leaked, for example a photo of 20 of 24 characters. Do it before launch, since it cannot be changed later; bump the derivation prefix to `v2`.
4. Never sign anything else with the password key. Any signing oracle (a raw-hash signing endpoint, `eth_sign`, typed data from an untrusted dapp, a "sign this message" helper) lets an attacker obtain a valid import signature for their own address and take the vault without the wallet. Sign only the two exact typed structures, built locally by the app, for the pinned domain (`MoonSafeVault`, `2`, chain ID 5042, vault address from `factory.getVault`), and show the user the recipient and amount or the new owner first.
5. Keep the password and derived key out of storage, URLs, logs, analytics, error reporting and any request to a backend; derive on demand, sign, and drop it. Block third-party scripts on those screens.
6. Before showing any deposit button, make the user re-type the paper password and check that the derived address equals `vault.passwordKey()`. Do the same check before any import or withdraw so a typo is caught before signing.
7. Fetch `nonce()` right before signing, use a short deadline, and submit signatures with `v` of 27 or 28 (65 bytes). Compact or `v` 0 or 1 forms are rejected on purpose.
8. For recovery, check `factory.hasVault(newWallet)` first (L-2). Warn the user that anyone with the paper can take the vault, and that the owner should move funds first if the paper is exposed.
9. Verify `factory.isVault(vault)` and a pinned factory address before any deposit, so a lookalike raw clone cannot be used for phishing.
