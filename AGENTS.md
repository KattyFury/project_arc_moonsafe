# MoonSafe — Project Notes

## App
"Nên đầu tư nhưng phải có đường lui." — Personal emergency fund app on Arc Testnet.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| VaultProxy (implementation) | `0xfbfe31aa0ff4cd10d9fb2518c2a56ea954cad8c4` | [View](https://explorer.testnet.arc.io/address/0xfbfe31aa0ff4cd10d9fb2518c2a56ea954cad8c4) |
| VaultFactory | `0x1ea1acf6227aa1702a7f88f0c56726c5753cbeaa` | [View](https://explorer.testnet.arc.io/address/0x1ea1acf6227aa1702a7f88f0c56726c5753cbeaa) |

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | Privy App ID (from dashboard.privy.io) |
| `VITE_FACTORY_ADDRESS` | VaultFactory address (set to deployed address above) |
| `OPENAI_API_KEY` | OpenAI API key for chat agent (server-side only) |

## Factory Constructor Args
- implementation: 0xfbfe31aa0ff4cd10d9fb2518c2a56ea954cad8c4 (VaultProxy)
- usdc: 0x3600000000000000000000000000000000000000
- feeRecipient: 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42 (platform deployer)
- fee: 1000000 (1 USDC)

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
