"""Accumulation-confirmation checks for the backtest harness.

Mechanical, no-discretion definition of "buyers quietly loading up while price
stays flat". See tools/backtest/README.md for the protocol; this module does
NOT modify the harness — it only adds new checks and a standalone runner
(run_accumulation.py) that imports the harness engine (bt.simulate,
bt.metrics, bt.benchmark) without editing it.

DATA NOTE: bt.load_prices() caches Open/Close only — it drops Volume, and
accumulation checks 2 and 3 are volume checks. So this module loads its own
OHLCV panels through the SAME fetcher (yfinance, auto_adjust=True, same
symbols) with a Chrome-impersonating session (plain yfinance sessions are
rate-limited to 429 from this VM). Panels are cached under cache_accum/
(new directory, never bt's cache/). Bars are Yahoo dividend/split-adjusted,
identical in construction to the harness cache; only Volume is added.

Checks (per symbol, per day t; all computed from bars up to and including t,
never peeking at t+1):
  range_ok : the window's trading range is narrow — (rolling max High minus
             rolling min Low) / rolling mean Close <= range_max_pct.
             This is the "a range exists first" check.
  vol_ok   : up-day volume / down-day volume over the window >= vol_ratio.
             Up day = close > prior close; down day = close < prior close.
  obv_ok   : OBV[t] > OBV[t-window] AND price change over the window <= 2%
             (OBV rising while price is flat or down).
  spring   : today's low dips below the prior window's support (rolling min
             Low excluding today) and today's close is back above it
             (weak hands shaken out, close back inside).
  sos      : today's close breaks the prior window's resistance (rolling max
             High excluding today) on expanding volume: volume[t] >= 1.5x
             the window's mean volume (sign of strength).
  confirmed: (spring OR sos) AND at least 2 of {range_ok, vol_ok, obv_ok}.
             The event is mandatory — a quiet range with no trigger is not
             confirmation.
"""

import os

import numpy as np
import pandas as pd
import yfinance as yf
from curl_cffi import requests as creq

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_ACCUM = os.path.join(HERE, "cache_accum")

# Same ETF universe as the harness meanrev family (ETF-only, v1 scope).
MR_UNIV = ["SPY", "QQQ", "IWM", "DIA", "XLB", "XLE", "XLF", "XLI", "XLK",
           "XLP", "XLU", "XLV", "XLY"]


def chrome_session():
    """yfinance session that Yahoo does not 429 from this VM."""
    return creq.Session(impersonate="chrome")


def load_ohlcv(symbols, start="2004-01-01", refresh=False):
    """Adjusted daily OHLCV panels, cached as CSV per symbol under
    cache_accum/. Reindexed to SPY sessions like bt.load_prices()."""
    os.makedirs(CACHE_ACCUM, exist_ok=True)
    sess = chrome_session()
    panels = {k: {} for k in ("Open", "High", "Low", "Close", "Volume")}
    for sym in symbols:
        path = os.path.join(CACHE_ACCUM, sym.replace("^", "_") + ".csv")
        if refresh or not os.path.exists(path):
            df = yf.download(sym, start=start, auto_adjust=True,
                             progress=False, multi_level_index=False,
                             session=sess)
            if df.empty:
                raise RuntimeError(f"no data for {sym}")
            df[["Open", "High", "Low", "Close", "Volume"]].to_csv(path)
        df = pd.read_csv(path, index_col=0, parse_dates=True)
        for k in panels:
            panels[k][sym] = df[k]
    out = {k: pd.DataFrame(v).sort_index() for k, v in panels.items()}
    spy_days = out["Close"]["SPY"].dropna().index if "SPY" in out["Close"] else out["Close"].index
    return {k: v.reindex(spy_days) for k, v in out.items()}


def obv(close, volume):
    """On-balance volume: running sum of signed volume."""
    direction = np.sign(close.diff()).fillna(0.0)
    return (direction * volume.fillna(0.0)).cumsum()


def accumulation_frames(H, L, C, V, window, vol_ratio, range_max_pct):
    """Per-day boolean frames for every check, indexed like C, columns = syms.
    Returns dict of DataFrames: range_ok, vol_ok, obv_ok, spring, sos,
    confirmed, plus the integer score (0-4)."""
    up = (C.diff() > 0)
    dn = (C.diff() < 0)
    up_vol = V.where(up, 0.0).rolling(window).sum()
    dn_vol = V.where(dn, 0.0).rolling(window).sum()
    vol_ok = (up_vol / dn_vol.replace(0, np.nan)) >= vol_ratio

    roll_hi = H.rolling(window).max()
    roll_lo = L.rolling(window).min()
    roll_mean = C.rolling(window).mean()
    range_ok = ((roll_hi - roll_lo) / roll_mean) <= range_max_pct

    OBV = pd.DataFrame({s: obv(C[s], V[s]) for s in C.columns}, index=C.index)
    price_chg = C / C.shift(window) - 1
    obv_ok = (OBV > OBV.shift(window)) & (price_chg <= 0.02)

    # Prior-window support/resistance EXCLUDE today (no same-day peeking:
    # a spring/sos is judged against the range established before today).
    prior_hi = H.shift(1).rolling(window).max()
    prior_lo = L.shift(1).rolling(window).min()
    mean_vol = V.shift(1).rolling(window).mean()
    spring = (L < prior_lo) & (C > prior_lo)
    sos = (C > prior_hi) & (V >= 1.5 * mean_vol)

    setup = range_ok.astype(int) + vol_ok.astype(int) + obv_ok.astype(int)
    event = spring | sos
    confirmed = event & (setup >= 2)
    return {
        "range_ok": range_ok.fillna(False),
        "vol_ok": vol_ok.fillna(False),
        "obv_ok": obv_ok.fillna(False),
        "spring": spring.fillna(False),
        "sos": sos.fillna(False),
        "confirmed": confirmed.fillna(False),
        "score": (setup + event.astype(int)).fillna(0).astype(int),
    }


def confirmed_at(frames, symbol, date):
    """Was accumulation confirmed for `symbol` as of the last session on or
    before `date`? Returns (bool, score, which-checks dict) or (None,...) if
    no session exists yet. `date` is a Timestamp/date — callers pass the
    entry date and this function uses only bars strictly BEFORE it when
    asked (see run_accumulation Stage 1: prior close, no look-ahead)."""
    idx = frames["confirmed"].index
    prior = idx[idx < pd.Timestamp(date)]
    if len(prior) == 0 or symbol not in frames["confirmed"].columns:
        return None, None, {}
    t = prior[-1]
    return (
        bool(frames["confirmed"].at[t, symbol]),
        int(frames["score"].at[t, symbol]),
        {k: bool(frames[k].at[t, symbol]) for k in
         ("range_ok", "vol_ok", "obv_ok", "spring", "sos")},
    )
