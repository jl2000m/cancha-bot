import { NextResponse } from "next/server";
import { createTelegramBot } from "@/lib/telegram/bot";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot: ReturnType<typeof createTelegramBot> | null = null;

function getBot() {
  if (!bot && TELEGRAM_TOKEN) {
    bot = createTelegramBot(TELEGRAM_TOKEN);
  }
  return bot;
}

export async function POST(req: Request) {
  const telegramBot = getBot();

  if (!telegramBot) {
    return NextResponse.json(
      { error: "Telegram bot not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    await telegramBot.handleUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[TELEGRAM WEBHOOK ERROR]", error);
    return NextResponse.json({ error: "Failed to process update" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Telegram webhook endpoint active",
    configured: !!TELEGRAM_TOKEN,
  });
}
