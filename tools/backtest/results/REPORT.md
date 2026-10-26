# Backtest report — 2026-10-26 04:41

Data through 2026-10-23. In-sample 2005-01-01→2016-12-31, validation 2017-01-01→2022-12-31. Holdout 2023-01-01→ untouched by this run.

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
| rsi_n=2, rsi_th=15, exit_sma=10, slots=3 | 6.2% | 0.62 | -17.7% | 732 |
| rsi_n=2, rsi_th=10, exit_sma=10, slots=3 | 5.9% | 0.61 | -16.9% | 539 |
| rsi_n=2, rsi_th=15, exit_sma=10, slots=5 | 5.6% | 0.60 | -17.9% | 1051 |
| rsi_n=2, rsi_th=15, exit_sma=5, slots=3 | 4.9% | 0.54 | -16.1% | 835 |
| rsi_n=2, rsi_th=5, exit_sma=10, slots=3 | 4.5% | 0.52 | -16.5% | 333 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=5 | 2.9% | 0.51 | -13.4% | 480 |
| rsi_n=2, rsi_th=15, exit_sma=5, slots=5 | 4.1% | 0.50 | -15.7% | 1179 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5 | 3.6% | 0.49 | -14.7% | 865 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=3 | 3.4% | 0.47 | -15.2% | 372 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=3 | 3.9% | 0.46 | -16.7% | 622 |

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
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5, fear=level | 2.4% | 0.43 | -14.7% | 284 |
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

## rangefade

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| window=20, atr_buffer=0.5, regime=held2, target=opposite, entry=rejection | -1.2% | 0.01 | -45.1% | 1304 |
| window=20, atr_buffer=2.0, regime=adx25, target=opposite, entry=limit | -0.7% | 0.00 | -52.6% | 538 |
| window=20, atr_buffer=2.0, regime=adx25, target=2R, entry=limit | -0.8% | -0.00 | -53.0% | 528 |
| window=20, atr_buffer=1.0, regime=adx25, target=opposite, entry=limit | -0.8% | -0.02 | -47.7% | 696 |
| window=20, atr_buffer=1.0, regime=held2, target=opposite, entry=rejection | -2.0% | -0.03 | -47.7% | 1083 |
| window=20, atr_buffer=2.0, regime=held2, target=opposite, entry=rejection | -2.2% | -0.05 | -48.3% | 810 |
| window=60, atr_buffer=2.0, regime=adx25, target=2R, entry=limit | -1.1% | -0.06 | -42.0% | 236 |
| window=20, atr_buffer=0.5, regime=held2, target=2R, entry=rejection | -2.1% | -0.06 | -41.4% | 1592 |
| window=60, atr_buffer=2.0, regime=adx25, target=opposite, entry=limit | -1.2% | -0.07 | -42.0% | 236 |
| window=20, atr_buffer=1.0, regime=adx25, target=2R, entry=limit | -1.5% | -0.09 | -47.5% | 692 |
| window=20, atr_buffer=2.0, regime=held2, target=opposite, entry=limit | -2.9% | -0.10 | -49.0% | 926 |
| window=20, atr_buffer=0.5, regime=adx25, target=opposite, entry=limit | -1.8% | -0.11 | -47.5% | 851 |
| window=20, atr_buffer=1.0, regime=held2, target=2R, entry=rejection | -3.1% | -0.12 | -45.3% | 1129 |
| window=60, atr_buffer=0.5, regime=adx25, target=opposite, entry=limit | -1.4% | -0.15 | -34.2% | 303 |
| window=60, atr_buffer=1.0, regime=adx25, target=opposite, entry=limit | -1.5% | -0.15 | -36.4% | 273 |
| window=60, atr_buffer=2.0, regime=held2, target=2R, entry=limit | -3.5% | -0.16 | -56.2% | 733 |
| window=60, atr_buffer=1.0, regime=adx25, target=2R, entry=limit | -1.6% | -0.17 | -36.0% | 276 |
| window=60, atr_buffer=2.0, regime=held2, target=2R, entry=rejection | -4.2% | -0.19 | -54.6% | 708 |
| window=60, atr_buffer=2.0, regime=held2, target=opposite, entry=limit | -4.0% | -0.19 | -55.9% | 725 |
| window=60, atr_buffer=2.0, regime=held2, target=opposite, entry=rejection | -4.6% | -0.21 | -52.5% | 695 |
| window=60, atr_buffer=1.0, regime=held2, target=2R, entry=rejection | -4.3% | -0.21 | -54.8% | 1039 |
| window=60, atr_buffer=0.5, regime=held2, target=opposite, entry=limit | -4.2% | -0.23 | -55.3% | 1313 |
| window=60, atr_buffer=1.0, regime=held2, target=opposite, entry=rejection | -4.8% | -0.23 | -52.5% | 920 |
| window=60, atr_buffer=0.5, regime=held2, target=2R, entry=rejection | -4.4% | -0.24 | -49.9% | 1397 |
| window=60, atr_buffer=0.5, regime=held2, target=opposite, entry=rejection | -4.8% | -0.25 | -51.2% | 1120 |
| window=20, atr_buffer=2.0, regime=held2, target=2R, entry=limit | -5.0% | -0.26 | -59.3% | 901 |
| window=20, atr_buffer=1.0, regime=held2, target=2R, entry=limit | -5.2% | -0.27 | -56.9% | 1378 |
| window=60, atr_buffer=1.0, regime=held2, target=2R, entry=limit | -4.5% | -0.27 | -54.2% | 1048 |
| window=20, atr_buffer=2.0, regime=held2, target=2R, entry=rejection | -5.4% | -0.28 | -58.1% | 727 |
| window=60, atr_buffer=1.0, regime=held2, target=opposite, entry=limit | -5.4% | -0.32 | -58.4% | 1000 |
| window=20, atr_buffer=0.5, regime=adx25, target=2R, entry=limit | -4.2% | -0.35 | -53.3% | 873 |
| window=60, atr_buffer=0.5, regime=adx25, target=2R, entry=limit | -2.8% | -0.36 | -37.5% | 308 |
| window=20, atr_buffer=1.0, regime=held2, target=opposite, entry=limit | -6.9% | -0.37 | -66.3% | 1301 |
| window=60, atr_buffer=0.5, regime=held2, target=2R, entry=limit | -5.1% | -0.37 | -60.3% | 1474 |
| window=60, atr_buffer=2.0, regime=adx25, target=opposite, entry=rejection | -5.3% | -0.40 | -54.2% | 648 |
| window=20, atr_buffer=2.0, regime=adx25, target=opposite, entry=rejection | -6.7% | -0.45 | -61.0% | 775 |
| window=60, atr_buffer=2.0, regime=adx25, target=2R, entry=rejection | -6.2% | -0.48 | -57.7% | 655 |
| window=20, atr_buffer=0.5, regime=held2, target=opposite, entry=limit | -8.0% | -0.49 | -69.0% | 1734 |
| window=60, atr_buffer=1.0, regime=adx25, target=opposite, entry=rejection | -6.6% | -0.53 | -58.5% | 812 |
| window=60, atr_buffer=1.0, regime=adx25, target=2R, entry=rejection | -6.6% | -0.54 | -60.7% | 915 |
| window=20, atr_buffer=0.5, regime=held2, target=2R, entry=limit | -8.5% | -0.56 | -72.2% | 2009 |
| window=20, atr_buffer=2.0, regime=adx25, target=2R, entry=rejection | -7.6% | -0.56 | -66.2% | 698 |
| window=20, atr_buffer=1.0, regime=adx25, target=opposite, entry=rejection | -8.2% | -0.59 | -67.9% | 1001 |
| window=60, atr_buffer=0.5, regime=adx25, target=opposite, entry=rejection | -7.2% | -0.62 | -61.2% | 995 |
| window=20, atr_buffer=1.0, regime=adx25, target=2R, entry=rejection | -8.5% | -0.66 | -67.7% | 1048 |
| window=20, atr_buffer=0.5, regime=adx25, target=2R, entry=rejection | -8.2% | -0.70 | -66.5% | 1460 |
| window=60, atr_buffer=0.5, regime=adx25, target=2R, entry=rejection | -8.1% | -0.78 | -66.7% | 1178 |
| window=20, atr_buffer=0.5, regime=adx25, target=opposite, entry=rejection | -9.7% | -0.78 | -73.8% | 1251 |

**Chosen:** `window=20, atr_buffer=0.5, regime=held2, target=opposite, entry=rejection`  
Validation: CAGR -2.2% · Sharpe -0.07 · MaxDD -34.9% · exposure 96% · trades 697  
Validation @2× costs: CAGR -4.5% · Sharpe -0.24 · MaxDD -38.4% · exposure 96% · trades 697

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | -0.07 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ❌ | -34.9% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR -4.5%, Sharpe -0.24 |
| C4 no year > 50% of profit | ❌ | no net profit |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ❌ | median -0.03 vs 0.01 |
| C6 ≥ 30 rebalances/trades | ✅ | 697 |

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
