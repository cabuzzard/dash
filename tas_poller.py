"""
tas_poller.py
Tracks underlying price for open options trades.
Runs every 30 min during market hours, updates max high/low, marks expired on expiry date.

Usage:
    pip install yfinance requests
    python tas_poller.py
"""

import time
import requests
from datetime import datetime, timezone, date, timedelta
import calendar

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

# ── Price fetch ───────────────────────────────────────────────────────
def get_price_data(ticker: str) -> dict | None:
    try:
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
            "?interval=1m&range=1d"
        )
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=15, proxies={})
        r.raise_for_status()
        result = r.json()["chart"]["result"][0]
        closes = result["indicators"]["quote"][0]["close"]
        highs  = result["indicators"]["quote"][0]["high"]
        lows   = result["indicators"]["quote"][0]["low"]
        timestamps = result["timestamp"]

        # filter None values
        valid_closes = [(t, c) for t, c in zip(timestamps, closes) if c is not None]
        valid_highs  = [(t, h) for t, h in zip(timestamps, highs)  if h is not None]
        valid_lows   = [(t, l) for t, l in zip(timestamps, lows)   if l is not None]

        if not valid_closes:
            return None

        current   = round(valid_closes[-1][1], 2)
        high_t, high_v = max(valid_highs, key=lambda x: x[1])
        low_t,  low_v  = min(valid_lows,  key=lambda x: x[1])

        from datetime import timezone
        high_time = datetime.fromtimestamp(high_t, tz=timezone.utc).isoformat()
        low_time  = datetime.fromtimestamp(low_t,  tz=timezone.utc).isoformat()

        return {
            "current":    round(current, 2),
            "high":       round(high_v, 2),
            "high_time":  high_time,
            "low":        round(low_v, 2),
            "low_time":   low_time,
        }
    except Exception as e:
        print(f"  [price error] {ticker}: {e}")
        return None

# ── Contract price fetch ──────────────────────────────────────────────
def get_contract_price(ticker: str, expiry_yyyymmdd: str, strike: float, direction: str) -> float | None:
    """Fetch the last traded price for a specific options contract via Yahoo Finance."""
    try:
        # Convert YYYYMMDD → Unix timestamp of that date at midnight UTC
        d = date(int(expiry_yyyymmdd[:4]), int(expiry_yyyymmdd[4:6]), int(expiry_yyyymmdd[6:8]))
        ts = calendar.timegm(d.timetuple())
        url = f"https://query1.finance.yahoo.com/v7/finance/options/{ticker}?date={ts}"
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=15, proxies={})
        r.raise_for_status()
        result = r.json().get("optionChain", {}).get("result", [])
        if not result:
            return None
        chain_key = "calls" if direction == "C" else "puts"
        contracts = result[0].get("options", [{}])[0].get(chain_key, [])
        # Find closest strike match
        match = min(contracts, key=lambda c: abs(c.get("strike", 0) - strike), default=None)
        if match is None:
            return None
        # Prefer lastPrice; fall back to bid/ask midpoint
        last = match.get("lastPrice")
        bid  = match.get("bid", 0) or 0
        ask  = match.get("ask", 0) or 0
        if last and last > 0:
            return round(last, 2)
        if bid > 0 and ask > 0:
            return round((bid + ask) / 2, 2)
        return None
    except Exception as e:
        print(f"  [contract error] {ticker}: {e}")
        return None

# ── Process one trade ─────────────────────────────────────────────────
def process_trade(token, trade):
    tid    = trade["id"]
    ticker = trade["ticker"]
    strike = trade["strike"]
    expiry = trade["expiry"]  # YYYYMMDD
    now    = datetime.now(timezone.utc).isoformat()

    # Check if expired
    expiry_date = date(int(expiry[:4]), int(expiry[4:6]), int(expiry[6:8]))
    today       = date.today()
    is_expired  = today >= expiry_date

    price_data = get_price_data(ticker)
    if price_data is None:
        print(f"  ✗ {ticker}: no data")
        return

    current    = price_data["current"]
    patch      = {"current_price": current, "last_updated": now}

    # Contract price
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
            patch["entry_contract"]       = contract
            patch["contract_captured"]    = True
            patch["contract_max_high"]    = contract
            patch["contract_max_high_time"] = now
            patch["contract_max_low"]     = contract
            patch["contract_max_low_time"]  = now
        print(f"  ✓ {ticker}: entry captured — underlying ${current}, contract ${contract}")
    else:
        entry = trade.get("entry_price", current)
        patch["current_pct"] = round((current - entry) / entry * 100, 2)

        # Update running max high (underlying)
        if trade.get("max_high") is None or current > trade["max_high"]:
            patch["max_high"]      = current
            patch["max_high_time"] = now
            print(f"  ↑ {ticker}: new max high ${current}")

        # Update running max low (underlying)
        if trade.get("max_low") is None or current < trade["max_low"]:
            patch["max_low"]      = current
            patch["max_low_time"] = now
            print(f"  ↓ {ticker}: new max low ${current}")

        # Contract tracking
        if contract is not None:
            # First contract capture after entry (in case entry_contract missed on first poll)
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

        # Check if strike was reached (for calls: price >= strike, puts: price <= strike)
        if not trade.get("strike_reached"):
            if (direction == "C" and current >= strike) or (direction == "P" and current <= strike):
                patch["strike_reached"]      = True
                patch["strike_reached_time"] = now
                print(f"  ★ {ticker}: STRIKE {strike} REACHED at ${current}!")

        # Log current status
        max_h  = trade.get("max_high", current)
        max_l  = trade.get("max_low", current)
        pct    = patch.get("current_pct", 0)
        c_pct  = patch.get("contract_pct", trade.get("contract_pct", 0)) or 0
        c_str  = f"  contract=${contract} ({c_pct:+.1f}%)" if contract else ""
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
