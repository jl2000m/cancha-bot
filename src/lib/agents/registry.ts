import { createBookingTools } from "@/lib/ai/tools";
import {
  buildBirriappSystemPrompt,
  buildSingleVenueSystemPrompt,
} from "@/lib/ai/system-prompt";
import type { ToolSet } from "ai";

export const CHAT_AGENT_IDS = [
  "birriapp",
  "pro-camp-explora",
  "futbol-town",
] as const;

export type ChatAgentId = (typeof CHAT_AGENT_IDS)[number];

export function isChatAgentId(id: string): id is ChatAgentId {
  return (CHAT_AGENT_IDS as readonly string[]).includes(id);
}

export interface ChatAgentUiMeta {
  id: ChatAgentId;
  title: string;
  tagline: string;
  description: string;
  section: "birriapp" | "venue";
  accent: "emerald" | "sky" | "amber";
  icon: string;
}

export const CHAT_AGENT_UI: ChatAgentUiMeta[] = [
  {
    id: "birriapp",
    title: "Birriapp",
    tagline: "Agente multi-sede",
    description:
      "Por defecto consulta todas las sedes conectadas el mismo día; solo enfoca un club si lo pides.",
    section: "birriapp",
    accent: "emerald",
    icon: "◆",
  },
  {
    id: "pro-camp-explora",
    title: "PRO CAMP EXPLORA",
    tagline: "Agente del club",
    description:
      "Disponibilidad en vivo, precios y reservas para PRO CAMP EXPLORA (Alquila Tu Cancha).",
    section: "venue",
    accent: "emerald",
    icon: "⚽",
  },
  {
    id: "futbol-town",
    title: "Fútbol Town",
    tagline: "Agente del club",
    description:
      "Cupo y reservas por este chat (sin salir a Skedda). Próximo club en la red Birriapp.",
    section: "venue",
    accent: "sky",
    icon: "🏟",
  },
];

export function getChatAgentUi(id: string): ChatAgentUiMeta | undefined {
  return CHAT_AGENT_UI.find((a) => a.id === id);
}

export interface ResolvedChatAgent {
  tools: ToolSet;
  system: string;
}

export function resolveChatAgent(agentId: string): ResolvedChatAgent | null {
  if (agentId === "birriapp") {
    return {
      tools: createBookingTools({ mode: "multi" }),
      system: buildBirriappSystemPrompt(),
    };
  }
  if (agentId === "pro-camp-explora" || agentId === "futbol-town") {
    return {
      tools: createBookingTools({
        mode: "single",
        venueId: agentId,
      }),
      system: buildSingleVenueSystemPrompt(agentId),
    };
  }
  return null;
}
