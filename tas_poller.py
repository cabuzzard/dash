"""
tas_poller.py — runs on your home machine.
Polls Cloudflare KV for trades missing price data, fetches from Yahoo Finance, pushes back.

Usage:
    pip install yfinance requests
    python tas_poller.py
"""

import time
import requests
import yfinance as yf

WORKER_URL = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
WORKER_PIN = "1246"
POLL_SECS  = 30

# ── Auth ──────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(WORKER_URL, json={"action": "auth", "pin": WORKER_PIN}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]

def worker_call(token, action, **kwargs):
    r = requests.post(WORKER_URL, json={"action": action, "token": token, **kwargs}, timeout=15)
    r.raise_for_status()
    return r.json()

# ── Price snapshot ────────────────────────────────────────────────────
def snapshot_price(ticker: str) -> dict:
    try:
        t    = yf.Ticker(ticker)
        hist = t.history(period="1d", interval="1m")

        if hist.empty:
            return {"price_captured": False}

        current   = round(float(hist["Close"].iloc[-1]), 2)
        high_day  = round(float(hist["High"].max()), 2)
        low_day   = round(float(hist["Low"].min()), 2)
        open_day  = round(float(hist["Open"].iloc[0]), 2)

        return {
            "price_captured":          True,
            "underlying_price":        current,
            "underlying_high_of_day":  high_day,
            "underlying_low_of_day":   low_day,
            "underlying_open":         open_day,
        }
    except Exception as e:
        print(f"  [yfinance error] {e}")
        return {"price_captured": False}

# ── Main loop ─────────────────────────────────────────────────────────
def main():
    print(f"Price Poller starting — polling every {POLL_SECS}s")
    print(f"Worker: {WORKER_URL}\n")

    token = None

    while True:
        try:
            if token is None:
                print("Authenticating with worker…")
                token = get_token()
                print("Auth OK\n")

            data    = worker_call(token, "getPendingPrice")
            pending = data.get("trades", [])

            if pending:
                print(f"{len(pending)} trade(s) need price snapshot")
                for trade in pending:
                    tid    = trade["id"]
                    ticker = trade["ticker"]
                    strike = trade["strike"]
                    print(f"  Snapshotting {ticker} for trade {tid}…")
                    snap = snapshot_price(ticker)
                    if snap["price_captured"]:
                        price     = snap["underlying_price"]
                        high      = snap["underlying_high_of_day"]
                        low       = snap["underlying_low_of_day"]
                        otm_pct   = round((strike - price) / price * 100, 2)  # + = OTM call, - = ITM call
                        snap["otm_pct"] = otm_pct
                        worker_call(token, "updateTrade", id=tid, **snap)
                        print(f"  ✓ {ticker}: ${price}  HOD=${high}  LOD=${low}  OTM={otm_pct:+.1f}%")
                    else:
                        print(f"  ✗ {ticker}: no price data (market closed?)")
            else:
                print(f"[{time.strftime('%H:%M:%S')}] No pending trades")

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
