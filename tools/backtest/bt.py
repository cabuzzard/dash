"""Backtest engine + strategy families. See README.md for the protocol."""
import os
import numpy as np
import pandas as pd
import yfinance as yf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")

SECTORS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY", "XLRE", "XLC"]
MULTI   = ["SPY", "QQQ", "IWM", "EFA", "EEM", "TLT", "IEF", "GLD", "DBC", "VNQ"]
MR_UNIV = ["SPY", "QQQ", "IWM", "DIA", "XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
ALL = sorted(set(SECTORS + MULTI + MR_UNIV + ["^VIX"]))

COST_BPS = 5.0
MAX_HOLD = 20


# ── Data ──────────────────────────────────────────────────────────────────────
def load_prices(refresh=False, start="2004-01-01"):
    """Adjusted daily Open/High/Low/Close panels, cached as CSV per symbol."""
    os.makedirs(CACHE, exist_ok=True)
    opens, highs, lows, closes = {}, {}, {}, {}
    for sym in ALL:
        path = os.path.join(CACHE, sym.replace("^", "_") + ".csv")
        if refresh or not os.path.exists(path):
            df = yf.download(sym, start=start, auto_adjust=True, progress=False, multi_level_index=False)
            if df.empty:
                raise RuntimeError(f"no data for {sym}")
            df[["Open", "High", "Low", "Close"]].to_csv(path)
        df = pd.read_csv(path, index_col=0, parse_dates=True)
        opens[sym], highs[sym] = df["Open"], df["High"]
        lows[sym], closes[sym] = df["Low"], df["Close"]
    O = pd.DataFrame(opens).sort_index()
    H = pd.DataFrame(highs).sort_index()
    L = pd.DataFrame(lows).sort_index()
    C = pd.DataFrame(closes).sort_index()
    spy_days = C["SPY"].dropna().index          # trade on US equity sessions only
    return O.reindex(spy_days), H.reindex(spy_days), L.reindex(spy_days), C.reindex(spy_days)


# ── Indicators ────────────────────────────────────────────────────────────────
def rsi(close, n):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def _true_range(high, low, close):
    """Per-symbol true range (elementwise max; NaN-tolerant on row 0)."""
    prev = close.shift(1)
    a = (high - low).abs().values
    b = (high - prev).abs().values
    c = (low - prev).abs().values
    tr = np.fmax(np.fmax(a, b), c)
    return pd.DataFrame(tr, index=high.index, columns=high.columns)


def atr(high, low, close, n=14):
    """Wilder-smoothed average true range (same ewm convention as rsi)."""
    return _true_range(high, low, close).ewm(alpha=1 / n, adjust=False).mean()


def adx(high, low, close, n=14):
    """Wilder ADX: trend strength 0-100. Low ADX = ranging market."""
    tr = _true_range(high, low, close)
    up = high - high.shift(1)
    dn = low.shift(1) - low
    plus_dm = up.where((up > dn) & (up > 0), 0.0)
    minus_dm = dn.where((dn > up) & (dn > 0), 0.0)
    atr_s = tr.ewm(alpha=1 / n, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / n, adjust=False).mean() / atr_s
    minus_di = 100 * minus_dm.ewm(alpha=1 / n, adjust=False).mean() / atr_s
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return dx.ewm(alpha=1 / n, adjust=False).mean()


# ── Engine ────────────────────────────────────────────────────────────────────
def simulate(W, O, cost_mult=1.0, entry_px=None):
    """W.loc[t] = target weights decided at the close of t, filled at the open
    of t+1. Returns daily net returns over open→open intervals, turnover, and
    the held-weights frame.

    entry_px (optional, same shape as W): fill price for positions that were
    NOT filled at the open — the rangefade limit variant, where a position
    decided at close t is filled during day t+1 at the level itself. For such
    a position, W first turns nonzero at row t+1 and entry_px[t+1] is the
    level; its first interval [fill, open t+2] is O[t+2]/level - 1, booked at
    row t+2 (the first held row) alongside the standard open→open interval.
    The interval itself is exact; only its booking row is one day late, which
    is immaterial to daily metrics. With entry_px=None (all other families)
    behaviour is identical to before."""
    oo = (O.shift(-1) / O - 1).reindex(columns=W.columns).fillna(0.0)
    held = W.shift(1).fillna(0.0)
    gross = (held * oo).sum(axis=1)
    if entry_px is not None:
        px = entry_px.reindex(columns=W.columns)
        new = (held != 0) & (held.shift(1).fillna(0) == 0)
        stub = (held * (O / px.shift(1) - 1)).where(new & px.shift(1).notna(), 0.0).sum(axis=1)
        gross = gross + stub.fillna(0.0)
    turnover = held.diff().abs().sum(axis=1).fillna(held.abs().sum(axis=1))
    net = gross - turnover * COST_BPS / 1e4 * cost_mult
    return net, turnover, held


def metrics(net, turnover, held, start, end, rebalances=None):
    r = net.loc[start:end]
    if len(r) < 20:
        return None
    eq = (1 + r).cumprod()
    yrs = len(r) / 252
    cagr = eq.iloc[-1] ** (1 / yrs) - 1
    sd = r.std()
    sharpe = r.mean() / sd * np.sqrt(252) if sd > 0 else 0.0
    dd = (eq / eq.cummax() - 1).min()
    by_year = r.groupby(r.index.year).sum()
    top_year_share = (by_year.max() / by_year.sum()) if by_year.sum() > 0 else float("inf")
    h = held.loc[start:end]
    # entries in either direction (long-only families are unaffected: h >= 0)
    entries = int((((h != 0) & (h.shift(1).fillna(0) == 0)).sum().sum()))
    return {
        "cagr": cagr, "sharpe": sharpe, "maxdd": dd, "exposure": h.abs().sum(axis=1).mean(),
        "turnover_yr": turnover.loc[start:end].sum() / yrs, "entries": entries,
        "rebalances": rebalances if rebalances is not None else entries,
        "top_year_share": top_year_share, "top_year": int(by_year.idxmax()) if len(by_year) else None,
    }


def benchmark(O, start, end):
    W = pd.DataFrame({"SPY": 1.0}, index=O.index)
    net, to, held = simulate(W, O[["SPY"]], cost_mult=0)
    return metrics(net, to, held, start, end, rebalances=1)


# ── Strategy families ─────────────────────────────────────────────────────────
def momentum(O, C, lookback, top_k, universe, step=20):
    syms = SECTORS if universe == "sectors" else MULTI
    Cu = C[syms]
    score = Cu / Cu.shift(lookback) - 1
    W = pd.DataFrame(0.0, index=C.index, columns=syms)
    reb_days = C.index[lookback::step]
    cur = pd.Series(0.0, index=syms)
    reb = set(reb_days)
    for t in C.index:
        if t in reb:
            s = score.loc[t].dropna()
            s = s[s > 0].nlargest(top_k)                # absolute-momentum filter
            cur = pd.Series(0.0, index=syms)
            if len(s):
                cur[s.index] = 1.0 / top_k             # unfilled slots stay in cash
        W.loc[t] = cur
    return W, reb_days


def meanrev(O, C, rsi_n, rsi_th, exit_sma, slots, fear=None):
    """Long-only dip buying. Entry at close t → fill open t+1. Exit decided at
    close when close > SMA(exit_sma) or after MAX_HOLD sessions."""
    syms = MR_UNIV
    Cu = C[syms]
    R = rsi(Cu, rsi_n)
    sma200 = Cu.rolling(200).mean()
    smaX = Cu.rolling(exit_sma).mean()
    vix = C["^VIX"]
    if fear == "spike":
        fear_ok = vix >= 1.10 * vix.rolling(20).mean()
    elif fear == "level":
        fear_ok = vix > 20
    else:
        fear_ok = pd.Series(True, index=C.index)
    W = pd.DataFrame(0.0, index=C.index, columns=syms)
    open_pos = {}                                         # sym -> sessions held
    idx = C.index
    for i, t in enumerate(idx):
        # exits (decided at this close)
        for s in list(open_pos):
            open_pos[s] += 1
            if Cu.at[t, s] > smaX.at[t, s] or open_pos[s] >= MAX_HOLD:
                del open_pos[s]
        # entries
        free = slots - len(open_pos)
        if free > 0 and bool(fear_ok.iloc[i]):
            cand = []
            for s in syms:
                if s in open_pos:
                    continue
                c, r, m = Cu.at[t, s], R.at[t, s], sma200.at[t, s]
                if pd.notna(c) and pd.notna(r) and pd.notna(m) and c > m and r < rsi_th:
                    cand.append((r, s))
            for _, s in sorted(cand)[:free]:
                open_pos[s] = 0
        for s in open_pos:
            W.iat[i, W.columns.get_loc(s)] = 1.0 / slots
    return W, None


def rangefade(O, C, H, L, window, atr_buffer, regime, target, entry, slots=5):
    """Range fade / range trading (long support, short resistance).

    Levels (mechanical, no eyeballing): support = lowest Low of the prior
    `window` days, resistance = highest High of the prior `window` days.
    A touch counts when the day's extreme reaches within BAND (1%) of the
    level. Two entry styles, same everything else (apples-to-apples):
      - "rejection": touch the level AND close back inside the range
        (support < close < resistance) on day t -> fill at open t+1.
      - "limit": at close t, place a buy limit at support / sell limit at
        resistance (price must be inside the range, regime filter must pass);
        if day t+1 touches the level the position opens at the level price
        (see simulate's entry_px stub). Unfilled orders expire daily.
    Stop (frozen at entry): beyond the level by atr_buffer x ATR(14).
    Target (frozen at entry): "opposite" = the other edge of the range, or
    "2R" = 2x the entry-to-stop risk measured off the decision close.
    Regime filter (non-negotiable, evaluated at the decision close):
      - "adx25": ADX(14) < 25 (ranging, not trending).
      - "held2": the level held >= 2 times in the prior `window` days
        (a held touch = reached the level's band and closed back inside).
    Exits (decided at closes): close beyond stop or target, or MAX_HOLD
    sessions. One open position per symbol; long wins a same-day double
    signal. Shorts use the engine's linear return approximation
    (held x open-to-open return); costs apply identically both ways.
    Returns (W, E): E holds the limit fill price on the fill row, NaN
    elsewhere (rejection entries fill at the open, so E stays NaN)."""
    syms = MR_UNIV
    Cu, Hu, Lu = C[syms], H[syms], L[syms]
    sup = Lu.rolling(window).min().shift(1)
    res = Hu.rolling(window).max().shift(1)
    A = atr(Hu, Lu, Cu)
    X = adx(Hu, Lu, Cu)
    BAND = 0.01
    held_long = (Lu <= sup * (1 + BAND)) & (Cu > sup) & (Cu < res)
    held_short = (Hu >= res * (1 - BAND)) & (Cu < res) & (Cu > sup)
    held_long_n = held_long.rolling(window).sum().shift(1)
    held_short_n = held_short.rolling(window).sum().shift(1)
    W = pd.DataFrame(0.0, index=C.index, columns=syms)
    E = pd.DataFrame(np.nan, index=C.index, columns=syms)
    open_pos = {}   # sym -> dict(side, stop, tgt, held_n)
    pending = {}    # sym -> dict(side, level, stop, tgt) for limit orders
    idx = C.index

    def make_order(side, level, atr_v, close_v, sup_v, res_v):
        if side == "long":
            stop = level - atr_buffer * atr_v
            tgt = res_v if target == "opposite" else close_v + 2 * (close_v - stop)
        else:
            stop = level + atr_buffer * atr_v
            tgt = sup_v if target == "opposite" else close_v - 2 * (stop - close_v)
        return stop, tgt

    def regime_ok(side, t, s):
        if regime == "adx25":
            return bool(X.at[t, s] < 25)
        n = held_long_n.at[t, s] if side == "long" else held_short_n.at[t, s]
        return bool(n >= 2)

    for i, t in enumerate(idx):
        # 1) exits for pre-existing positions (decided at this close)
        for s in list(open_pos):
            o = open_pos[s]
            o["held_n"] += 1
            c = Cu.at[t, s]
            hit = (c <= o["stop"] or c >= o["tgt"]) if o["side"] == "long" \
                else (c >= o["stop"] or c <= o["tgt"])
            if hit or o["held_n"] >= MAX_HOLD:
                del open_pos[s]
        # 2) limit fills confirmed at this close (touch during day t);
        #    not exit-checked until the next close (same as entries below)
        if entry == "limit":
            for s in list(pending):
                o = pending[s]
                touched = (Lu.at[t, s] <= o["level"]) if o["side"] == "long" \
                    else (Hu.at[t, s] >= o["level"])
                if touched and len(open_pos) < slots and s not in open_pos:
                    open_pos[s] = dict(o, held_n=0)
                    E.iat[i, E.columns.get_loc(s)] = o["level"]
            pending = {}
        # 3) entries / placements
        free = slots - len(open_pos)
        if free > 0 and entry == "rejection":
            cands = []
            for s in syms:
                if s in open_pos:
                    continue
                c, lo, hi = Cu.at[t, s], Lu.at[t, s], Hu.at[t, s]
                sv, rv, av = sup.at[t, s], res.at[t, s], A.at[t, s]
                if pd.isna(sv) or pd.isna(rv) or pd.isna(av):
                    continue
                if lo <= sv * (1 + BAND) and sv < c < rv and regime_ok("long", t, s):
                    cands.append(("long", s, sv, av, c, sv, rv))
                if hi >= rv * (1 - BAND) and sv < c < rv and regime_ok("short", t, s):
                    cands.append(("short", s, rv, av, c, sv, rv))
            seen = set()
            for side, s, lv, av, c, sv, rv in cands:
                if s in seen:
                    continue
                seen.add(s)
                if len(open_pos) >= slots:
                    break
                stop, tgt = make_order(side, lv, av, c, sv, rv)
                open_pos[s] = dict(side=side, stop=stop, tgt=tgt, held_n=0)
        elif entry == "limit":
            for s in syms:
                if s in open_pos or s in pending:
                    continue
                c = Cu.at[t, s]
                sv, rv, av = sup.at[t, s], res.at[t, s], A.at[t, s]
                if pd.isna(sv) or pd.isna(rv) or pd.isna(av):
                    continue
                if not (sv < c < rv):
                    continue                      # must be inside the range
                if regime_ok("long", t, s):
                    stop, tgt = make_order("long", sv, av, c, sv, rv)
                    pending[s] = dict(side="long", level=sv, stop=stop, tgt=tgt)
                elif regime_ok("short", t, s):
                    stop, tgt = make_order("short", rv, av, c, sv, rv)
                    pending[s] = dict(side="short", level=rv, stop=stop, tgt=tgt)
        for s, o in open_pos.items():
            W.iat[i, W.columns.get_loc(s)] = (1.0 / slots) * (1 if o["side"] == "long" else -1)
    return W, E


def grid(family):
    if family == "momentum":
        return [dict(lookback=lb, top_k=k, universe=u)
                for u in ("sectors", "multi") for lb in (63, 126, 252) for k in (2, 3, 4)]
    if family == "meanrev":
        return [dict(rsi_n=2, rsi_th=th, exit_sma=x, slots=sl)
                for th in (5, 10, 15) for x in (5, 10) for sl in (3, 5)]
    if family == "meanrev_vix":
        return [dict(rsi_n=n, rsi_th=th, exit_sma=5, slots=5, fear=f)
                for (n, th) in ((2, 5), (2, 10), (20, 35), (20, 40)) for f in ("spike", "level")]
    if family == "rangefade":
        # FIXED 2026-10-25, before any results: 2 x 3 x 2 x 2 x 2 = 48 configs.
        # Slots fixed at 5 (not gridded); ADX period 14, threshold 25; band 1%.
        return [dict(window=w, atr_buffer=b, regime=r, target=t, entry=e)
                for w in (20, 60) for b in (0.5, 1.0, 2.0)
                for r in ("adx25", "held2") for t in ("opposite", "2R")
                for e in ("rejection", "limit")]
    raise ValueError(family)


def run_family(family, params, O, C, H=None, L=None):
    """Returns (W, reb_days, E). E is the limit-fill price frame (rangefade
    only); None for all other families (open fills, unchanged behaviour)."""
    if family == "rangefade":
        W, E = rangefade(O, C, H, L, **params)
        return W, None, E
    fn = momentum if family == "momentum" else meanrev
    W, reb = fn(O, C, **params)
    return W, reb, None


def neighbours(family, p, all_params):
    """Grid configs exactly one parameter step away from p."""
    out = []
    for q in all_params:
        diff = [k for k in p if p[k] != q[k]]
        if len(diff) != 1:
            continue
        k = diff[0]
        if k in ("universe", "fear", "regime", "target", "entry"):
            continue                                          # categorical, not a "step"
        vals = sorted({x[k] for x in all_params if all(x[j] == p[j] for j in p if j != k)})
        if abs(vals.index(p[k]) - vals.index(q[k])) == 1:
            out.append(q)
    return out
