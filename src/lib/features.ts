// Feature flags shared by the app and the Pages functions.

/**
 * Recurring buys (DCA). Off on testnet (Hieu, 2026-10-27): the testnet cirBTC pool is priced about 2.6x above the BTC
 * market, so a price-range check would refuse every round, and a plan nobody has to sign each time needs a contract
 * that is built and audited for mainnet first. Turn it on there, with small amounts.
 */
export const DCA_AVAILABLE = false

/**
 * Display currency choices. USD only for now (Hieu, 2026-10-28): the Menu shows a currency dropdown that is locked. VND
 * formatting still exists in the app; to offer it again, add it to CURRENCIES in SettingsScreen and set this to true.
 */
export const CURRENCY_CHOICES = false
