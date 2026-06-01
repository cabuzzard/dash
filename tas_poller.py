"""
tas_poller.py — runs on your home machine alongside TWS.
Polls Cloudflare KV for trades missing T&S data, fetches from TWS, pushes back.

Usage:
    pip install ib_insync requests
    python tas_poller.py

Requires TWS running on localhost:7497 (paper) or 7496 (live).
Set WORKER_URL and WORKER_PIN at the top if needed.
"""

import time
import json
import requests
import pandas as pd
from ib_insync import IB, Stock

WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
WORKER_PIN  = "1246"          # used only to get a session token
TWS_HOST    = "127.0.0.1"
TWS_PORT    = 7497            # 7497 = paper, 7496 = live
POLL_SECS   = 30
LOOKBACK    = 60              # seconds of T&S to snapshot

# ── Auth ──────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(WORKER_URL, json={"action": "auth", "pin": WORKER_PIN}, timeout=10)
    r.raise_for_status()
    return r.json()["token"]

def worker_call(token, action, **kwargs):
    r = requests.post(WORKER_URL, json={"action": action, "token": token, **kwargs}, timeout=15)
    r.raise_for_status()
    return r.json()

# ── T&S snapshot ──────────────────────────────────────────────────────
def snapshot_tas(ticker: str) -> dict:
    ib = IB()
    try:
        ib.connect(TWS_HOST, TWS_PORT, clientId=10, timeout=10)
        stock = Stock(ticker, "SMART", "USD")
        ib.qualifyContracts(stock)

        bars = ib.reqHistoricalTicks(
            stock,
            startDateTime="",
            endDateTime="",
            numberOfTicks=1000,
            whatToShow="TRADES",
            useRth=False,
        )

        now    = pd.Timestamp.now(tz="US/Eastern")
        recent = [b for b in bars if (now - pd.Timestamp(b.time)).total_seconds() < LOOKBACK]

        if not recent:
            return {"tas_captured": False}

        prices    = [b.price for b in recent]
        upticks   = sum(1 for i in range(1, len(prices)) if prices[i] > prices[i - 1])
        downticks = sum(1 for i in range(1, len(prices)) if prices[i] < prices[i - 1])
        large     = sum(1 for b in recent if b.size >= 100)
        velocity  = len(recent) / LOOKBACK

        return {
            "tas_captured":          True,
            "tas_velocity":          round(velocity, 2),
            "tas_uptick_ratio":      round(upticks / max(len(recent) - 1, 1), 2),
            "tas_total_prints":      len(recent),
            "tas_uptick_count":      upticks,
            "tas_downtick_count":    downticks,
            "tas_large_print_count": large,
        }
    except Exception as e:
        print(f"  [IBKR error] {e}")
        return {"tas_captured": False}
    finally:
        try:
            ib.disconnect()
        except Exception:
            pass

# ── Main loop ─────────────────────────────────────────────────────────
def main():
    print(f"T&S Poller starting — polling every {POLL_SECS}s")
    print(f"Worker: {WORKER_URL}")
    print(f"TWS:    {TWS_HOST}:{TWS_PORT}\n")

    token = None

    while True:
        try:
            if token is None:
                print("Authenticating with worker…")
                token = get_token()
                print("Auth OK\n")

            data    = worker_call(token, "getPendingTas")
            pending = data.get("trades", [])

            if pending:
                print(f"{len(pending)} trade(s) need T&S snapshot")
                for trade in pending:
                    tid    = trade["id"]
                    ticker = trade["ticker"]
                    print(f"  Snapshotting {ticker} for trade {tid}…")
                    snap = snapshot_tas(ticker)
                    if snap["tas_captured"]:
                        worker_call(token, "updateTrade", id=tid, **snap)
                        print(f"  ✓ {ticker}: vel={snap['tas_velocity']}/s  uptick={snap['tas_uptick_ratio']}  large={snap['tas_large_print_count']}")
                    else:
                        print(f"  ✗ {ticker}: no T&S data (market closed or TWS issue)")
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
