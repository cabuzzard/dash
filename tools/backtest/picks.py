"""Current picks from the two tested strategies, one table, Strategy column last.

    python tools/backtest/picks.py            # uses cached data, refreshes if stale
    python tools/backtest/picks.py --refresh  # force re-download

Signals use COMPLETED daily closes only (today's partial bar is dropped while
the US market is open) and are meant to be acted on at the next open — the
same fill assumption the backtest used.
"""
import argparse
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

import bt

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

MOM = dict(lookback=63, top_k=3, universe="multi")                 # best in-sample momentum config
DIP = dict(rsi_n=2, rsi_th=10, exit_sma=5, slots=5, fear="level")  # RSI(2)<10 + VIX>20
NAMES = {"mom": "ETF Momentum", "dip": "Fear Dip (RSI2<10 · VIX>20)"}


def completed(O, C):
    now = datetime.now(ZoneInfo("America/New_York"))
    if C.index[-1].date() == now.date() and now.hour < 16:
        return O.iloc[:-1], C.iloc[:-1]
    return O, C


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--days", type=int, default=90, help="history window for recent Fear Dip trades")
    a = ap.parse_args()
    O, C = bt.load_prices(refresh=a.refresh)
    if (datetime.now() - C.index[-1].to_pydatetime()).days > 3 and not a.refresh:
        O, C = bt.load_prices(refresh=True)
    O, C = completed(O, C)
    asof = C.index[-1].date()
    vix = C["^VIX"].iloc[-1]
    rows = []

    # ── ETF Momentum: current holdings + when they were picked / next re-pick ──
    W, reb_days = bt.momentum(O, C, **MOM)
    last_reb = reb_days[reb_days <= C.index[-1]][-1]
    pos_in = list(C.index).index(last_reb)
    next_reb = C.index[pos_in] + pd.tseries.offsets.BDay(20)
    score = C[bt.MULTI] / C[bt.MULTI].shift(MOM["lookback"]) - 1
    for sym, w in W.iloc[-1].items():
        if w > 0:
            entry = O[sym].shift(-1).loc[last_reb]            # filled at next open after the re-pick close
            rows.append({"Ticker": sym, "Action": "HOLD", "Weight": f"{w:.0%}",
                         "Since": str(last_reb.date()), "Entry": round(entry, 2),
                         "Last": round(C[sym].iloc[-1], 2), "P/L": f"{C[sym].iloc[-1] / entry - 1:+.1%}",
                         "Signal": f"3-mo return {score.at[last_reb, sym]:+.1%}",
                         "Exit": f"re-pick ~{next_reb.date()}", "Strategy": NAMES["mom"]})
    today_rank = score.iloc[-1].dropna().sort_values(ascending=False)
    top_now = [s for s in today_rank.index[:3] if today_rank[s] > 0]

    # ── Fear Dip: open positions, today's new entries, recent closed trades ──
    Wd, _ = bt.meanrev(O, C, **DIP)
    held = Wd > 0
    cutoff = C.index[-1] - pd.Timedelta(days=a.days)
    for sym in Wd.columns:
        s = held[sym]
        starts = s[(s) & (~s.shift(1, fill_value=False))].index
        for st in starts:
            if st < cutoff:
                continue
            after = s.loc[st:]
            ends = after[~after].index
            decided_exit = ends[0] if len(ends) else None
            sig_day = st                                          # decided at this close → fills next open
            i = list(C.index).index(sig_day)
            entry = O[sym].iloc[i + 1] if i + 1 < len(O) else None
            if decided_exit is None:
                last = C[sym].iloc[-1]
                is_new = sig_day == C.index[-1]
                rows.append({"Ticker": sym, "Action": "BUY at open" if is_new else "HOLD", "Weight": f"{1 / DIP['slots']:.0%}",
                             "Since": str(sig_day.date()), "Entry": round(entry, 2) if entry else "next open",
                             "Last": round(last, 2), "P/L": f"{last / entry - 1:+.1%}" if entry else "",
                             "Signal": f"RSI2 {bt.rsi(C[sym], 2).at[sig_day]:.1f} · VIX {C['^VIX'].at[sig_day]:.1f}",
                             "Exit": "close > SMA5 or 20 days", "Strategy": NAMES["dip"]})
            else:
                j = list(C.index).index(decided_exit)
                exit_px = O[sym].iloc[j] if j < len(O) else None
                rows.append({"Ticker": sym, "Action": "CLOSED", "Weight": "",
                             "Since": str(sig_day.date()), "Entry": round(entry, 2),
                             "Last": round(exit_px, 2), "P/L": f"{exit_px / entry - 1:+.1%}",
                             "Signal": f"RSI2 {bt.rsi(C[sym], 2).at[sig_day]:.1f} · VIX {C['^VIX'].at[sig_day]:.1f}",
                             "Exit": f"exited {C.index[j].date()}", "Strategy": NAMES["dip"]})

    # ── Watchlist: dip setups that would fire if VIX were > 20 ──
    R = bt.rsi(C[bt.MR_UNIV], 2).iloc[-1]
    above = C[bt.MR_UNIV].iloc[-1] > C[bt.MR_UNIV].rolling(200).mean().iloc[-1]
    watch = [f"{s} (RSI2 {R[s]:.1f})" for s in bt.MR_UNIV if above[s] and R[s] < DIP["rsi_th"]]

    order = {"BUY at open": 0, "HOLD": 1, "CLOSED": 2}
    rows.sort(key=lambda r: (order.get(r["Action"], 3), r["Strategy"], r["Since"]))
    df = pd.DataFrame(rows)
    print(f"Picks as of close {asof} · VIX {vix:.1f} ({'FEAR — dip entries allowed' if vix > 20 else 'calm — no new dip entries'})\n")
    print(df.to_markdown(index=False) if len(df) else "(no positions)")
    print(f"\nETF Momentum ranking today (top 3 if re-picked now): {', '.join(top_now) or 'cash'}")
    print(f"Dip setups waiting on VIX > 20: {', '.join(watch) or 'none'}")


if __name__ == "__main__":
    main()
