
## 2026-11-06 23:30 — holdout 2023-01-01→2026-11-06
SPY: CAGR 19.9% · Sharpe 1.27 · MaxDD -19.8% · exposure 100% · trades 1
- volmom `lookback=63, top_k=4`: CAGR 9.3% · Sharpe 0.78 · MaxDD -12.6% · exposure 98% · trades 65 · 2× costs CAGR 8.9% · Sharpe 0.75 · MaxDD -12.6% · exposure 98% · trades 65 · FAIL C1 Sharpe ≥ max(0.8, SPY)
- dip_ibs `ibs_th=0.1, trend=sma200, universe=SPY`: CAGR 2.1% · Sharpe 0.33 · MaxDD -8.0% · exposure 24% · trades 62 · 2× costs CAGR 0.5% · Sharpe 0.10 · MaxDD -8.5% · exposure 24% · trades 62 · FAIL C1 Sharpe ≥ max(0.8, SPY), C3 2× costs: CAGR>0, Sharpe ≥ 0.6, C4 no year > 50% of profit
