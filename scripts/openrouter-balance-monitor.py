#!/usr/bin/env python3
"""
openrouter-balance-monitor.py

Мониторинг баланса OpenRouter-аккаунта через Management Key.

Что делает:
  * Вызывает GET https://openrouter.ai/api/v1/credits с Bearer-токеном
    из переменной OPENROUTER_MANAGEMENT_KEY.
  * Считает баланс = total_credits - total_usage.
  * Опционально пишет баланс в PostgreSQL (таблица balance_records).
  * Опционально шлёт отчёт в Telegram.

Переменные окружения (все опциональные, кроме OPENROUTER_MANAGEMENT_KEY):

  OPENROUTER_MANAGEMENT_KEY   — Management Key от https://openrouter.ai/settings/management-keys (обязательно)
  OPENROUTER_BASE_URL         — базовый URL OpenRouter (по умолчанию https://openrouter.ai)
  DATABASE_URL                — строка подключения PostgreSQL (если не задана — запись в БД пропускается)
  TELEGRAM_BOT_TOKEN          — токен бота (если не задана — Telegram не отправляется)
  TELEGRAM_CHAT_ID            — ID чата для отправки (обязателен, если задан TELEGRAM_BOT_TOKEN)

Запуск:
  python3 scripts/openrouter-balance-monitor.py
"""

import http.client
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Error: {name} не задан", file=sys.stderr)
        sys.exit(1)
    return value


def optional_env(name: str) -> str | None:
    return os.environ.get(name) or None


def fetch_balance(management_key: str, base_url: str) -> float:
    host = base_url.replace("https://", "").replace("http://", "").rstrip("/")
    conn = http.client.HTTPSConnection(host)
    headers = {"Authorization": f"Bearer {management_key}"}
    try:
        conn.request("GET", "/api/v1/credits", "", headers)
        res = conn.getresponse()
        data = res.read().decode("utf-8")
        result = json.loads(data)

        if "error" in result:
            error_msg = result.get("error", {}).get("message", str(result["error"]))
            raise RuntimeError(f"OpenRouter API error: {error_msg}")

        credits_data = result.get("data")
        if credits_data is None:
            raise RuntimeError(f"Unexpected response: {json.dumps(result, indent=2)[:1000]}")

        total_credits = float(credits_data["total_credits"])
        total_usage = float(credits_data["total_usage"])
        balance = total_credits - total_usage

        print(f"Total credits: {total_credits}")
        print(f"Total usage:   {total_usage}")
        print(f"Balance:       {balance:.2f} $")
        return balance
    finally:
        conn.close()


def save_to_db(database_url: str, balance: float) -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 не установлен — запись в БД пропущена (pip install psycopg2-binary)")
        return

    try:
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS balance_records (
                id SERIAL PRIMARY KEY,
                provider TEXT NOT NULL DEFAULT 'openrouter',
                account_label TEXT NOT NULL DEFAULT 'openrouter-main',
                balance DOUBLE PRECISION NOT NULL,
                recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cur.execute(
            """
            INSERT INTO balance_records (provider, account_label, balance, recorded_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (account_label) DO UPDATE SET
                balance = EXCLUDED.balance,
                recorded_at = NOW()
            """,
            ("openrouter", "openrouter-main", balance),
        )
        conn.commit()
        cur.close()
        conn.close()
        print("Saved to DB")
    except Exception as e:
        print(f"DB error: {e}")


def send_telegram(bot_token: str, chat_id: str, text: str) -> None:
    params = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    })
    conn = http.client.HTTPSConnection("api.telegram.org")
    try:
        conn.request("GET", f"/bot{bot_token}/sendMessage?{params}")
        res = conn.getresponse()
        data = json.loads(res.read().decode("utf-8"))
        if not data.get("ok"):
            print(f"Telegram error: {data}")
        else:
            print("Telegram message sent")
    except Exception as e:
        print(f"Telegram error: {e}")
    finally:
        conn.close()


def main() -> None:
    management_key = require_env("OPENROUTER_MANAGEMENT_KEY")
    base_url = optional_env("OPENROUTER_BASE_URL") or "https://openrouter.ai"
    database_url = optional_env("DATABASE_URL")
    bot_token = optional_env("TELEGRAM_BOT_TOKEN")
    chat_id = optional_env("TELEGRAM_CHAT_ID")

    if bot_token and not chat_id:
        print("Error: TELEGRAM_CHAT_ID обязателен, если задан TELEGRAM_BOT_TOKEN", file=sys.stderr)
        sys.exit(1)

    try:
        balance = fetch_balance(management_key, base_url)
    except Exception as e:
        print(f"Request error: {e}")
        if bot_token and chat_id:
            send_telegram(
                bot_token, chat_id,
                f'⚠️ <a href="{base_url}/credits"><b>OpenRouter</b></a>\n'
                f'Ошибка запроса: <code>{e}</code>'
            )
        return

    if database_url:
        save_to_db(database_url, balance)

    message = (
        f'<a href="{base_url}/credits"><b>OpenRouter</b></a>\n'
        f'Balance: <code>{balance:.2f}</code> $'
    )
    print(message)

    if bot_token and chat_id:
        send_telegram(bot_token, chat_id, message)


if __name__ == "__main__":
    main()
