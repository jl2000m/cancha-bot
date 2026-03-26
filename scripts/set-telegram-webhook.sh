#!/bin/bash

# Usage: ./scripts/set-telegram-webhook.sh <BOT_TOKEN> <YOUR_DOMAIN>
# Example: ./scripts/set-telegram-webhook.sh 123456:ABC-DEF https://cancha-bot.vercel.app

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <BOT_TOKEN> <YOUR_DOMAIN>"
  echo "Example: $0 123456:ABC-DEF https://cancha-bot.vercel.app"
  exit 1
fi

TOKEN=$1
DOMAIN=$2

echo "Setting Telegram webhook to: ${DOMAIN}/api/telegram"
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook?url=${DOMAIN}/api/telegram" | python3 -m json.tool

echo ""
echo "Checking webhook info..."
curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | python3 -m json.tool
