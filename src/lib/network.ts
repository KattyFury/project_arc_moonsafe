// Which Arc network this build talks to. ONE switch for the whole app: VITE_NETWORK=mainnet builds the MAINNET app (real USDC,
// real cirBTC); anything else (the default) builds the TESTNET app. Testnet is the default on purpose: a build with no .env must
// never point at real funds by accident. Addresses come from docs.arc.io/arc/references/contract-addresses (checked 2026-10-28).
//
// MAINNET also needs VITE_FACTORY_ADDRESS (the factory the owner deploys); there is NO default for it, so a mainnet build without
// it shows "not configured" instead of quietly using a testnet address.

import { arc, arcTestnet } from 'viem/chains'

export type NetworkKind = 'testnet' | 'mainnet'

export const NETWORK_KIND: NetworkKind = (import.meta.env.VITE_NETWORK as string | undefined) === 'mainnet' ? 'mainnet' : 'testnet'

const TESTNET = {
  kind: 'testnet' as const,
  name: 'Arc Testnet',
  chain: { ...arcTestnet, rpcUrls: { ...arcTestnet.rpcUrls, default: { http: ['https://rpc.testnet.arc.io'] }, public: { http: ['https://rpc.testnet.arc.io'] } } },
  chainId: arcTestnet.id,
  rpc: 'https://rpc.testnet.arc.io',
  explorer: 'https://explorer.testnet.arc.io',
  /** Chain name App Kit (Swap Kit) uses. */
  appKitChain: 'Arc_Testnet' as const,
  cirBtc: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as `0x${string}`,
  /** The testnet factory in use; VITE_FACTORY_ADDRESS overrides it. */
  defaultFactory: '0xAd064AdD8d4C6C36964981d1f1aeBFF697e3941b' as `0x${string}` | null,
}

const MAINNET = {
  kind: 'mainnet' as const,
  name: 'Arc',
  chain: { ...arc, rpcUrls: { ...arc.rpcUrls, default: { http: ['https://rpc.mainnet.arc.io'] }, public: { http: ['https://rpc.mainnet.arc.io'] } } },
  chainId: arc.id,
  rpc: 'https://rpc.mainnet.arc.io',
  explorer: 'https://explorer.arc.io',
  appKitChain: 'Arc' as const,
  cirBtc: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0' as `0x${string}`,
  defaultFactory: null as `0x${string}` | null,
}

export const NET = NETWORK_KIND === 'mainnet' ? MAINNET : TESTNET
export const IS_MAINNET = NETWORK_KIND === 'mainnet'
/**
 * The chain id for wagmi calls. The wagmi config is typed with the testnet chain (src/config.ts), so the id is typed as the testnet one;
 * at run time it is the real id of this build's network (5042 on mainnet).
 */
export const CHAIN_ID = NET.chainId as typeof arcTestnet.id

/** The factory this build uses, or null on a mainnet build that was not given one. */
export const FACTORY: `0x${string}` | null = ((import.meta.env.VITE_FACTORY_ADDRESS as string | undefined)?.trim() || NET.defaultFactory) as `0x${string}` | null

export const explorerTx = (hash: string) => `${NET.explorer}/tx/${hash}`
export const explorerAddress = (address: string) => `${NET.explorer}/address/${address}`
/** "Arc Testnet · chain 5042002" / "Arc · chain 5042". */
export const networkLine = `${NET.name} · chain ${NET.chainId}`
