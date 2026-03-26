import { Telegraf } from "telegraf";
import { generateAgentResponse } from "@/lib/ai/generate";
import type { ModelMessage } from "ai";

const conversationHistory = new Map<number, ModelMessage[]>();
const MAX_HISTORY = 20;

function chunkTelegramMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

function getHistory(chatId: number): ModelMessage[] {
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  return conversationHistory.get(chatId)!;
}

function addMessage(chatId: number, message: ModelMessage) {
  const history = getHistory(chatId);
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export function createTelegramBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  bot.start((ctx) => {
    const chatId = ctx.chat.id;
    conversationHistory.set(chatId, []);
    ctx.reply(
      "⚽ ¡Hola! Soy CanchaBot.\n\n" +
        "Te ayudo a consultar disponibilidad y reservar canchas en PRO CAMP EXPLORA.\n\n" +
        "Puedes preguntarme cosas como:\n" +
        '• "¿Hay cancha disponible hoy?"\n' +
        '• "¿Qué horarios tienen mañana?"\n' +
        '• "Quiero reservar el sábado a las 7"\n\n' +
        "¿En qué te puedo ayudar?"
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      "Puedo ayudarte con:\n\n" +
        "📅 Consultar disponibilidad de canchas\n" +
        "🏟 Reservar una cancha\n" +
        "ℹ️ Información del venue (horarios, ubicación, precios)\n\n" +
        "Escríbeme en español o inglés."
    );
  });

  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    addMessage(chatId, { role: "user", content: userMessage });

    try {
      await ctx.sendChatAction("typing");

      const response = await generateAgentResponse(getHistory(chatId));

      addMessage(chatId, { role: "assistant", content: response });

      if (response.length > 4000) {
        const chunks = chunkTelegramMessage(response, 4000);
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(response);
      }
    } catch (error) {
      console.error("[TELEGRAM BOT ERROR]", error);
      await ctx.reply(
        "Lo siento, tuve un problema procesando tu mensaje. Intenta de nuevo."
      );
    }
  });

  return bot;
}
