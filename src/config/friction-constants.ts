/**
 * Centralized Trading Friction Models & Statutory Schedules.
 *
 * Defines named friction tiers across all trading instruments and execution modes.
 *
 * GUARDRAILS & CONTINUITY:
 * 1. Default tier for INDEX_BTST remains `EXCHANGE_TURNOVER_ONLY` (0.00002 / 0.002%)
 *    to preserve historical comparability with existing backtests.
 * 2. Default tier for STOCK_BTST remains `FUTURES_PROXY` (0.00030 / 0.030%).
 * 3. Default tier for INTRADAY remains `EQUITY_SWING` (0.00030 / 0.030%).
 * 4. Realistic statutory and conservative tiers are exposed explicitly for executable
 *    comparison without silently mutating baseline backtest results.
 */

export type IndexBtstFrictionTier = 'EXCHANGE_TURNOVER_ONLY' | 'STATUTORY_FUTURES' | 'CONSERVATIVE';
export type StockBtstFrictionTier = 'FUTURES_PROXY' | 'STATUTORY_CASH_DELIVERY';
export type IntradayFrictionTier = 'EQUITY_SWING';
export type OptionPremiumFrictionTier = 'RETAIL_STATUTORY';

export interface BaseFrictionTierConfig {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

export interface TurnoverOnlyFrictionConfig extends BaseFrictionTierConfig {
  mode: 'TURNOVER_FLAT';
  turnoverRate: number; // e.g. 0.00002 for 0.2 bps
}

export interface ItemizedStatutoryFuturesConfig extends BaseFrictionTierConfig {
  mode: 'ITEMIZED_FUTURES';
  sttSellRate: number;         // 0.05% on sell turnover (April 2026 schedule)
  stampDutyBuyRate: number;   // 0.002% on buy turnover
  exchangeRatePerLeg: number; // 0.00173% per leg turnover (NSE futures)
  sebiRate: number;           // ₹10/crore (0.0001%)
  brokeragePerOrder: number;  // Standard discount broker allowance (₹20/order)
  gstRate: number;            // 18% on (brokerage + exchange + sebi)
}

export interface ItemizedCashDeliveryConfig extends BaseFrictionTierConfig {
  mode: 'ITEMIZED_CASH_DELIVERY';
  sttBuyRate: number;         // 0.10% on buy turnover
  sttSellRate: number;        // 0.10% on sell turnover
  stampDutyBuyRate: number;   // 0.015% on buy turnover
  exchangeRatePerLeg: number; // 0.00297% per leg turnover (NSE cash delivery)
  sebiRate: number;           // ₹10/crore (0.0001%)
  dpChargePerSell: number;    // Depository charge on sell leg (~₹15.93 incl GST)
  brokeragePerOrder: number;  // Discount broker standard (₹0 for delivery)
  gstRate: number;            // 18% on (brokerage + exchange + sebi)
}

export interface ItemizedOptionPremiumConfig extends BaseFrictionTierConfig {
  mode: 'ITEMIZED_OPTION_PREMIUM';
  sttSellRate: number;         // 0.10% on sell premium turnover
  stampDutyBuyRate: number;   // 0.003% on buy premium turnover
  exchangeRatePerLeg: number; // 0.05% per leg premium turnover (NSE options)
  sebiRate: number;           // ₹10/crore (0.0001%)
  brokeragePerOrder: number;  // Standard discount broker allowance (₹20/order)
  gstRate: number;            // 18% on (brokerage + exchange + sebi)
}

export const FRICTION_MODELS = {
  /**
   * INDEX_BTST (NIFTY, BANKNIFTY, SENSEX futures proxy)
   */
  INDEX_BTST: {
    DEFAULT_TIER: 'EXCHANGE_TURNOVER_ONLY' as IndexBtstFrictionTier,
    TIERS: {
      /** Legacy baseline: bare exchange turnover fee (matches 0.00002 / 0.2 bps) */
      EXCHANGE_TURNOVER_ONLY: {
        id: 'EXCHANGE_TURNOVER_ONLY',
        name: 'Exchange Turnover Only (Legacy Baseline)',
        description: 'Bare NSE exchange fee (~0.0019% rounded to 0.002%). Omits STT, stamp duty, GST, and brokerage.',
        isDefault: true,
        mode: 'TURNOVER_FLAT',
        turnoverRate: 0.00002, // 0.2 bps
      } as TurnoverOnlyFrictionConfig,

      /** Modeled Indian statutory futures levies + explicit exchange/broker charges + GST */
      STATUTORY_FUTURES: {
        id: 'STATUTORY_FUTURES',
        name: 'Statutory & Regulatory Futures (Modeled All-In)',
        description: 'Statutory levies (STT 0.05% on sell, stamp duty 0.002% on buy, SEBI turnover ₹10/crore) + exchange transaction charge (0.00173%), brokerage allowance (₹20/order), and GST (18% on brokerage + exchange + SEBI).',
        isDefault: false,
        mode: 'ITEMIZED_FUTURES',
        sttSellRate: 0.0005,       // 0.05% on sell turnover
        stampDutyBuyRate: 0.00002, // 0.002% on buy turnover
        exchangeRatePerLeg: 0.0000173, // 0.00173% per leg
        sebiRate: 0.000001,        // ₹10 per crore
        brokeragePerOrder: 20,     // ₹20 per order (₹40 round-trip)
        gstRate: 0.18,             // 18% on (brokerage + exchange + sebi)
      } as ItemizedStatutoryFuturesConfig,

      /** Conservative execution buffer */
      CONSERVATIVE: {
        id: 'CONSERVATIVE',
        name: 'Conservative Futures (5 bps Buffer)',
        description: 'Conservative 0.05% turnover haircut accounting for statutory levies, execution slippage, and spread drag.',
        isDefault: false,
        mode: 'TURNOVER_FLAT',
        turnoverRate: 0.0005, // 5 bps
      } as TurnoverOnlyFrictionConfig,
    },
  },

  /**
   * STOCK_BTST (Liquid F&O Stock Equities)
   */
  STOCK_BTST: {
    DEFAULT_TIER: 'FUTURES_PROXY' as StockBtstFrictionTier,
    TIERS: {
      /** Standard stock futures proxy (matches 0.00030 / 3.0 bps) */
      FUTURES_PROXY: {
        id: 'FUTURES_PROXY',
        name: 'Stock Futures Proxy (Existing 0.03%)',
        description: 'Standard 0.03% turnover haircut modeling F&O stock derivatives.',
        isDefault: true,
        mode: 'TURNOVER_FLAT',
        turnoverRate: 0.0003, // 3.0 bps
      } as TurnoverOnlyFrictionConfig,

      /** Real-world cash equity delivery (BTST) statutory schedule */
      STATUTORY_CASH_DELIVERY: {
        id: 'STATUTORY_CASH_DELIVERY',
        name: 'Cash Equity Delivery (BTST All-In)',
        description: 'Delivery STT (0.10% buy + 0.10% sell), stamp duty (0.015%), exchange turnover (0.00297%), DP charges (₹15.93 on sell), and GST.',
        isDefault: false,
        mode: 'ITEMIZED_CASH_DELIVERY',
        sttBuyRate: 0.001,           // 0.10% on buy turnover
        sttSellRate: 0.001,          // 0.10% on sell turnover
        stampDutyBuyRate: 0.00015,   // 0.015% on buy turnover
        exchangeRatePerLeg: 0.0000297,// 0.00297% per leg
        sebiRate: 0.000001,          // ₹10/crore
        dpChargePerSell: 15.93,      // ₹13.50 + 18% GST per scrip
        brokeragePerOrder: 0,        // Discount broker delivery standard
        gstRate: 0.18,               // 18% on (brokerage + exchange + sebi)
      } as ItemizedCashDeliveryConfig,
    },
  },

  /**
   * INTRADAY & SWING (General CPR Backtest)
   */
  INTRADAY: {
    DEFAULT_TIER: 'EQUITY_SWING' as IntradayFrictionTier,
    TIERS: {
      EQUITY_SWING: {
        id: 'EQUITY_SWING',
        name: 'Equity Swing Baseline (Existing 0.03%)',
        description: 'Standard 0.03% turnover haircut with dynamic liquidity/volatility slippage.',
        isDefault: true,
        mode: 'TURNOVER_FLAT',
        turnoverRate: 0.0003, // 3.0 bps
      } as TurnoverOnlyFrictionConfig,
    },
  },

  /**
   * OPTION_PREMIUM (Estimated Charges for Trade Journal)
   */
  OPTION_PREMIUM: {
    DEFAULT_TIER: 'RETAIL_STATUTORY' as OptionPremiumFrictionTier,
    TIERS: {
      RETAIL_STATUTORY: {
        id: 'RETAIL_STATUTORY',
        name: 'Retail Option Buying Drag',
        description: 'STT 0.10% on sell premium, exchange 0.05% per leg, stamp duty 0.003% on buy, ₹20/order brokerage + 18% GST.',
        isDefault: true,
        mode: 'ITEMIZED_OPTION_PREMIUM',
        sttSellRate: 0.001,          // 0.10% on sell premium
        stampDutyBuyRate: 0.00003,   // 0.003% on buy premium
        exchangeRatePerLeg: 0.0005,  // 0.05% per leg on premium
        sebiRate: 0.000001,          // ₹10/crore
        brokeragePerOrder: 20,       // ₹20 flat per order (₹40 round-trip)
        gstRate: 0.18,               // 18% on (brokerage + exchange + sebi)
      } as ItemizedOptionPremiumConfig,
    },
  },
} as const;
