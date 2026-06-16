#!/usr/bin/env python3
"""
Trade Poller — fetches live prices via yfinance and pushes updates to the
Hermes Cloudflare Worker (updateTrade action).

Run continuously:   python trade_poller.py
Run once:           python trade_poller.py --once
"""

import argparse
import time
import requests
import yfinance as yf
from datetime import datetime, timezone

# ── CONFIG ────────────────────────────────────────────────────────────────────
WORKER_URL = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
PIN        = "1246"    # same PIN used to unlock the dash
POLL_INTERVAL_SEC = 300   # 5 minutes between full polls during market hours
SLEEP_OFF_HOURS   = 900   # 15 min between checks when market is closed

# Market hours check (US Eastern, approximate — no DST handling needed for gating)
MARKET_OPEN_ET_HOUR  = 9
MARKET_CLOSE_ET_HOUR = 16

# ── HELPERS ───────────────────────────────────────────────────────────────────

def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()

def market_is_open() -> bool:
    """Rough check: is it Mon-Fri 9:30–16:00 ET? (UTC-4 during summer, UTC-5 winter)"""
    from datetime import datetime as dt
    import time as t
    # Use local time offset approximation — good enough for gating
    utc_now = dt.now(timezone.utc)
    et_offset = -4  # EDT; change to -5 in winter if needed
    et_now = utc_now.hour + et_offset
    weekday = utc_now.weekday()  # Mon=0, Fri=4
    if weekday >= 5:
        return False
    if et_now < MARKET_OPEN_ET_HOUR or et_now >= MARKET_CLOSE_ET_HOUR:
        return False
    return True

_session_token = None

def get_token() -> str:
    """Exchange PIN for a session token."""
    global _session_token
    resp = requests.post(WORKER_URL, json={"action": "auth", "pin": PIN}, timeout=15)
    resp.raise_for_status()
    _session_token = resp.json().get("token")
    if not _session_token:
        raise RuntimeError("Auth failed — check PIN")
    return _session_token

def call(action: str, extra: dict = {}) -> dict:
    """Call the worker with the session token, re-authing if needed."""
    global _session_token
    if not _session_token:
        get_token()
    payload = {"action": action, "token": _session_token, **extra}
    resp = requests.post(WORKER_URL, json=payload, timeout=15)
    if resp.status_code == 401:
        # Token expired — re-auth and retry once
        get_token()
        payload["token"] = _session_token
        resp = requests.post(WORKER_URL, json=payload, timeout=15)
    resp.raise_for_status()
    return resp.json()

def get_trades() -> list:
    """Pull all active trades from the worker."""
    return call("getTrades").get("trades", [])

def fetch_price(ticker: str) -> float | None:
    """Get the latest market price for a ticker via yfinance."""
    try:
        t = yf.Ticker(ticker)
        info = t.fast_info
        price = getattr(info, "last_price", None) or getattr(info, "regularMarketPrice", None)
        if price:
            return round(float(price), 4)
        # Fallback: pull 1-day history
        hist = t.history(period="1d", interval="1m")
        if not hist.empty:
            return round(float(hist["Close"].iloc[-1]), 4)
    except Exception as e:
        print(f"  [yfinance error] {ticker}: {e}")
    return None

def update_trade(trade_id: str, fields: dict):
    """Push updated fields to the worker."""
    return call("updateTrade", {"id": trade_id, **fields})

def is_expired(trade: dict) -> bool:
    """Check if the trade's expiry date has passed."""
    expiry = trade.get("expiry", "")
    if not expiry:
        return False
    try:
        exp_date = datetime.strptime(expiry, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) > exp_date
    except ValueError:
        return False

# ── CORE POLL ─────────────────────────────────────────────────────────────────

def poll_once():
    print(f"\n[{now_utc()}] Polling trades…")
    try:
        trades = get_trades()
    except Exception as e:
        print(f"  [error] Could not fetch trades: {e}")
        return

    active = [t for t in trades if not t.get("expired")]
    print(f"  {len(active)} active trades found")

    for trade in active:
        tid    = trade["id"]
        ticker = trade.get("ticker", "").upper()
        strike = trade.get("strike")
        direction = trade.get("direction", "C")

        if not ticker:
            continue

        print(f"  > {ticker} {strike}{direction} exp:{trade.get('expiry')} ...", end=" ", flush=True)

        # Check expiry first
        if is_expired(trade):
            update_trade(tid, {"expired": True, "last_updated": now_utc()})
            print("EXPIRED — archived")
            continue

        price = fetch_price(ticker)
        if price is None:
            print("no price")
            continue

        now   = now_utc()
        updates = {"current_price": price, "last_updated": now}

        # Capture entry price on first successful poll
        if not trade.get("price_captured") or trade.get("entry_price") is None:
            updates["entry_price"]    = price
            updates["price_captured"] = True

        entry_price = trade.get("entry_price") or price

        # current_pct — % move of underlying from entry
        updates["current_pct"] = round((price - entry_price) / entry_price * 100, 4)

        # max_high
        prev_high = trade.get("max_high")
        if prev_high is None or price > prev_high:
            updates["max_high"]      = price
            updates["max_high_time"] = now

        # max_low
        prev_low = trade.get("max_low")
        if prev_low is None or price < prev_low:
            updates["max_low"]      = price
            updates["max_low_time"] = now

        # strike_reached
        if not trade.get("strike_reached") and strike is not None:
            hit = (direction in ("C", "CALL") and price >= strike) or \
                  (direction in ("P", "PUT")  and price <= strike)
            if hit:
                updates["strike_reached"]      = True
                updates["strike_reached_time"] = now

        try:
            update_trade(tid, updates)
            pct = updates["current_pct"]
            sign = "+" if pct >= 0 else ""
            print(f"${price:.2f} ({sign}{pct:.2f}%)")
        except Exception as e:
            print(f"update error: {e}")

    print(f"  Done.")

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Trade price poller")
    parser.add_argument("--once", action="store_true", help="Run one poll and exit")
    args = parser.parse_args()

    if args.once:
        poll_once()
        return

    print("Trade poller started. Ctrl+C to stop.")
    while True:
        poll_once()
        if market_is_open():
            sleep = POLL_INTERVAL_SEC
        else:
            sleep = SLEEP_OFF_HOURS
        next_run = datetime.now(timezone.utc).replace(microsecond=0)
        print(f"  Sleeping {sleep}s (next poll ~{sleep//60}m from now)")
        time.sleep(sleep)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
