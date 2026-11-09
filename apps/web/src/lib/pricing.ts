import type { RegionSlug } from "@/lib/regions";

/**
 * What each plan costs, per market.
 *
 * Copied by hand from App Store Connect, read through RevenueCat's product
 * store state (project `projeb2883d3`, app `RiceCal iOS`), so these are the
 * territory prices Apple will charge and the page agrees with the paywall.
 *
 * The app never reads this — it takes the store's own localised `priceString`
 * at runtime. A marketing page cannot, so this is a snapshot that goes stale
 * the moment prices change. Re-read it there rather than editing a figure on a
 * hunch.
 *
 * Amounts are in major units, not micros, because people read this file.
 */

export type Money = {
  amount: number;
  currency: keyof typeof CURRENCIES;
};

export type MarketPricing = {
  /**
   * Nullable as a guard, not because any market is missing one: a market added
   * before its lifetime price is set gets no lifetime card rather than a
   * figure no store would honour. See `home/pricing.tsx`.
   */
  lifetime: Money | null;
  monthly: Money;
  yearly: Money;
};

/**
 * How each currency is written, which `Intl` will not tell you reliably —
 * `en-SG` renders SGD as a bare `$`, and a bare `$` next to a Malaysian price
 * a scroll above it is worse than no symbol at all.
 */
const CURRENCIES = {
  CNY: { decimals: 2, symbol: "¥" },
  HKD: { decimals: 2, symbol: "HK$" },
  IDR: { decimals: 0, symbol: "Rp" },
  INR: { decimals: 2, symbol: "₹" },
  JPY: { decimals: 0, symbol: "¥" },
  KRW: { decimals: 0, symbol: "₩" },
  MYR: { decimals: 2, symbol: "RM" },
  PHP: { decimals: 2, symbol: "₱" },
  PKR: { decimals: 0, symbol: "₨" },
  SGD: { decimals: 2, symbol: "S$" },
  THB: { decimals: 2, symbol: "฿" },
  TWD: { decimals: 0, symbol: "NT$" },
  USD: { decimals: 2, symbol: "US$" },
  VND: { decimals: 0, symbol: "₫" },
} as const;

/**
 * The App Store territory each region is priced from.
 *
 * `asia` is the pan-Asian default and takes the US price, which is also what
 * Apple charges in every territory it has no specific price for — Myanmar and
 * Sri Lanka among them, which is why those three are the same numbers.
 */
const PRICING = {
  asia: {
    lifetime: { amount: 119.99, currency: "USD" },
    monthly: { amount: 4.9, currency: "USD" },
    yearly: { amount: 29.9, currency: "USD" },
  },
  china: {
    lifetime: { amount: 798, currency: "CNY" },
    monthly: { amount: 32, currency: "CNY" },
    yearly: { amount: 198, currency: "CNY" },
  },
  "hong-kong": {
    lifetime: { amount: 888, currency: "HKD" },
    monthly: { amount: 38, currency: "HKD" },
    yearly: { amount: 228, currency: "HKD" },
  },
  india: {
    lifetime: { amount: 11900, currency: "INR" },
    monthly: { amount: 499, currency: "INR" },
    yearly: { amount: 2999, currency: "INR" },
  },
  indonesia: {
    lifetime: { amount: 1999000, currency: "IDR" },
    monthly: { amount: 79000, currency: "IDR" },
    yearly: { amount: 499000, currency: "IDR" },
  },
  japan: {
    lifetime: { amount: 20000, currency: "JPY" },
    monthly: { amount: 800, currency: "JPY" },
    yearly: { amount: 5000, currency: "JPY" },
  },
  malaysia: {
    // Set by hand in App Store Connect rather than taken from Apple's
    // equalisation of the US price, which is why it is not RM569.90.
    lifetime: { amount: 479.9, currency: "MYR" },
    monthly: { amount: 19.9, currency: "MYR" },
    yearly: { amount: 119.9, currency: "MYR" },
  },
  myanmar: {
    lifetime: { amount: 119.99, currency: "USD" },
    monthly: { amount: 4.9, currency: "USD" },
    yearly: { amount: 29.9, currency: "USD" },
  },
  pakistan: {
    lifetime: { amount: 29900, currency: "PKR" },
    monthly: { amount: 1300, currency: "PKR" },
    yearly: { amount: 7900, currency: "PKR" },
  },
  philippines: {
    lifetime: { amount: 7990, currency: "PHP" },
    monthly: { amount: 299, currency: "PHP" },
    yearly: { amount: 1990, currency: "PHP" },
  },
  singapore: {
    lifetime: { amount: 179.98, currency: "SGD" },
    monthly: { amount: 6.98, currency: "SGD" },
    yearly: { amount: 39.98, currency: "SGD" },
  },
  "south-korea": {
    lifetime: { amount: 199000, currency: "KRW" },
    monthly: { amount: 7700, currency: "KRW" },
    yearly: { amount: 49000, currency: "KRW" },
  },
  "sri-lanka": {
    lifetime: { amount: 119.99, currency: "USD" },
    monthly: { amount: 4.9, currency: "USD" },
    yearly: { amount: 29.9, currency: "USD" },
  },
  taiwan: {
    lifetime: { amount: 3990, currency: "TWD" },
    monthly: { amount: 150, currency: "TWD" },
    yearly: { amount: 990, currency: "TWD" },
  },
  thailand: {
    lifetime: { amount: 3990, currency: "THB" },
    monthly: { amount: 179, currency: "THB" },
    yearly: { amount: 999, currency: "THB" },
  },
  vietnam: {
    lifetime: { amount: 3999000, currency: "VND" },
    monthly: { amount: 149000, currency: "VND" },
    yearly: { amount: 999000, currency: "VND" },
  },
} as const satisfies Record<RegionSlug, MarketPricing>;

export function pricingFor(region: RegionSlug): MarketPricing {
  return PRICING[region];
}

export function formatMoney({ amount, currency }: Money): string {
  const { decimals, symbol } = CURRENCIES[currency];

  return (
    symbol +
    amount.toLocaleString("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    })
  );
}

/**
 * The yearly plan expressed per month, which is the number the card leads on.
 *
 * Worked out rather than stored, so it cannot disagree with the yearly figure
 * printed under it. Rounding is the currency's own — ¥417 a month, not
 * ¥416.67, because there is no such yen.
 */
export function perMonth(yearly: Money): Money {
  return { amount: yearly.amount / 12, currency: yearly.currency };
}

/**
 * How much the yearly plan saves against paying monthly, as a percentage.
 * Apple's price ladder is coarser in some currencies than others, so this
 * lands between 44% and 53% and a hardcoded "Save 50%" would be wrong in
 * eleven of the fifteen markets.
 */
export function yearlySaving(pricing: MarketPricing): number {
  const monthlyEquivalent = pricing.yearly.amount / 12;
  return Math.round((1 - monthlyEquivalent / pricing.monthly.amount) * 100);
}
