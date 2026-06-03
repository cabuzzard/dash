"""
tas_poller.py
Tracks underlying price and contract price for open options trades.
Runs every 30 min during market hours, updates max high/low, marks expired on expiry date.

Usage:
    pip install yfinance requests
    python tas_poller.py
"""

import time
import requests
import yfinance as yf
from datetime import datetime, timezone, date

WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
WORKER_PIN  = "1246"
POLL_SECS   = 30 * 60   # 30 minutes

# ── Auth ──────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(WORKER_URL, json={"action": "auth", "pin": WORKER_PIN}, timeout=10, proxies={})
    r.raise_for_status()
    return r.json()["token"]

def worker_call(token, action, **kwargs):
    r = requests.post(WORKER_URL, json={"action": action, "token": token, **kwargs}, timeout=15, proxies={})
    r.raise_for_status()
    return r.json()

# ── Underlying price ───────────────────────────────────────────────────
def get_price_data(ticker: str) -> dict | None:
    try:
        t    = yf.Ticker(ticker)
        hist = t.history(period="1d", interval="1m")
        if hist.empty:
            print(f"  [price] {ticker}: no history data")
            return None

        current = round(float(hist["Close"].iloc[-1]), 2)
        high_v  = round(float(hist["High"].max()), 2)
        low_v   = round(float(hist["Low"].min()), 2)
        high_t  = hist["High"].idxmax().isoformat()
        low_t   = hist["Low"].idxmin().isoformat()

        return {
            "current":    current,
            "high":       high_v,
            "high_time":  high_t,
            "low":        low_v,
            "low_time":   low_t,
        }
    except Exception as e:
        print(f"  [price error] {ticker}: {e}")
        return None

# ── Contract price ─────────────────────────────────────────────────────
def get_contract_price(ticker: str, expiry_yyyymmdd: str, strike: float, direction: str) -> float | None:
    try:
        d          = date(int(expiry_yyyymmdd[:4]), int(expiry_yyyymmdd[4:6]), int(expiry_yyyymmdd[6:8]))
        expiry_str = d.strftime("%Y-%m-%d")
        t          = yf.Ticker(ticker)

        # Check expiry is in the available list
        available = t.options
        if expiry_str not in available:
            # Find nearest available expiry
            nearest = min(available, key=lambda e: abs((date.fromisoformat(e) - d).days), default=None)
            if nearest is None:
                print(f"  [contract] {ticker}: no options available")
                return None
            print(f"  [contract] {ticker}: expiry {expiry_str} not found, using nearest {nearest}")
            expiry_str = nearest

        chain     = t.option_chain(expiry_str)
        contracts = chain.calls if direction == "C" else chain.puts

        if contracts.empty:
            print(f"  [contract] {ticker}: no {'calls' if direction=='C' else 'puts'} for {expiry_str}")
            return None

        # Find closest strike
        idx   = (contracts["strike"] - strike).abs().idxmin()
        row   = contracts.loc[idx]
        matched = float(row["strike"])
        print(f"  [contract] {ticker}: matched strike {matched} (wanted {strike})")

        last = float(row.get("lastPrice", 0) or 0)
        bid  = float(row.get("bid", 0) or 0)
        ask  = float(row.get("ask", 0) or 0)

        if last > 0:
            return round(last, 2)
        if bid > 0 and ask > 0:
            return round((bid + ask) / 2, 2)

        print(f"  [contract] {ticker}: no price data (last={last} bid={bid} ask={ask})")
        return None
    except Exception as e:
        print(f"  [contract error] {ticker}: {e}")
        return None

# ── Process one trade ─────────────────────────────────────────────────
def process_trade(token, trade):
    tid       = trade["id"]
    ticker    = trade["ticker"]
    strike    = trade["strike"]
    expiry    = trade["expiry"]  # YYYYMMDD
    direction = trade.get("direction", "C")
    now       = datetime.now(timezone.utc).isoformat()

    # Check if expired
    expiry_date = date(int(expiry[:4]), int(expiry[4:6]), int(expiry[6:8]))
    is_expired  = date.today() >= expiry_date

    price_data = get_price_data(ticker)
    if price_data is None:
        print(f"  ✗ {ticker}: no price data")
        return

    current = price_data["current"]
    patch   = {"current_price": current, "last_updated": now}

    contract = get_contract_price(ticker, expiry, strike, direction)
    if contract is not None:
        patch["current_contract"] = contract

    # First capture — set entry price and entry contract
    if not trade.get("price_captured"):
        patch["entry_price"]    = current
        patch["price_captured"] = True
        patch["max_high"]       = current
        patch["max_high_time"]  = now
        patch["max_low"]        = current
        patch["max_low_time"]   = now
        if contract is not None and not trade.get("contract_captured"):
            patch["entry_contract"]         = contract
            patch["contract_captured"]      = True
            patch["contract_max_high"]      = contract
            patch["contract_max_high_time"] = now
            patch["contract_max_low"]       = contract
            patch["contract_max_low_time"]  = now
        print(f"  ✓ {ticker}: entry captured — underlying ${current}, contract ${contract}")
    else:
        entry = trade.get("entry_price", current)
        patch["current_pct"] = round((current - entry) / entry * 100, 2)

        # Running max/min — underlying
        if trade.get("max_high") is None or current > trade["max_high"]:
            patch["max_high"]      = current
            patch["max_high_time"] = now
            print(f"  ↑ {ticker}: new max high ${current}")
        if trade.get("max_low") is None or current < trade["max_low"]:
            patch["max_low"]      = current
            patch["max_low_time"] = now
            print(f"  ↓ {ticker}: new max low ${current}")

        # Contract tracking
        if contract is not None:
            if not trade.get("contract_captured"):
                patch["entry_contract"]         = contract
                patch["contract_captured"]      = True
                patch["contract_max_high"]      = contract
                patch["contract_max_high_time"] = now
                patch["contract_max_low"]       = contract
                patch["contract_max_low_time"]  = now
            else:
                entry_c = trade.get("entry_contract", contract)
                patch["contract_pct"] = round((contract - entry_c) / entry_c * 100, 2)
                if trade.get("contract_max_high") is None or contract > trade["contract_max_high"]:
                    patch["contract_max_high"]      = contract
                    patch["contract_max_high_time"] = now
                    print(f"  ↑ {ticker}: new contract max high ${contract}")
                if trade.get("contract_max_low") is None or contract < trade["contract_max_low"]:
                    patch["contract_max_low"]      = contract
                    patch["contract_max_low_time"] = now
                    print(f"  ↓ {ticker}: new contract max low ${contract}")

        # Strike reached?
        if not trade.get("strike_reached"):
            if (direction == "C" and current >= strike) or (direction == "P" and current <= strike):
                patch["strike_reached"]      = True
                patch["strike_reached_time"] = now
                print(f"  ★ {ticker}: STRIKE {strike} REACHED at ${current}!")

        # Status log
        max_h = trade.get("max_high", current)
        max_l = trade.get("max_low", current)
        pct   = patch.get("current_pct", 0)
        c_pct = patch.get("contract_pct", trade.get("contract_pct", 0)) or 0
        c_str = f"  contract=${contract} ({c_pct:+.1f}%)" if contract else "  contract=—"
        print(f"  {ticker}: ${current} ({pct:+.1f}%)  HOD=${max_h}  LOD=${max_l}  Strike={strike}{c_str}")

    if is_expired:
        patch["expired"] = True
        print(f"  ✓ {ticker}: contract expired {expiry_date}")

    worker_call(token, "updateTrade", id=tid, **patch)

# ── Main loop ─────────────────────────────────────────────────────────
def main():
    print("Trades Poller starting")
    print(f"Worker: {WORKER_URL}")
    print(f"Poll interval: {POLL_SECS//60} minutes\n")

    token = None

    while True:
        try:
            if token is None:
                print("Authenticating…")
                token = get_token()
                print("Auth OK\n")

            data   = worker_call(token, "getActiveTrades")
            trades = data.get("trades", [])

            if trades:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Updating {len(trades)} active trade(s)")
                for trade in trades:
                    process_trade(token, trade)
                print()
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] No active trades")

        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                print("Token expired — re-authenticating")
                token = None
            else:
                print(f"HTTP error: {e}")
        except Exception as e:
            print(f"Error: {e}")

        time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()
