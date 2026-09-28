# Strategy backtest harness

Local, offline research harness for finding a replacement for ORB_MOMENTUM_001.
Nothing here trades or touches the worker — a strategy only goes to paper
trading (worker cron + `runTradePoll`) after it passes the protocol below.

```
python tools/backtest/run.py             # in-sample grid → validation verdicts
python tools/backtest/run.py --holdout   # finalists only, ONCE, on untouched data
python tools/backtest/run.py --refresh   # re-download the price cache first
```

## Scope (operator decision 2026-09-28)

- Shares / ETFs only (the edge must exist on the underlying before options are considered).
- Max hold 4 weeks (20 trading days).
- ETF universes only in v1 — a "current S&P 100" stock list has survivorship
  bias, which flatters dip-buying strategies in particular.

## Strategy families (fixed grids)

- **momentum** — every 20 trading days rank the universe by N-day return,
  hold the top K equally weighted, only names with positive momentum (else
  cash). Grid: lookback {63,126,252} × top K {2,3,4} × universe {sectors, multi-asset}.
- **meanrev** — dip-buying control: close > SMA200 and RSI(2) < threshold →
  buy next open; exit when close > SMA(exit) or after 20 days. ≤ 5 slots.
  Grid: RSI(2) threshold {5,10,15} × exit SMA {5,10} × slots {3,5}.
- **meanrev_vix** — same dip-buying rule, entries only when the market is
  fearful (operator idea 2026-09-28). Grid: RSI period/threshold
  {RSI(2) < 5, RSI(2) < 10, RSI(20) < 35, RSI(20) < 40} × fear filter
  {VIX ≥ 1.10 × its 20-day SMA ("spike"), VIX > 20 ("level")}; exit SMA 5,
  5 slots. Compared against `meanrev` to see whether the filter adds value.

## Protocol — fixed BEFORE any results were seen

| Period | Dates | Use |
|---|---|---|
| Warm-up | 2004 | indicators only |
| In-sample | 2005-01-01 → 2016-12-31 | pick the best config per strategy family from a small, fixed grid |
| Validation | 2017-01-01 → 2022-12-31 | pass/fail against the acceptance criteria |
| **Holdout** | 2023-01-01 → today | finalists only, run once, logged in `results/holdout_log.md` |

Execution: signal on the close of day *t*, fill at the open of *t+1* (no
look-ahead). Costs: 5 bps per side (spread + commission + slippage) on
turnover; stress test at 2×. Idle cash earns 0% (conservative). Sharpe has no
risk-free adjustment. Prices are Yahoo dividend/split-adjusted daily bars.

### Acceptance criteria (validation period, and again on holdout)

1. **Risk-adjusted beat:** net Sharpe ≥ max(0.8, SPY buy-and-hold Sharpe)
2. **Drawdown:** max drawdown ≤ 25% and ≤ SPY's
3. **Cost stress:** at 2× costs, CAGR > 0 and Sharpe ≥ 0.6
4. **Not one lucky year:** no single calendar year > 50% of total profit
5. **Robust, not a spike:** median in-sample Sharpe of the grid neighbours
   (one parameter step away) ≥ 0.7 × the chosen config's in-sample Sharpe
6. **Enough evidence:** ≥ 30 rebalances / trades in the period

The backtest decides. A config that fails is logged in
`results/rejection_log.md` with the reason and is not re-tuned on
validation data.
