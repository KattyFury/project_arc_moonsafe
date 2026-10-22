# MoonSafe — Project Notes

## App
"Nên đầu tư nhưng phải có đường lui." — Personal emergency fund app on Arc Testnet.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| VaultProxy (implementation) | `0xd0d5ca56381079d83d43b5da73940bd958b868d8` | [View](https://explorer.testnet.arc.io/address/0xd0d5ca56381079d83d43b5da73940bd958b868d8) |
| VaultFactory (current, owner = user 0xEb2D…52F6, fee 1 USDC) | `0x7E0f289d535369E582C596071b637E78E69Ac88F` | [View](https://explorer.testnet.arc.io/address/0x7E0f289d535369E582C596071b637E78E69Ac88F) |
| VaultFactory (legacy, Arc Studio, fee 1e12 wei — still read for old vaults) | `0x358e6669347cdda814efca51657b7a97cbf2576f` | [View](https://explorer.testnet.arc.io/address/0x358e6669347cdda814efca51657b7a97cbf2576f) |

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | Privy App ID (from dashboard.privy.io) |
| `VITE_FACTORY_ADDRESS` | VaultFactory address (set to deployed address above) |
| `OPENAI_API_KEY` | OpenAI API key for chat agent (server-side only) |

## Factory Constructor Args (current factory)
- implementation: 0xd0d5ca56381079d83d43b5da73940bd958b868d8 (VaultProxy)
- feeRecipient: 0xEb2D222d28F35fE7BeB5387f8Bc4eBF65f2652F6 (user, also owner/deployer)
- fee: 1000000000000000000 (1 USDC — Arc native USDC has 18 decimals)

## Privy Allowed Origins
- https://irol80jxblfxew72yvd5m.preview.studio.arc.io

## Notes
- USDC on Arc Testnet: 0x3600000000000000000000000000000000000000 (6 decimals ERC-20)
- Gas is USDC — no ETH needed
- cirBTC (testnet) `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`, 8 decimals — hardcoded in src/hooks/useCirBtc.ts (docs.arc.network contract-addresses). Swap USDC→cirBTC via Circle App Kit, keyless, alias `cirBTC` on `Arc_Testnet`
- BTC price for valuing cirBTC: /api/price (CoinGecko public, cached 5 min)
- OpenAI chat runs server-side via Cloudflare Pages Functions (/functions/api/chat.ts)
- Exchange rates via /api/rates (open.er-api.com), cached 24h in localStorage; on failure the last cached rate is used, never a guessed one
- Financial profile stored in localStorage (key: moonsafe_profile_v1)
- Chat history stored in localStorage (key: moonsafe_chat_v2, max 80 messages)
- Shared app state: src/state/AppState.tsx (one instance of vault/profile/fx/cirBTC)
- Native USDC on Arc has 18 decimals; the app works in 6-decimal units (src/lib/format.ts)
- Wallet: Privy + @privy-io/wagmi 1.x (matches @privy-io/react-auth 2.x)
