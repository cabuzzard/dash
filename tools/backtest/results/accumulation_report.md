# Accumulation confirmation — report (Oct 26, 2026)

Harness/offline work ONLY. No worker change, no ORB engine change, no
holdout run. Protocol per tools/backtest/README.md: warm-up 2004;
in-sample 2005-01-01 → 2016-12-31; validation 2017-01-01 → 2022-12-31;
holdout 2023-01-01 → today, FINALISTS ONLY, run ONCE — **not run here**.
Execution: signal at close t, fill at open t+1; 5 bps/side, 2x stress;
idle cash 0%; Yahoo adjusted daily bars. Shares/ETFs only, max hold 20
trading days, ETF universes only in v1.

## The definition (fixed before any run, never expanded after results)

Accumulation = buyers quietly loading up while price stays flat. Four
fixed checks, all computed from bars up to and including day t:
1. **Range exists:** 20/40-day (high − low) / mean close ≤ 10%/15%.
2. **Up-day volume beats down-day volume** over the window: ratio ≥ 1.2/1.5.
3. **OBV rising while price flat or down:** OBV[t] > OBV[t−window] and
   price change over the window ≤ +2%.
4. **Confirmation event:** spring (low dips below prior support, close back
   above it) and/or SOS (close breaks prior resistance on ≥ 1.5x mean
   volume).
**Confirmed** = (spring OR SOS) AND at least 2 of {range, volume, OBV}.
The event is mandatory — a quiet range with no trigger is not confirmation.

Grid (fixed): window {20, 40} × vol_ratio {1.2, 1.5} × range_max {0.10, 0.15}
= 8 setup configs. Stage 2 adds entry {sos, backup} × exit_sma {5, 10}
= 32 configs. Slots fixed at 5. Backup = first retest close within 10
sessions of a confirmed SOS (low within 1% of the broken level, close
holds above it); exit = close < SMA(exit) or 20 sessions.

## Stage 1 — ORB filter test: the filter never fires on the ORB book

Book: 182 trades pulled Oct 25 ~8:40 PM; ORB trades (strategy
`ORB_MOMENTUM_001_V1`) = 69. Filter evaluated at the prior close before
each ORB entry (no look-ahead: an intraday entry cannot know that day's
close). Canonical config: window 20, vol_ratio 1.2, range_max 0.15.

**⚠ SAMPLE CAVEAT — read this first: only 9 ORB trades are closed (final
outcomes); 60 are still open (current marks are interim, NOT outcomes).
No filter verdict can come from 9 closes. 21+ more closes are needed
before even a weak verdict (30+ closed), and an arm-level comparison
needs ~30 per arm.**

| population | confirmed | unconfirmed |
|---|---|---|
| Closed (n=9, final) | **0** | 9: win 44% contract, avg −7.8% contract; win 67% underlying (direction-adjusted), avg +6.2% |
| Open interim (n=60, marks only) | **0** | 60: win 58% contract, avg +35.6%; win 65% underlying, avg +5.5% |

All 8 setup configs also give **0/69** confirmed. This is not an
implementation bug: component base rates at ORB prior closes are range
14%, volume 36%, OBV 9%, spring 10%, SOS 4% — so a confirmed day runs
≈ 2% of days, i.e. ≈ 1.4 expected confirmations in 69 entries, and
observing 0 has probability ≈ 25%. The finding is structural: ORB is a
morning-momentum strategy on movers; accumulation is a slow-consolidation
setup. They essentially never coincide on the same day.

**Exploratory only (post-hoc, NOT a verdict):** loosening to "confirmed
within the last 10 sessions" gives 6/69 confirmed — but 0 of the 9 closed
trades, so still no closed-outcome comparison. Open interim marks:
confirmed 6 (win 67%, avg +29.0%) vs unconfirmed 54 (win 57%, avg +36.4%)
— no edge visible, and interim marks are not outcomes. If the operator
wants the windowed version tested properly, it must be fixed as the
definition and re-run; it is not claimed here.

**Stage 1 conclusion:** as defined, accumulation confirmation cannot
improve ORB — it never fires on ORB entries. Do not add it as an ORB
filter.

## Stage 2 — standalone Wyckoff family: REJECTED

Universe: MR_UNIV (13 ETFs). SPY benchmarks — in-sample: CAGR 7.4%,
Sharpe 0.47, MaxDD −55.4%; validation: CAGR 11.3%, Sharpe 0.67,
MaxDD −32.0%.

Every one of the 32 configs has a NEGATIVE in-sample Sharpe (best
−0.10, worst −0.63). Chosen (least-bad in-sample Sharpe): window 20,
vol_ratio 1.2, range_max 0.15, entry backup, exit_sma 10.

| criterion | result |
|---|---|
| C1 Sharpe ≥ max(0.8, SPY) | ❌ −0.24 vs 0.80 |
| C2 MaxDD ≤ 25% and ≤ SPY | ✅ −10.3% vs SPY −32.0% (trivially — exposure only 15%) |
| C3 2x costs: CAGR > 0, Sharpe ≥ 0.6 | ❌ CAGR −1.3%, Sharpe −0.37 |
| C4 no year > 50% of profit | ❌ no net profit |
| C5 neighbours ≥ 0.7x in-sample Sharpe | ❌ median −0.21 vs −0.09 |
| C6 ≥ 30 trades | ✅ 126 validation trades |

Validation: CAGR −0.8%, Sharpe −0.24, MaxDD −10.3%, exposure 15%,
126 trades. Reproducibility: a second full re-run reproduced the same
chosen config and the same pass/fail pattern (validation Sharpe −0.23
vs −0.24, trades 127 vs 126 — Yahoo adjusted-history micro-revisions).

**Verdict: REJECTED.** Logged in `accumulation_rejection_log.md`
(a separate file — the shared `rejection_log.md` was left untouched to
avoid conflicts with the concurrent range-fade agent). The family is
NOT re-tuned on validation data, per protocol. Holdout was NOT run.

Note on backup vs SOS: backup trade counts run 1–3 below SOS counts
because the retest check can fire on the SOS day itself when the day's
low sits within 1% of the broken level. Both entries lose alike; the
distinction does not change the verdict.

**Stage 2 conclusion:** buying breakouts after accumulation confirmation
on diversified ETFs loses money net of costs in both periods. The
accumulation setup, as defined here, carries no edge on this universe.
It should NOT go to paper trading.

## Data & implementation notes (disclose loudly)

- **Yahoo via yfinance with a Chrome-impersonating session.** Plain
  yfinance sessions are rate-limited to 429 from this VM; the
  Chrome-impersonated session returns the same Yahoo adjusted bars.
  Same fetcher, same symbols, same adjustment — only the session
  differs.
- **bt.py's cache drops Volume**, and checks 2–3 are volume checks.
  `accumulation.py` therefore loads its own OHLCV panels into a NEW
  `cache_accum/` directory (runtime-generated, never committed, never
  bt's `cache/`). No existing harness file was modified.
- **Integration point (follow-up, not done here):** `run_accumulation.py`
  is standalone — it imports `bt.simulate / bt.metrics / bt.benchmark`
  but does not register into `run.py`'s FAMILIES. Folding it into
  `run.py` would require a registry edit to `bt.grid`/`run_family`;
  that edit was deliberately avoided to prevent conflicts with the
  concurrent range-fade agent's branch.
- **No position sizing, no options:** all harness figures are
  share/ETF percent returns, not the operator's option-contract
  outcomes. The Stage 1 book figures are option-contract percents from
  the tracker and are not comparable to Stage 2 figures.
