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
    opens, closes = {}, {}
    for sym in ALL:
        path = os.path.join(CACHE, sym.replace("^", "_") + ".csv")
        if refresh or not os.path.exists(path):
            df = yf.download(sym, start=start, auto_adjust=True, progress=False, multi_level_index=False)
            if df.empty:
                raise RuntimeError(f"no data for {sym}")
            df[["Open", "High", "Low", "Close"]].to_csv(path)
        df = pd.read_csv(path, index_col=0, parse_dates=True)
        opens[sym], closes[sym] = df["Open"], df["Close"]
    O = pd.DataFrame(opens).sort_index()
    C = pd.DataFrame(closes).sort_index()
    spy_days = C["SPY"].dropna().index          # trade on US equity sessions only
    return O.reindex(spy_days), C.reindex(spy_days)


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
    raise ValueError(family)


def run_family(family, params, O, C):
    fn = momentum if family == "momentum" else meanrev
    return fn(O, C, **params)


def neighbours(family, p, all_params):
    """Grid configs exactly one parameter step away from p."""
    out = []
    for q in all_params:
        diff = [k for k in p if p[k] != q[k]]
        if len(diff) != 1:
            continue
        k = diff[0]
        if k in ("universe", "fear"):
            continue                                          # categorical, not a "step"
        vals = sorted({x[k] for x in all_params if all(x[j] == p[j] for j in p if j != k)})
        if abs(vals.index(p[k]) - vals.index(q[k])) == 1:
            out.append(q)
    return out
