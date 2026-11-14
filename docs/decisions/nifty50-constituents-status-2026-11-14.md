# Status Note: NIFTY 50 Universe Flagged Constituents

**Date:** 2026-11-14  
**Status:** Read-Only Audit Note (NO CODE / FLAG CHANGES)  
**File Covered:** `src/services/market.service.ts` (`STOCK_UNIVERSE`)

---

## 1. Summary of Flagged Symbols

The codebase currently flags 51 symbols with `isNifty50: true` in `STOCK_UNIVERSE`. These symbols are **unverified against NSE's official constituent factsheet**:

```
ADANIENT, ADANIPORTS, APOLLOHOSP, ASIANPAINT, AXISBANK,
BAJAJ-AUTO, BAJAJFINSV, BAJFINANCE, BHARTIARTL, BPCL,
BRITANNIA, CIPLA, COALINDIA, DIVISLAB, DRREDDY,
EICHERMOT, ETERNAL, GRASIM, HCLTECH, HDFCBANK,
HDFCLIFE, HEROMOTOCO, HINDUNILVR, ICICIBANK, INDUSINDBK,
INFY, ITC, JSWSTEEL, KOTAKBANK, LT,
LTM, M&M, MARUTI, NESTLEIND, NTPC,
ONGC, POWERGRID, RELIANCE, SBILIFE, SBIN,
SHRIRAMFIN, SUNPHARMA, TATACONSUM, TATASTEEL, TCS,
TECHM, TITAN, TMPV, TRENT, ULTRACEMCO,
WIPRO
```

---

## 2. Unverified Status & Potential Index Drift

- **Nifty 50 Slot Count:** The official NIFTY 50 index comprises exactly 50 members. Having 51 flagged constituents indicates index composition drift or an unevicted predecessor.
- **Potential Exclusions / Inclusions:** Recent periodic semi-annual rebalancings on NSE may have replaced several historical constituents (e.g., DIVISLAB, LTIMindtree, BPCL, BRITANNIA, HEROMOTOCO, INDUSINDBK) with newer entrants (e.g., BEL, JIOFIN, INDIGO, HINDALCO, MAXHEALTH).
- **Policy:** **No code modifications or `isNifty50` flag edits will be made** until the repository owner supplies an authoritative, date-stamped constituent list or CSV directly from `niftyindices.com` / NSE.
