# MoonSafe — Project Notes

## App
"Có đường lui thì mới dám liều." — Personal emergency fund app on Arc Testnet.

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
| `VITE_CIRBTC_ADDRESS` | cirBTC token address on Arc Testnet (set when available) |

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
- cirBTC swap via Circle App Kit (keyless permissionless) — set VITE_CIRBTC_ADDRESS when token is live
- OpenAI chat runs server-side via Cloudflare Pages Functions (/functions/api/chat.ts)
- Exchange rates via open.er-api.com, cached 24h in localStorage
- Financial profile stored in localStorage (key: moonsafe_profile_v1)
- Chat history stored in localStorage (key: moonsafe_chat_v1, max 50 messages)
