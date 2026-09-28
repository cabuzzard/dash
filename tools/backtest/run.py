"""Runs the protocol in README.md. Writes results/REPORT.md, appends
results/rejection_log.md, and (with --holdout) results/holdout_log.md."""
import argparse
import json
import os
from datetime import datetime

import sys
import bt

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

IS_START, IS_END = "2005-01-01", "2016-12-31"
VAL_START, VAL_END = "2017-01-01", "2022-12-31"
HO_START = "2023-01-01"
FAMILIES = ["momentum", "meanrev", "meanrev_vix"]
RES = os.path.join(bt.HERE, "results")


def evaluate(family, p, O, C, start, end):
    W, reb_days = bt.run_family(family, p, O, C)
    net, to, held = bt.simulate(W, O)
    net2, to2, held2 = bt.simulate(W, O, cost_mult=2.0)
    nreb = None
    if reb_days is not None:
        nreb = int(((reb_days >= start) & (reb_days <= end)).sum())
    m1 = bt.metrics(net, to, held, start, end, rebalances=nreb)
    m2 = bt.metrics(net2, to2, held2, start, end, rebalances=nreb)
    return m1, m2


def verdict(m1, m2, spy, nb_median, is_sharpe):
    checks = [
        ("C1 Sharpe ≥ max(0.8, SPY)", m1["sharpe"] >= max(0.8, spy["sharpe"]),
         f'{m1["sharpe"]:.2f} vs {max(0.8, spy["sharpe"]):.2f}'),
        ("C2 MaxDD ≤ 25% and ≤ SPY", m1["maxdd"] >= -0.25 and m1["maxdd"] >= spy["maxdd"],
         f'{m1["maxdd"]:.1%} vs SPY {spy["maxdd"]:.1%}'),
        ("C3 2× costs: CAGR>0, Sharpe ≥ 0.6", m2["cagr"] > 0 and m2["sharpe"] >= 0.6,
         f'CAGR {m2["cagr"]:.1%}, Sharpe {m2["sharpe"]:.2f}'),
        ("C4 no year > 50% of profit", m1["top_year_share"] <= 0.5,
         f'{m1["top_year"]}: {m1["top_year_share"]:.0%}' if m1["top_year_share"] != float("inf") else "no net profit"),
        ("C5 neighbours ≥ 0.7× in-sample Sharpe", nb_median is not None and nb_median >= 0.7 * is_sharpe,
         f'median {nb_median:.2f} vs {0.7 * is_sharpe:.2f}' if nb_median is not None else "no neighbours"),
        ("C6 ≥ 30 rebalances/trades", m1["rebalances"] >= 30, str(m1["rebalances"])),
    ]
    return all(ok for _, ok, _ in checks), checks


def fmt(m):
    return (f'CAGR {m["cagr"]:.1%} · Sharpe {m["sharpe"]:.2f} · MaxDD {m["maxdd"]:.1%} · '
            f'exposure {m["exposure"]:.0%} · trades {m["entries"]}')


def label(p):
    return ", ".join(f"{k}={v}" for k, v in p.items())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--holdout", action="store_true")
    a = ap.parse_args()
    os.makedirs(RES, exist_ok=True)
    O, C = bt.load_prices(refresh=a.refresh)
    last = str(C.index[-1].date())

    if a.holdout:
        return run_holdout(O, C, last)

    spy_is, spy_val = bt.benchmark(O, IS_START, IS_END), bt.benchmark(O, VAL_START, VAL_END)
    out = [f"# Backtest report — {datetime.now():%Y-%m-%d %H:%M}", "",
           f"Data through {last}. In-sample {IS_START}→{IS_END}, validation {VAL_START}→{VAL_END}. "
           f"Holdout {HO_START}→ untouched by this run.", "",
           f"**SPY buy & hold** — in-sample: {fmt(spy_is)}  ", f"validation: {fmt(spy_val)}", ""]
    finalists, rejections = [], []

    for fam in FAMILIES:
        params = bt.grid(fam)
        is_res = []
        for p in params:
            m1, _ = evaluate(fam, p, O, C, IS_START, IS_END)
            is_res.append((p, m1))
        is_res.sort(key=lambda x: -x[1]["sharpe"])
        best_p, best_is = is_res[0]
        by_label = {label(p): m for p, m in is_res}
        nbs = [by_label[label(q)]["sharpe"] for q in bt.neighbours(fam, best_p, params)]
        nb_median = sorted(nbs)[len(nbs) // 2] if nbs else None

        m1, m2 = evaluate(fam, best_p, O, C, VAL_START, VAL_END)
        ok, checks = verdict(m1, m2, spy_val, nb_median, best_is["sharpe"])

        out += [f"## {fam}", "", "In-sample grid (sorted by Sharpe):", "",
                "| config | CAGR | Sharpe | MaxDD | trades |", "|---|---|---|---|---|"]
        out += [f'| {label(p)} | {m["cagr"]:.1%} | {m["sharpe"]:.2f} | {m["maxdd"]:.1%} | {m["entries"]} |' for p, m in is_res]
        out += ["", f"**Chosen:** `{label(best_p)}`  ", f"Validation: {fmt(m1)}  ", f"Validation @2× costs: {fmt(m2)}", "",
                "| criterion | pass | value |", "|---|---|---|"]
        out += [f"| {n} | {'✅' if c else '❌'} | {v} |" for n, c, v in checks]
        out += ["", f"**Verdict: {'PASS → finalist' if ok else 'REJECTED'}**", ""]
        if ok:
            finalists.append({"family": fam, "params": best_p})
        else:
            rejections.append((fam, best_p, [n for n, c, _ in checks if not c], m1))

    # meanrev_vix vs its no-fear control: same RSI rule, fear filter removed
    out += ["## Does the fear filter add value?", "",
            "Each fear-filtered config vs the identical rule with no VIX filter, validation period.", "",
            "| rule | fear filter | CAGR | Sharpe | MaxDD | trades |", "|---|---|---|---|---|---|"]
    for n, th in ((2, 5), (2, 10), (20, 35), (20, 40)):
        for f in (None, "spike", "level"):
            p = dict(rsi_n=n, rsi_th=th, exit_sma=5, slots=5, fear=f)
            m1, _ = evaluate("meanrev_vix", p, O, C, VAL_START, VAL_END)
            out.append(f'| RSI({n}) < {th} | {f or "none (control)"} | {m1["cagr"]:.1%} | {m1["sharpe"]:.2f} | {m1["maxdd"]:.1%} | {m1["entries"]} |')
    out.append("")

    with open(os.path.join(RES, "REPORT.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))
    with open(os.path.join(RES, "finalists.json"), "w", encoding="utf-8") as fh:
        json.dump(finalists, fh, indent=2)
    with open(os.path.join(RES, "rejection_log.md"), "a", encoding="utf-8") as fh:
        for fam, p, failed, m in rejections:
            fh.write(f"- {datetime.now():%Y-%m-%d} **{fam}** `{label(p)}` — failed {', '.join(failed)} · validation {fmt(m)}\n")
    print("\n".join(out))


def run_holdout(O, C, last):
    path = os.path.join(RES, "finalists.json")
    finalists = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
    if not finalists:
        print("No finalists — nothing passed validation, so the holdout stays untouched.")
        return
    log = os.path.join(RES, "holdout_log.md")
    seen = open(log, encoding="utf-8").read() if os.path.exists(log) else ""
    spy = bt.benchmark(O, HO_START, last)
    lines = [f"\n## {datetime.now():%Y-%m-%d %H:%M} — holdout {HO_START}→{last}", f"SPY: {fmt(spy)}"]
    for f in finalists:
        key = f'{f["family"]} `{label(f["params"])}`'
        warn = " ⚠ holdout ALREADY used for this config — result is no longer independent" if key in seen else ""
        m1, m2 = evaluate(f["family"], f["params"], O, C, HO_START, last)
        ok, checks = verdict(m1, m2, spy, float("inf"), 0)   # C5 is an in-sample check; not re-run here
        failed = [n for n, c, _ in checks if not c]
        lines.append(f"- {key}: {fmt(m1)} · 2× costs {fmt(m2)} · {'PASS' if ok else 'FAIL ' + ', '.join(failed)}{warn}")
    with open(log, "a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
