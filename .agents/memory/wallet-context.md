---
name: Global WalletContext
description: Architecture decisions for the EIP-6963 wallet upgrade — WalletProvider wraps entire app, all pages use useWallet() hook, no local wallet state
---

## Rule
All wallet state (address, chainId, balance, provider) lives in `WalletProvider` in `src/contexts/WalletContext.tsx`. Pages/modals use `useWallet()` — never maintain their own walletAddress/walletProvider state.

**Why:** Pre-upgrade each page (exchange.tsx, BuyModal, ReferralDashboardModal) had its own wallet state + restore logic, causing state drift across navigation and missed EIP-6963 providers (Rabby, OKX, etc. invisible when multiple extensions installed).

**How to apply:**
- Any new page/modal that needs wallet access: `const { address, provider, isConnected } = useWallet()`
- Any new connect button: use `<WalletSelector open={...} onClose={...} onConnected={() => closeModal()} />`
- `onConnected` is now `() => void` — context already holds the new state when this fires
- To trigger from Navbar: use `<WalletButton />` (already in Navbar.tsx)

## Key files
- `src/contexts/WalletContext.tsx` — WalletProvider, useWallet hook
- `src/lib/wallet.ts` — KNOWN_WALLETS (8 wallets with rdns/logo/deepLinks), CHAIN_INFO (12 chains), shortAddress, getChainInfo
- `src/types/global.d.ts` — EIP1193Provider, EIP6963ProviderDetail, window.ethereum types
- `src/components/home/WalletSelector.tsx` — EIP-6963 detected wallets first, mobile deep links, QR via `qrcode` npm package
- `src/components/layout/WalletButton.tsx` — Navbar pill: chain badge + short address + balance; dropdown: switch chain (6 chains), copy, disconnect, switch wallet

## Storage key
`chaindrop_wallet_v2` in localStorage. Old key `chaindrop_exchange_wallet` cleared on disconnect for backwards compat.

## Auto-reconnect
300ms delay on mount lets EIP-6963 providers announce before restore attempt. Injected: `eth_accounts` (no popup). WalletConnect: `restoreWalletConnectSession()`.

## Listeners
`accountsChanged` + `chainChanged` events wired in `setupProvider()`. Removed on disconnect via stored refs.

## qrcode package
`qrcode` + `@types/qrcode` installed in `artifacts/faucet-hub` for WalletSelector QR generation.
