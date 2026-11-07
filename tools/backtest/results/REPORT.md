# Backtest report — 2026-11-06 23:28

Data through 2026-11-06. In-sample 2005-01-01→2016-12-31, validation 2017-01-01→2022-12-31. Holdout 2023-01-01→ untouched by this run.

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
| rsi_n=2, rsi_th=15, exit_sma=5, slots=5 | 4.1% | 0.50 | -15.7% | 1180 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=5 | 3.6% | 0.49 | -14.7% | 866 |
| rsi_n=2, rsi_th=5, exit_sma=5, slots=3 | 3.4% | 0.47 | -15.2% | 372 |
| rsi_n=2, rsi_th=10, exit_sma=5, slots=3 | 4.0% | 0.47 | -16.7% | 623 |

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

## trend

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| ma_type=sma, length=100, step=20, universe=multi | 6.0% | 0.77 | -13.4% | 172 |
| ma_type=sma, length=100, step=5, universe=multi | 5.7% | 0.76 | -9.9% | 330 |
| ma_type=ema, length=200, step=20, universe=multi | 6.2% | 0.76 | -13.2% | 118 |
| ma_type=ema, length=100, step=20, universe=multi | 5.9% | 0.73 | -14.0% | 181 |
| ma_type=sma, length=200, step=5, universe=multi | 5.6% | 0.73 | -9.0% | 215 |
| ma_type=ema, length=200, step=5, universe=multi | 5.5% | 0.72 | -10.1% | 253 |
| ma_type=sma, length=200, step=20, universe=sectors | 6.1% | 0.71 | -15.0% | 97 |
| ma_type=sma, length=200, step=20, universe=multi | 5.7% | 0.71 | -16.8% | 109 |
| ma_type=ema, length=100, step=5, universe=multi | 5.3% | 0.70 | -9.4% | 384 |
| ma_type=ema, length=200, step=20, universe=sectors | 6.2% | 0.69 | -15.0% | 101 |
| ma_type=sma, length=200, step=5, universe=sectors | 5.6% | 0.69 | -13.8% | 189 |
| ma_type=ema, length=100, step=5, universe=sectors | 5.1% | 0.64 | -14.0% | 333 |
| ma_type=ema, length=200, step=5, universe=sectors | 5.3% | 0.64 | -13.7% | 199 |
| ma_type=ema, length=100, step=20, universe=sectors | 5.3% | 0.63 | -18.0% | 155 |
| ma_type=sma, length=100, step=20, universe=sectors | 4.9% | 0.59 | -18.9% | 160 |
| ma_type=sma, length=100, step=5, universe=sectors | 4.5% | 0.59 | -15.6% | 315 |

**Chosen:** `ma_type=sma, length=100, step=20, universe=multi`  
Validation: CAGR 4.3% · Sharpe 0.56 · MaxDD -21.0% · exposure 62% · trades 83  
Validation @2× costs: CAGR 4.2% · Sharpe 0.54 · MaxDD -21.0% · exposure 62% · trades 83

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.56 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -21.0% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR 4.2%, Sharpe 0.54 |
| C4 no year > 50% of profit | ✅ | 2021: 44% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.76 vs 0.54 |
| C6 ≥ 30 rebalances/trades | ✅ | 76 |

**Verdict: REJECTED**

## dualmom

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| lookback=126, risk=spy_efa, defensive=IEF | 9.0% | 0.69 | -26.0% | 31 |
| lookback=252, risk=broad, defensive=IEF | 11.7% | 0.65 | -28.8% | 34 |
| lookback=252, risk=broad, defensive=cash | 10.8% | 0.62 | -28.8% | 31 |
| lookback=126, risk=spy_efa, defensive=cash | 7.2% | 0.59 | -28.0% | 25 |
| lookback=63, risk=spy_efa, defensive=IEF | 6.9% | 0.57 | -29.2% | 52 |
| lookback=252, risk=spy_efa, defensive=IEF | 7.4% | 0.56 | -26.8% | 24 |
| lookback=252, risk=spy_efa, defensive=cash | 6.1% | 0.49 | -28.9% | 19 |
| lookback=126, risk=broad, defensive=IEF | 8.3% | 0.48 | -57.7% | 48 |
| lookback=126, risk=broad, defensive=cash | 7.1% | 0.43 | -56.1% | 40 |
| lookback=63, risk=spy_efa, defensive=cash | 4.8% | 0.43 | -29.6% | 39 |
| lookback=63, risk=broad, defensive=IEF | 6.4% | 0.41 | -43.5% | 77 |
| lookback=63, risk=broad, defensive=cash | 5.2% | 0.36 | -44.6% | 63 |

**Chosen:** `lookback=126, risk=spy_efa, defensive=IEF`  
Validation: CAGR 3.4% · Sharpe 0.30 · MaxDD -32.0% · exposure 100% · trades 16  
Validation @2× costs: CAGR 3.1% · Sharpe 0.28 · MaxDD -32.0% · exposure 100% · trades 16

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.30 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ❌ | -32.0% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR 3.1%, Sharpe 0.28 |
| C4 no year > 50% of profit | ❌ | 2021: 88% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.57 vs 0.48 |
| C6 ≥ 30 rebalances/trades | ✅ | 75 |

**Verdict: REJECTED**

## volmom

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| lookback=63, top_k=4 | 11.2% | 0.95 | -17.1% | 185 |
| lookback=63, top_k=3 | 11.8% | 0.92 | -24.0% | 157 |
| lookback=63, top_k=2 | 12.3% | 0.86 | -23.7% | 128 |
| lookback=126, top_k=4 | 9.0% | 0.73 | -31.1% | 130 |
| lookback=252, top_k=4 | 7.4% | 0.63 | -20.5% | 97 |
| lookback=126, top_k=3 | 6.6% | 0.51 | -36.6% | 129 |
| lookback=252, top_k=3 | 5.9% | 0.50 | -23.6% | 99 |
| lookback=126, top_k=2 | 5.1% | 0.40 | -34.7% | 116 |
| lookback=252, top_k=2 | 3.1% | 0.28 | -35.9% | 86 |

**Chosen:** `lookback=63, top_k=4`  
Validation: CAGR 10.6% · Sharpe 0.91 · MaxDD -16.0% · exposure 87% · trades 87  
Validation @2× costs: CAGR 10.2% · Sharpe 0.88 · MaxDD -16.2% · exposure 87% · trades 87

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ✅ | 0.91 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -16.0% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ✅ | CAGR 10.2%, Sharpe 0.88 |
| C4 no year > 50% of profit | ✅ | 2020: 39% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.92 vs 0.67 |
| C6 ≥ 30 rebalances/trades | ✅ | 75 |

**Verdict: PASS → finalist**

## lowvol

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| vol_win=63, top_k=5 | 9.1% | 0.89 | -14.7% | 100 |
| vol_win=126, top_k=3 | 8.8% | 0.84 | -18.6% | 47 |
| vol_win=63, top_k=3 | 8.6% | 0.83 | -16.2% | 68 |
| vol_win=63, top_k=4 | 8.2% | 0.81 | -15.6% | 97 |
| vol_win=126, top_k=4 | 8.2% | 0.80 | -16.7% | 66 |
| vol_win=126, top_k=5 | 8.1% | 0.79 | -17.2% | 76 |

**Chosen:** `vol_win=63, top_k=5`  
Validation: CAGR 4.5% · Sharpe 0.43 · MaxDD -25.9% · exposure 79% · trades 64  
Validation @2× costs: CAGR 4.3% · Sharpe 0.41 · MaxDD -25.9% · exposure 79% · trades 64

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.43 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ❌ | -25.9% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR 4.3%, Sharpe 0.41 |
| C4 no year > 50% of profit | ❌ | 2021: 63% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.81 vs 0.62 |
| C6 ≥ 30 rebalances/trades | ✅ | 76 |

**Verdict: REJECTED**

## dip_rsi

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| rsi_th=15, trend=sma200, universe=SPY | 3.1% | 0.51 | -14.1% | 146 |
| rsi_th=10, trend=sma200, universe=SPY | 2.5% | 0.47 | -14.3% | 93 |
| rsi_th=10, trend=sma200, universe=indices | 2.2% | 0.44 | -14.4% | 389 |
| rsi_th=15, trend=sma200, universe=indices | 2.4% | 0.43 | -14.8% | 564 |
| rsi_th=10, trend=ema200, universe=indices | 2.2% | 0.42 | -14.4% | 394 |
| rsi_th=15, trend=ema200, universe=indices | 2.3% | 0.40 | -14.8% | 574 |
| rsi_th=15, trend=ema200, universe=SPY | 2.2% | 0.37 | -14.1% | 144 |
| rsi_th=5, trend=sma200, universe=SPY | 1.3% | 0.35 | -15.0% | 46 |
| rsi_th=5, trend=ema200, universe=SPY | 1.2% | 0.33 | -15.0% | 46 |
| rsi_th=10, trend=ema200, universe=SPY | 1.6% | 0.31 | -14.5% | 92 |
| rsi_th=5, trend=ema200, universe=indices | 1.2% | 0.30 | -13.8% | 206 |
| rsi_th=5, trend=sma200, universe=indices | 1.1% | 0.30 | -13.8% | 202 |

**Chosen:** `rsi_th=15, trend=sma200, universe=SPY`  
Validation: CAGR 3.3% · Sharpe 0.45 · MaxDD -10.9% · exposure 14% · trades 64  
Validation @2× costs: CAGR 2.2% · Sharpe 0.31 · MaxDD -10.9% · exposure 14% · trades 64

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | 0.45 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -10.9% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR 2.2%, Sharpe 0.31 |
| C4 no year > 50% of profit | ❌ | 2021: 53% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.47 vs 0.36 |
| C6 ≥ 30 rebalances/trades | ✅ | 64 |

**Verdict: REJECTED**

## dip_ibs

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| ibs_th=0.1, trend=sma200, universe=SPY | 3.9% | 0.61 | -13.4% | 151 |
| ibs_th=0.2, trend=sma200, universe=SPY | 3.7% | 0.50 | -18.8% | 224 |
| ibs_th=0.2, trend=ema200, universe=SPY | 3.8% | 0.49 | -21.3% | 234 |
| ibs_th=0.1, trend=ema200, universe=SPY | 3.3% | 0.49 | -13.4% | 155 |
| ibs_th=0.2, trend=ema200, universe=indices | 2.6% | 0.36 | -20.2% | 918 |
| ibs_th=0.1, trend=ema200, universe=indices | 1.8% | 0.30 | -17.7% | 607 |
| ibs_th=0.1, trend=sma200, universe=indices | 1.7% | 0.29 | -16.7% | 592 |
| ibs_th=0.3, trend=ema200, universe=SPY | 2.1% | 0.27 | -21.5% | 286 |
| ibs_th=0.2, trend=sma200, universe=indices | 1.9% | 0.27 | -20.1% | 890 |
| ibs_th=0.3, trend=ema200, universe=indices | 1.6% | 0.22 | -21.9% | 1133 |
| ibs_th=0.3, trend=sma200, universe=SPY | 1.3% | 0.19 | -24.6% | 277 |
| ibs_th=0.3, trend=sma200, universe=indices | 1.0% | 0.15 | -23.4% | 1107 |

**Chosen:** `ibs_th=0.1, trend=sma200, universe=SPY`  
Validation: CAGR 6.6% · Sharpe 0.84 · MaxDD -11.0% · exposure 17% · trades 75  
Validation @2× costs: CAGR 5.3% · Sharpe 0.68 · MaxDD -11.1% · exposure 17% · trades 75

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ✅ | 0.84 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -11.0% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ✅ | CAGR 5.3%, Sharpe 0.68 |
| C4 no year > 50% of profit | ✅ | 2021: 45% |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ✅ | median 0.50 vs 0.42 |
| C6 ≥ 30 rebalances/trades | ✅ | 75 |

**Verdict: PASS → finalist**

## dip_down

In-sample grid (sorted by Sharpe):

| config | CAGR | Sharpe | MaxDD | trades |
|---|---|---|---|---|
| n_down=3, trend=sma200, universe=SPY | 1.1% | 0.34 | -6.8% | 100 |
| n_down=4, trend=ema200, universe=indices | 0.5% | 0.26 | -6.8% | 170 |
| n_down=3, trend=sma200, universe=indices | 0.8% | 0.26 | -6.7% | 395 |
| n_down=3, trend=ema200, universe=indices | 0.8% | 0.25 | -7.3% | 402 |
| n_down=3, trend=ema200, universe=SPY | 0.8% | 0.24 | -9.3% | 100 |
| n_down=4, trend=sma200, universe=indices | 0.3% | 0.14 | -7.5% | 167 |
| n_down=4, trend=ema200, universe=SPY | 0.3% | 0.13 | -7.7% | 39 |
| n_down=4, trend=sma200, universe=SPY | 0.3% | 0.12 | -9.4% | 41 |
| n_down=2, trend=ema200, universe=SPY | 0.0% | 0.04 | -11.8% | 252 |
| n_down=2, trend=sma200, universe=SPY | 0.0% | 0.03 | -12.7% | 246 |
| n_down=2, trend=ema200, universe=indices | -0.6% | -0.08 | -12.1% | 1008 |
| n_down=2, trend=sma200, universe=indices | -0.7% | -0.10 | -14.1% | 984 |

**Chosen:** `n_down=3, trend=sma200, universe=SPY`  
Validation: CAGR -0.6% · Sharpe -0.09 · MaxDD -18.0% · exposure 5% · trades 51  
Validation @2× costs: CAGR -1.4% · Sharpe -0.25 · MaxDD -19.4% · exposure 5% · trades 51

| criterion | pass | value |
|---|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ | -0.09 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ | -18.0% vs SPY -32.0% |
| C3 2× costs: CAGR>0, Sharpe ≥ 0.6 | ❌ | CAGR -1.4%, Sharpe -0.25 |
| C4 no year > 50% of profit | ❌ | no net profit |
| C5 neighbours ≥ 0.7× in-sample Sharpe | ❌ | median 0.12 vs 0.24 |
| C6 ≥ 30 rebalances/trades | ✅ | 51 |

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
