# Backtest report — 2026-09-28 11:24

Data through 2026-09-28. In-sample 2005-01-01→2016-12-31, validation 2017-01-01→2022-12-31. Holdout 2023-01-01→ untouched by this run.

**SPY buy & hold** — in-sample: CAGR 7.4% · Sharpe 0.47 · MaxDD -55.4% · exposure 100% · trades 1  
validation: CAGR 11.3% · Sharpe 0.67 · MaxDD -32.0% · exposure 100% · trades 1

## momentum

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| lookback=63, top_k=3, universe=multi | 13.7% | 0.98 | -19.6% | 158 |
| lookback=63, top_k=4, universe=multi | 12.1% | 0.96 | -17.0% | 169 |
| lookback=63, top_k=2, universe=multi | 12.6% | 0.80 | -28.1% | 133 |
| lookback=126, top_k=4, universe=multi | 10.0% | 0.74 | -26.0% | 130 |
| lookback=126, top_k=2, universe=multi | 10.7% | 0.67 | -35.5% | 95 |
| lookback=126, top_k=3, universe=multi | 9.3% | 0.64 | -34.9% | 116 |
| lookback=252, top_k=4, universe=multi | 7.0% | 0.57 | -20.5% | 92 |
| lookback=252, top_k=4, universe=sectors | 7.4% | 0.54 | -25.5% | 98 |
| lookback=126, top_k=4, universe=sectors | 7.0% | 0.53 | -26.7% | 130 |
| lookback=252, top_k=2, universe=sectors | 7.6% | 0.50 | -32.5% | 83 |
| lookback=126, top_k=3, universe=sectors | 6.8% | 0.49 | -33.3% | 128 |
| lookback=252, top_k=3, universe=sectors | 6.4% | 0.46 | -29.2% | 102 |
| lookback=126, top_k=2, universe=sectors | 7.0% | 0.45 | -41.8% | 105 |
| lookback=252, top_k=3, universe=multi | 5.6% | 0.44 | -27.5% | 97 |
| lookback=63, top_k=4, universe=sectors | 5.3% | 0.43 | -35.0% | 185 |
| lookback=63, top_k=3, universe=sectors | 5.2% | 0.40 | -39.8% | 159 |
| lookback=63, top_k=2, universe=sectors | 3.8% | 0.30 | -47.8% | 128 |
| lookback=252, top_k=2, universe=multi | 3.5% | 0.29 | -40.0% | 82 |

**Chosen:** `lookback=63, top_k=3, universe=multi`  
Validation: CAGR 8.4% · Sharpe 0.66 · MaxDD -18.5% · exposure 89% · trades 80  
Validation @2× costs: CAGR 7.9% · Sharpe 0.63 · MaxDD -18.9% · exposure 89% · trades 80

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.66 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -18.5% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ✅ | CAGR 7.9%, Sharpe 0.63 |
| C4 no year > 50% of profit | ✅ | 2020: 39% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.80 vs 0.69 |
| C6 ≥ 30 rebalances/trades | ✅ | 75 |

**Verdict: REJECTED**

## meanrev

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| rsi_n=2, rsi_th=5, exit_sma=10, slots=5 | 4.7% | 0.66 | -13.6% | 454 |
| rsi_n=2, rsi_th=10, exit_sma=10, slots=5 | 5.5% | 0.63 | -14.9% | 775 |
| rsi_n=2, rsi_th=15, exit_sma=10, slots=3 | 6.2% | 0.61 | -17.7% | 731 |
| rsi_n=2, rsi_th=10, exit_sma=10, slots=3 | 5.9% | 0.61 | -16.9% | 539 |
| rsi_n=2, rsi_th=15, exit_sma=10, slots=5 | 5.6% | 0.60 | -17.9% | 1050 |
| rsi_n=2, rsi_th=15, exit_sma=5, slots=3 | 5.0% | 0.54 | -16.1% | 835 |
| rsi_n=2, rsi_th=5, exit_sma=10, slots=3 | 4.5% | 0.52 | -16.5% | 333 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=5 | 2.9% | 0.51 | -13.4% | 480 |
| rsi_n=2, rsi_th=15, exit_sma=5, slots=5 | 4.1% | 0.50 | -15.7% | 1179 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5 | 3.6% | 0.49 | -14.7% | 865 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=3 | 3.4% | 0.47 | -15.2% | 372 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=3 | 3.9% | 0.47 | -16.7% | 622 |

**Chosen:** `rsi_n=2, rsi_th=5, exit_sma=10, slots=5`  
Validation: CAGR -4.0% · Sharpe -0.30 · MaxDD -36.3% · exposure 22% · trades 231  
Validation @2× costs: CAGR -4.7% · Sharpe -0.37 · MaxDD -37.3% · exposure 22% · trades 231

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | -0.30 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ❌ | -36.3% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR -4.7%, Sharpe -0.37 |
| C4 no year > 50% of profit | ❌ | no net profit |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.52 vs 0.46 |
| C6 ≥ 30 rebalances/trades | ✅ | 231 |

**Verdict: REJECTED**

## meanrev_vix

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| rsi_n=20, rsi_th=40, exit_sma=5, slots=5, fear=level | 2.2% | 0.63 | -6.2% | 110 |
| rsi_n=20, rsi_th=40, exit_sma=5, slots=5, fear=spike | 2.5% | 0.63 | -6.1% | 203 |
| rsi_n=20, rsi_th=35, exit_sma=5, slots=5, fear=spike | 0.6% | 0.55 | -2.6% | 38 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=5, fear=spike | 2.3% | 0.45 | -13.1% | 275 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5, fear=spike | 2.8% | 0.45 | -14.7% | 424 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5, fear=level | 2.4% | 0.44 | -14.7% | 284 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=5, fear=level | 1.8% | 0.40 | -13.1% | 168 |
| rsi_n=20, rsi_th=35, exit_sma=5, slots=5, fear=level | 0.3% | 0.33 | -2.6% | 20 |

**Chosen:** `rsi_n=20, rsi_th=40, exit_sma=5, slots=5, fear=level`  
Validation: CAGR 2.7% · Sharpe 0.58 · MaxDD -8.5% · exposure 4% · trades 85  
Validation @2× costs: CAGR 2.4% · Sharpe 0.52 · MaxDD -8.5% · exposure 4% · trades 85

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.58 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -8.5% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR 2.4%, Sharpe 0.52 |
| C4 no year > 50% of profit | ❌ | 2021: 54% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ❌ | median 0.33 vs 0.44 |
| C6 ≥ 30 rebalances/trades | ✅ | 85 |

**Verdict: REJECTED**

## Does the fear filter add value?

Each fear-filtered config vs the identical rule with no VIX filter, validation period.

| rule | fear filter | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|---|
| RSI(2) < 5 | none (control) | 0.7% | 0.14 | -12.7% | 260 |
| RSI(2) < 5 | spike | 0.3% | 0.08 | -13.1% | 148 |
| RSI(2) < 5 | level | 2.5% | 0.46 | -11.4% | 132 |
| RSI(2) < 10 | none (control) | 0.5% | 0.10 | -16.0% | 438 |
| RSI(2) < 10 | spike | -0.1% | 0.02 | -17.5% | 214 |
| RSI(2) < 10 | level | 2.7% | 0.44 | -11.4% | 195 |
| RSI(20) < 35 | none (control) | 1.1% | 0.33 | -7.9% | 28 |
| RSI(20) < 35 | spike | 0.9% | 0.29 | -7.9% | 25 |
| RSI(20) < 35 | level | 1.0% | 0.32 | -7.9% | 25 |
| RSI(20) < 40 | none (control) | 3.4% | 0.67 | -8.4% | 112 |
| RSI(20) < 40 | spike | 2.6% | 0.55 | -8.4% | 92 |
| RSI(20) < 40 | level | 2.7% | 0.58 | -8.5% | 85 |
