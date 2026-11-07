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
    """Adjusted daily Open/Close panels, cached as CSV per symbol."""
    os.makedirs(CACHE, exist_ok=True)
    global H, L
    opens, closes, highs, lows = {}, {}, {}, {}
    for sym in ALL:
        path = os.path.join(CACHE, sym.replace("^", "_") + ".csv")
        if refresh or not os.path.exists(path):
            df = yf.download(sym, start=start, auto_adjust=True, progress=False, multi_level_index=False)
            if df.empty:
                raise RuntimeError(f"no data for {sym}")
            df[["Open", "High", "Low", "Close"]].to_csv(path)
        df = pd.read_csv(path, index_col=0, parse_dates=True)
        opens[sym], closes[sym], highs[sym], lows[sym] = df["Open"], df["Close"], df["High"], df["Low"]
    O = pd.DataFrame(opens).sort_index()
    C = pd.DataFrame(closes).sort_index()
    spy_days = C["SPY"].dropna().index          # trade on US equity sessions only
    H = pd.DataFrame(highs).sort_index().reindex(spy_days)   # module-level: only the bar-shape dips need them
    L = pd.DataFrame(lows).sort_index().reindex(spy_days)
    return O.reindex(spy_days), C.reindex(spy_days)


H = L = None


# ── Indicators ────────────────────────────────────────────────────────────────
def rsi(close, n):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


# ── Engine ────────────────────────────────────────────────────────────────────
def simulate(W, O, cost_mult=1.0):
    """W.loc[t] = target weights decided at the close of t, filled at the open
    of t+1. Returns daily net returns over open→open intervals, turnover, and
    the held-weights frame."""
    oo = (O.shift(-1) / O - 1).reindex(columns=W.columns).fillna(0.0)
    held = W.shift(1).fillna(0.0)
    gross = (held * oo).sum(axis=1)
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
    entries = int(((h > 0) & (h.shift(1).fillna(0) == 0)).sum().sum())
    return {
        "cagr": cagr, "sharpe": sharpe, "maxdd": dd, "exposure": h.sum(axis=1).mean(),
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


# ── Round 2 families (registered in README.md before results) ────────────────
INDICES = ["SPY", "QQQ", "IWM", "DIA"]
RISK = {"spy_efa": ["SPY", "EFA"], "broad": ["SPY", "QQQ", "IWM", "EFA", "EEM"]}


def ma(C, kind, n):
    return C.rolling(n).mean() if kind == "sma" else C.ewm(span=n, adjust=False).mean()


def _periodic(C, cols, start, step, pick):
    """Weights held between rebalances; pick(t) -> Series of weights on cols."""
    W = np.zeros((len(C.index), len(cols)))
    cur = np.zeros(len(cols))
    reb = C.index[start::step]
    rs = set(reb)
    for i, t in enumerate(C.index):
        if t in rs:
            cur = pick(t).reindex(cols).fillna(0.0).values
        W[i] = cur
    return pd.DataFrame(W, index=C.index, columns=cols), reb


def trend(O, C, ma_type, length, step, universe):
    syms = SECTORS if universe == "sectors" else MULTI
    on = C[syms] > ma(C[syms], ma_type, length)
    return _periodic(C, syms, length, step, lambda t: on.loc[t].astype(float) / len(syms))


def dualmom(O, C, lookback, risk, defensive):
    syms = RISK[risk] + ["IEF"]
    ret = C[syms] / C[syms].shift(lookback) - 1
    def pick(t):
        r = ret.loc[t, RISK[risk]].dropna()
        w = pd.Series(0.0, index=syms)
        if len(r) and r.max() > 0:
            w[r.idxmax()] = 1.0
        elif defensive == "IEF":
            w["IEF"] = 1.0
        return w
    return _periodic(C, syms, lookback, 20, pick)


def volmom(O, C, lookback, top_k):
    syms = MULTI
    ret = C[syms] / C[syms].shift(lookback) - 1
    vol = C[syms].pct_change().rolling(63).std()
    def pick(t):
        r, v = ret.loc[t], vol.loc[t]
        s = (r / v)[r > 0].dropna().nlargest(top_k)
        w = pd.Series(0.0, index=syms)
        w[s.index] = 1.0 / top_k
        return w
    return _periodic(C, syms, max(lookback, 63), 20, pick)


def lowvol(O, C, vol_win, top_k):
    syms = SECTORS
    vol = C[syms].pct_change().rolling(vol_win).std()
    up = C[syms] > C[syms].rolling(200).mean()
    def pick(t):
        s = vol.loc[t].dropna().nsmallest(top_k).index
        w = pd.Series(0.0, index=syms)
        w[s] = up.loc[t, s].astype(float) / top_k
        return w
    return _periodic(C, syms, 200, 20, pick)


def _dip(C, syms, entry, exit_):
    """One equal slot per symbol: enter at close when entry, exit at close when exit_ or MAX_HOLD."""
    E, X = entry[syms].fillna(False).values, exit_[syms].fillna(False).values
    W = np.zeros(E.shape)
    held = np.full(len(syms), -1)
    for i in range(len(C.index)):
        for j in range(len(syms)):
            if held[j] >= 0:
                held[j] += 1
                if X[i, j] or held[j] >= MAX_HOLD:
                    held[j] = -1
            elif E[i, j]:
                held[j] = 0
            if held[j] >= 0:
                W[i, j] = 1.0 / len(syms)
    return pd.DataFrame(W, index=C.index, columns=syms), None


def _trend_ok(C, syms, trend):
    return C[syms] > ma(C[syms], trend[:3], int(trend[3:]))


def dip_rsi(O, C, rsi_th, trend, universe):
    syms = ["SPY"] if universe == "SPY" else INDICES
    Cu = C[syms]
    return _dip(C, syms, (rsi(Cu, 2) < rsi_th) & _trend_ok(C, syms, trend), Cu > Cu.rolling(5).mean())


def dip_ibs(O, C, ibs_th, trend, universe):
    syms = ["SPY"] if universe == "SPY" else INDICES
    Cu, Hu, Lu = C[syms], H[syms], L[syms]
    ibs = (Cu - Lu) / (Hu - Lu).replace(0, np.nan)
    return _dip(C, syms, (ibs < ibs_th) & _trend_ok(C, syms, trend), Cu > Hu.shift(1))


def dip_down(O, C, n_down, trend, universe):
    syms = ["SPY"] if universe == "SPY" else INDICES
    Cu = C[syms]
    dn = (Cu < Cu.shift(1)).astype(int).rolling(n_down).sum() == n_down
    return _dip(C, syms, dn & _trend_ok(C, syms, trend), Cu > Cu.shift(1))


ROUND2 = {"trend": trend, "dualmom": dualmom, "volmom": volmom, "lowvol": lowvol,
          "dip_rsi": dip_rsi, "dip_ibs": dip_ibs, "dip_down": dip_down}


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
    if family == "trend":
        return [dict(ma_type=m, length=n, step=s, universe=u)
                for u in ("multi", "sectors") for m in ("sma", "ema") for n in (100, 200) for s in (5, 20)]
    if family == "dualmom":
        return [dict(lookback=lb, risk=r, defensive=d)
                for r in ("spy_efa", "broad") for d in ("IEF", "cash") for lb in (63, 126, 252)]
    if family == "volmom":
        return [dict(lookback=lb, top_k=k) for lb in (63, 126, 252) for k in (2, 3, 4)]
    if family == "lowvol":
        return [dict(vol_win=v, top_k=k) for v in (63, 126) for k in (3, 4, 5)]
    if family in ("dip_rsi", "dip_ibs", "dip_down"):
        key, vals = {"dip_rsi": ("rsi_th", (5, 10, 15)), "dip_ibs": ("ibs_th", (0.1, 0.2, 0.3)),
                     "dip_down": ("n_down", (2, 3, 4))}[family]
        return [{key: v, "trend": tr, "universe": u}
                for u in ("SPY", "indices") for tr in ("sma200", "ema200") for v in vals]
    raise ValueError(family)


def run_family(family, params, O, C):
    fn = ROUND2.get(family) or (momentum if family == "momentum" else meanrev)
    return fn(O, C, **params)


def neighbours(family, p, all_params):
    """Grid configs exactly one parameter step away from p."""
    out = []
    for q in all_params:
        diff = [k for k in p if p[k] != q[k]]
        if len(diff) != 1:
            continue
        k = diff[0]
        if isinstance(p[k], str) or p[k] is None:
            continue                                          # categorical, not a "step"
        vals = sorted({x[k] for x in all_params if all(x[j] == p[j] for j in p if j != k)})
        if abs(vals.index(p[k]) - vals.index(q[k])) == 1:
            out.append(q)
    return out
