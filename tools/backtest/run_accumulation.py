"""Accumulation-confirmation runner — Stage 1 (ORB filter test) + Stage 2
(standalone Wyckoff family). Does NOT modify the harness: it imports
bt.simulate / bt.metrics / bt.benchmark and builds its own weight frames.

Protocol (README.md, fixed before results): warm-up 2004; in-sample
2005-01-01 -> 2016-12-31; validation 2017-01-01 -> 2022-12-31; holdout
2023-01-01 -> today, FINALISTS ONLY, run ONCE — this script NEVER runs
holdout. Execution: signal at close t, fill at open t+1; 5 bps/side, 2x
stress; idle cash 0%; Yahoo adjusted daily bars (via yfinance with a
Chrome-impersonating session; see accumulation.py).

Stage 1 is offline analysis of the operator's ORB paper book only — it
never touches the worker, any engine, cron, or KV.

Usage:
  python tools/backtest/run_accumulation.py --stage1 [--book PATH]
  python tools/backtest/run_accumulation.py --stage2 [--refresh]
  python tools/backtest/run_accumulation.py --all [--book PATH]
"""

import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import accumulation as acc
import bt

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "results")
IS_START, IS_END = "2005-01-01", "2016-12-31"
VAL_START, VAL_END = "2017-01-01", "2022-12-31"
MAX_HOLD = 20
SLOTS = 5

# FIXED GRIDS — set before any run, never expanded after seeing results.
SETUP_GRID = [dict(window=w, vol_ratio=v, range_max_pct=r)
              for w in (20, 40) for v in (1.2, 1.5) for r in (0.10, 0.15)]
CANONICAL = dict(window=20, vol_ratio=1.2, range_max_pct=0.15)  # Stage 1 filter
STAGE2_GRID = [dict(**s, entry=e, exit_sma=x)
               for s in SETUP_GRID for e in ("sos", "backup") for x in (5, 10)]


def fmt(m):
    return (f'CAGR {m["cagr"]:.1%} · Sharpe {m["sharpe"]:.2f} · '
            f'MaxDD {m["maxdd"]:.1%} · exposure {m["exposure"]:.0%} · '
            f'trades {m["entries"]}')


def label(p):
    return ", ".join(f"{k}={v}" for k, v in p.items())


def verdict(m1, m2, spy, nb_median, is_sharpe):
    checks = [
        ("C1 Sharpe >= max(0.8, SPY)", m1["sharpe"] >= max(0.8, spy["sharpe"]),
         f'{m1["sharpe"]:.2f} vs {max(0.8, spy["sharpe"]):.2f}'),
        ("C2 MaxDD <= 25% and <= SPY", m1["maxdd"] >= -0.25 and m1["maxdd"] >= spy["maxdd"],
         f'{m1["maxdd"]:.1%} vs SPY {spy["maxdd"]:.1%}'),
        ("C3 2x costs: CAGR>0, Sharpe >= 0.6", m2["cagr"] > 0 and m2["sharpe"] >= 0.6,
         f'CAGR {m2["cagr"]:.1%}, Sharpe {m2["sharpe"]:.2f}'),
        ("C4 no year > 50% of profit", m1["top_year_share"] <= 0.5,
         f'{m1["top_year"]}: {m1["top_year_share"]:.0%}' if m1["top_year_share"] != float("inf") else "no net profit"),
        ("C5 neighbours >= 0.7x in-sample Sharpe", nb_median is not None and nb_median >= 0.7 * is_sharpe,
         f'median {nb_median:.2f} vs {0.7 * is_sharpe:.2f}' if nb_median is not None else "no neighbours"),
        ("C6 >= 30 rebalances/trades", m1["rebalances"] >= 30, str(m1["rebalances"])),
    ]
    return all(ok for _, ok, _ in checks), checks


def neighbours_stage2(p, grid):
    """Configs exactly one ordered-parameter step away (entry is
    categorical, skipped — same rule as bt.neighbours)."""
    out = []
    for q in grid:
        diff = [k for k in p if p[k] != q[k]]
        if len(diff) != 1 or diff[0] == "entry":
            continue
        k = diff[0]
        vals = sorted({x[k] for x in grid if all(x[j] == p[j] for j in p if j != k)})
        if abs(vals.index(p[k]) - vals.index(q[k])) == 1:
            out.append(q)
    return out


# ── Stage 2 family ────────────────────────────────────────────────────────────
def accumulation_family(H, L, C, V, p, slots=SLOTS):
    """Wyckoff-style long family. Entry at close t -> fill open t+1.
    entry='sos': enter on a confirmed SOS close. entry='backup': enter on
    the first retest close after a confirmed SOS (low touches within 1% of
    the broken level, close holds above it), within 10 sessions of the SOS.
    Exit decided at close: close < SMA(exit_sma) or after MAX_HOLD sessions.
    """
    frames = acc.accumulation_frames(H, L, C, V, p["window"],
                                      p["vol_ratio"], p["range_max_pct"])
    syms = list(C.columns)
    Cu = C[syms]
    smaX = Cu.rolling(p["exit_sma"]).mean()
    prior_hi = H.shift(1).rolling(p["window"]).max()
    W = pd.DataFrame(0.0, index=C.index, columns=syms)
    open_pos = {}   # sym -> sessions held
    pending = {}    # sym -> (broken_level, sessions_remaining)
    idx = C.index
    for i, t in enumerate(idx):
        # exits (decided at this close)
        for s in list(open_pos):
            open_pos[s] += 1
            if Cu.at[t, s] < smaX.at[t, s] or open_pos[s] >= MAX_HOLD:
                del open_pos[s]
        # backup windows age out
        for s in list(pending):
            lvl, left = pending[s]
            if left <= 0:
                del pending[s]
            else:
                pending[s] = (lvl, left - 1)
        # entries
        free = slots - len(open_pos)
        if free > 0:
            cand = []
            for s in syms:
                if s in open_pos:
                    continue
                if p["entry"] == "sos":
                    if bool(frames["confirmed"].at[t, s]) and bool(frames["sos"].at[t, s]):
                        cand.append(s)
                else:  # backup
                    if bool(frames["confirmed"].at[t, s]) and bool(frames["sos"].at[t, s]):
                        pending[s] = (float(prior_hi.at[t, s]), 10)
                    if s in pending:
                        lvl, _ = pending[s]
                        if L.at[t, s] <= lvl * 1.01 and C.at[t, s] > lvl:
                            cand.append(s)
                            del pending[s]
            for s in cand[:free]:
                open_pos[s] = 0
        for s in open_pos:
            W.iat[i, W.columns.get_loc(s)] = 1.0 / slots
    return W


def evaluate_stage2(p, panels, start, end):
    W = accumulation_family(panels["High"], panels["Low"], panels["Close"],
                            panels["Volume"], p)
    net, to, held = bt.simulate(W, panels["Open"])
    net2, to2, held2 = bt.simulate(W, panels["Open"], cost_mult=2.0)
    m1 = bt.metrics(net, to, held, start, end)
    m2 = bt.metrics(net2, to2, held2, start, end)
    return m1, m2


def stage2(refresh=False):
    panels = acc.load_ohlcv(acc.MR_UNIV, start="2004-01-01", refresh=refresh)
    O = panels["Open"]
    spy_is = bt.benchmark(O, IS_START, IS_END)
    spy_val = bt.benchmark(O, VAL_START, VAL_END)
    print(f"SPY in-sample: {fmt(spy_is)}")
    print(f"SPY validation: {fmt(spy_val)}")
    is_res = []
    for p in STAGE2_GRID:
        m1, _ = evaluate_stage2(p, panels, IS_START, IS_END)
        is_res.append((p, m1))
        print(f"  IS {label(p)}: {fmt(m1)}")
    is_res.sort(key=lambda x: -x[1]["sharpe"])
    best_p, best_is = is_res[0]
    by_label = {label(p): m for p, m in is_res}
    nbs = [by_label[label(q)]["sharpe"]
           for q in neighbours_stage2(best_p, STAGE2_GRID)]
    nb_median = sorted(nbs)[len(nbs) // 2] if nbs else None
    m1, m2 = evaluate_stage2(best_p, panels, VAL_START, VAL_END)
    ok, checks = verdict(m1, m2, spy_val, nb_median, best_is["sharpe"])
    print(f"\nChosen: {label(best_p)}")
    print(f"Validation: {fmt(m1)}")
    print(f"Validation @2x costs: {fmt(m2)}")
    for n, c, v in checks:
        print(f"  {'PASS' if c else 'FAIL'} {n}: {v}")
    print(f"Verdict: {'PASS -> finalist (holdout NOT run here)' if ok else 'REJECTED'}")
    return {"best": best_p, "is": best_is, "val": m1, "val2x": m2,
            "checks": checks, "passed": ok, "nb_median": nb_median,
            "is_grid": [(label(p), m) for p, m in is_res]}


# ── Stage 1: ORB filter test ──────────────────────────────────────────────────
def stage1(book_path):
    rows = json.load(open(book_path))
    orb = [r for r in rows if r.get("strategy") == "ORB_MOMENTUM_001_V1"]
    tickers = sorted({r["ticker"] for r in orb})
    print(f"ORB trades: {len(orb)} ({sum(1 for r in orb if r.get('expired'))} closed, "
          f"{sum(1 for r in orb if not r.get('expired'))} open) · tickers: {len(tickers)}")
    panels = acc.load_ohlcv(tickers, start="2025-01-01")
    frames = acc.accumulation_frames(panels["High"], panels["Low"],
                                     panels["Close"], panels["Volume"],
                                     **CANONICAL)
    # Selectivity across the setup grid (counts only — no outcome splits,
    # so this cannot tune the filter on outcomes).
    print(f"\nCanonical filter {CANONICAL}:")
    for s in SETUP_GRID:
        f = acc.accumulation_frames(panels["High"], panels["Low"],
                                    panels["Close"], panels["Volume"], **s)
        n_conf = sum(1 for r in orb
                     if acc.confirmed_at(f, r["ticker"],
                                         pd.Timestamp(r["entry_time"]).date())[0])
        print(f"  setup {s}: {n_conf}/{len(orb)} ORB entries confirmed")

    def arm_stats(rs, key_pct, key_u):
        if not rs:
            return None
        wins_c = sum(1 for r in rs if r[key_pct] > 0)
        wins_u = sum(1 for r in rs if r[key_u] > 0)
        return {"n": len(rs),
                "win_contract": wins_c / len(rs),
                "avg_contract": float(np.mean([r[key_pct] for r in rs])),
                "win_underlying": wins_u / len(rs),
                "avg_underlying": float(np.mean([r[key_u] for r in rs]))}

    out = {"canonical": CANONICAL, "arms": {}}
    for group, rs in (("closed", [r for r in orb if r.get("expired")]),
                      ("open_interim", [r for r in orb if not r.get("expired")])):
        conf, unconf = [], []
        for r in rs:
            ok, score, checks = acc.confirmed_at(
                frames, r["ticker"], pd.Timestamp(r["entry_time"]).date())
            r2 = dict(r)
            r2["acc_confirmed"] = ok
            # direction-adjusted underlying outcome (puts: favorable = -pct)
            r2["fav_u"] = r["current_pct"] if r["direction"] != "P" else -r["current_pct"]
            (conf if ok else unconf).append(r2)
        out["arms"][group] = {
            "confirmed": arm_stats(conf, "contract_pct", "fav_u"),
            "unconfirmed": arm_stats(unconf, "contract_pct", "fav_u"),
            "all": arm_stats(rs, "contract_pct",
                             "current_pct"),  # raw underlying pct, unadjusted
        }
        print(f"\n{group.upper()} (n={len(rs)}):")
        for arm in ("confirmed", "unconfirmed"):
            st = out["arms"][group][arm]
            print(f"  {arm}: {st}" if st else f"  {arm}: none")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage1", action="store_true")
    ap.add_argument("--stage2", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--book", default="/home/hatch/workspace/trades-analysis/trades_kv.json")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    os.makedirs(RES, exist_ok=True)
    report = {"run_at": datetime.now().isoformat(), "grids": {
        "setup": SETUP_GRID, "canonical": CANONICAL,
        "stage2": STAGE2_GRID}}
    if a.stage1 or a.all:
        print("=== STAGE 1: ORB filter test ===")
        report["stage1"] = stage1(a.book)
    if a.stage2 or a.all:
        print("\n=== STAGE 2: standalone Wyckoff family ===")
        s2 = stage2(refresh=a.refresh)
        report["stage2"] = {"best": s2["best"], "passed": s2["passed"],
                            "val": {k: (float(v) if isinstance(v, float) else v)
                                    for k, v in s2["val"].items()},
                            "checks": s2["checks"],
                            "is_grid": [(l, {k: (float(v) if isinstance(v, float) else v)
                                              for k, v in m.items()})
                                        for l, m in s2["is_grid"]]}
        if not s2["passed"]:
            with open(os.path.join(RES, "accumulation_rejection_log.md"), "a") as fh:
                failed = [n for n, c, _ in s2["checks"] if not c]
                fh.write(f"- {datetime.now():%Y-%m-%d} **accumulation** `{label(s2['best'])}` "
                         f"— failed {', '.join(failed)} · validation {fmt(s2['val'])}\n")
    with open(os.path.join(RES, "accumulation_report.json"), "w") as fh:
        json.dump(report, fh, indent=2, default=str)
    print("\nWrote results/accumulation_report.json")


if __name__ == "__main__":
    main()
