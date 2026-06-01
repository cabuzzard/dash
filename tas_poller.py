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
import yfinance as yf
from datetime import datetime, timezone, date

WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
WORKER_PIN  = "1246"
POLL_SECS   = 30 * 60   # 30 minutes

# ── Auth ──────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(WORKER_URL, json={"action": "auth", "pin": WORKER_PIN}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]

def worker_call(token, action, **kwargs):
    r = requests.post(WORKER_URL, json={"action": action, "token": token, **kwargs}, timeout=15)
    r.raise_for_status()
    return r.json()

# ── Price fetch ───────────────────────────────────────────────────────
def get_price_data(ticker: str) -> dict | None:
    try:
        t    = yf.Ticker(ticker)
        hist = t.history(period="1d", interval="1m")
        if hist.empty:
            return None
        current = round(float(hist["Close"].iloc[-1]), 2)
        high    = round(float(hist["High"].max()), 2)
        low     = round(float(hist["Low"].min()), 2)
        # timestamp of when high/low occurred today
        high_time = hist["High"].idxmax().isoformat()
        low_time  = hist["Low"].idxmin().isoformat()
        return {
            "current": current,
            "high":    high,
            "high_time": high_time,
            "low":     low,
            "low_time": low_time,
        }
    except Exception as e:
        print(f"  [yfinance error] {ticker}: {e}")
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

    # First capture — set entry price
    if not trade.get("price_captured"):
        patch["entry_price"]    = current
        patch["price_captured"] = True
        patch["max_high"]       = current
        patch["max_high_time"]  = now
        patch["max_low"]        = current
        patch["max_low_time"]   = now
        print(f"  ✓ {ticker}: entry price captured ${current}")
    else:
        entry = trade.get("entry_price", current)
        patch["current_pct"] = round((current - entry) / entry * 100, 2)

        # Update running max high
        if trade.get("max_high") is None or current > trade["max_high"]:
            patch["max_high"]      = current
            patch["max_high_time"] = now
            print(f"  ↑ {ticker}: new max high ${current}")

        # Update running max low
        if trade.get("max_low") is None or current < trade["max_low"]:
            patch["max_low"]      = current
            patch["max_low_time"] = now
            print(f"  ↓ {ticker}: new max low ${current}")

        # Check if strike was reached (for calls: price >= strike, puts: price <= strike)
        direction = trade.get("direction", "C")
        if not trade.get("strike_reached"):
            if (direction == "C" and current >= strike) or (direction == "P" and current <= strike):
                patch["strike_reached"]      = True
                patch["strike_reached_time"] = now
                print(f"  ★ {ticker}: STRIKE {strike} REACHED at ${current}!")

        # Log current status
        max_h = trade.get("max_high", current)
        max_l = trade.get("max_low", current)
        pct   = patch.get("current_pct", 0)
        print(f"  {ticker}: ${current} ({pct:+.1f}%)  HOD=${max_h}  LOD=${max_l}  Strike={strike}")

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
