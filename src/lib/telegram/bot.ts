import { Markup, Telegraf } from "telegraf";
import { generateAgentResponse } from "@/lib/ai/generate";
import type { ModelMessage } from "ai";
import {
  CHAT_AGENT_UI,
  type ChatAgentId,
  getChatAgentUi,
  isChatAgentId,
} from "@/lib/agents/registry";

const conversationHistory = new Map<number, ModelMessage[]>();
const MAX_HISTORY = 20;

const DEFAULT_TELEGRAM_AGENT: ChatAgentId = "pro-camp-explora";
const chatAgentByChat = new Map<number, ChatAgentId>();

function getAgentId(chatId: number): ChatAgentId {
  return chatAgentByChat.get(chatId) ?? DEFAULT_TELEGRAM_AGENT;
}

function agentInlineKeyboard() {
  return Markup.inlineKeyboard(
    CHAT_AGENT_UI.map((a) => [
      Markup.button.callback(`${a.icon} ${a.title}`, `agent:${a.id}`),
    ])
  );
}

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
    const agentId = getAgentId(chatId);
    const meta = getChatAgentUi(agentId);
    const modeLine = meta
      ? `\n\n📍 **Modo actual:** ${meta.icon} ${meta.title} (${meta.tagline}).`
      : "";

    ctx.reply(
      "⚽ ¡Hola! Soy CanchaBot.\n\n" +
        "En la web eliges sede en la portada; aquí hazlo con los botones o con /modo." +
        modeLine +
        "\n\n¿Con cuál quieres hablar ahora?",
      agentInlineKeyboard()
    );
  });

  bot.command("modo", (ctx) => {
    const chatId = ctx.chat.id;
    const meta = getChatAgentUi(getAgentId(chatId));
    const modeLine = meta
      ? `📍 **Modo actual:** ${meta.icon} ${meta.title}.\n\n`
      : "";
    ctx.reply(`${modeLine}Elige sede o agente multi-sede:`, agentInlineKeyboard());
  });

  bot.action(/^agent:(.+)$/, async (ctx) => {
    const raw = ctx.match[1];
    if (!isChatAgentId(raw)) {
      await ctx.answerCbQuery("Opción no válida");
      return;
    }
    const chatId = ctx.chat!.id;
    chatAgentByChat.set(chatId, raw);
    conversationHistory.set(chatId, []);
    const meta = getChatAgentUi(raw)!;
    await ctx.answerCbQuery(`Modo: ${meta.title}`);
    await ctx.reply(
      `Listo — hablas con **${meta.title}** (${meta.tagline}).\n\n${meta.description}`
    );
  });

  bot.help((ctx) => {
    ctx.reply(
      "Puedo ayudarte con:\n\n" +
        "📅 Consultar disponibilidad de canchas\n" +
        "🏟 Reservar una cancha\n" +
        "ℹ️ Información del venue (horarios, ubicación, precios)\n\n" +
        "**Sede / modo:** usa /modo o los botones al iniciar.\n\n" +
        "Escríbeme en español o inglés."
    );
  });

  bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    addMessage(chatId, { role: "user", content: userMessage });

    try {
      await ctx.sendChatAction("typing");

      const agentId = getAgentId(chatId);
      const response = await generateAgentResponse(getHistory(chatId), agentId);

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
