# CanchaBot ⚽

AI-powered soccer venue booking agent. Chat via web UI or Telegram to check availability and book courts at PRO CAMP EXPLORA (Panama).

## Architecture

```
User → Web Chat UI / Telegram Bot
          ↓
     AI Agent (Vercel AI SDK + OpenAI gpt-4o-mini)
          ↓
     Tools: check_availability, get_venue_info, create_booking
          ↓
     ATC Sports API (real-time availability)
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.local` and fill in your keys:

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional (for Telegram)
TELEGRAM_BOT_TOKEN=...
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the web chat UI.

### 4. Set up Telegram Bot (optional)

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token to `TELEGRAM_BOT_TOKEN` in `.env.local`
4. Deploy to Vercel, then set the webhook:

```bash
./scripts/set-telegram-webhook.sh YOUR_BOT_TOKEN https://your-app.vercel.app
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # Web chat API (streaming)
│   │   └── telegram/route.ts      # Telegram webhook handler
│   ├── page.tsx                    # Web chat UI page
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── chat.tsx                    # Chat UI component
└── lib/
    ├── ai/
    │   ├── agent.ts                # AI agent (streaming, for web)
    │   ├── generate.ts             # AI agent (non-streaming, for Telegram)
    │   └── tools.ts                # Tool definitions (availability, booking)
    ├── atc/
    │   ├── client.ts               # ATC Sports API client
    │   └── venues.ts               # Venue configurations
    └── telegram/
        └── bot.ts                  # Telegram bot setup
```

## Data Source

Availability comes from the ATC Sports public API:
```
GET https://alquilatucancha.com/api/v3/availability/sportclubs/1863?date=YYYY-MM-DD
```

No scraping needed — clean REST API with real-time court availability, prices, and venue info.

## Adding More Venues (Marketplace)

Edit `src/lib/atc/venues.ts` to add more venues. Each venue needs its `atcSportclubId` from the ATC platform. The system is designed to be multi-tenant from day one.

## Persistence

Bookings are logged to the server console for now. You can add a database (Postgres, Supabase, etc.) later without changing the chat or Telegram layers.

## Tech Stack

- **Next.js** (App Router)
- **Vercel AI SDK** + **OpenAI gpt-4o-mini**
- **Telegraf** (Telegram bot framework)
- **Tailwind CSS** (UI styling)
- **TypeScript** (full type safety)
