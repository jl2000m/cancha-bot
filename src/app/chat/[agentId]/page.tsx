import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import {
  getChatAgentUi,
  isChatAgentId,
  type ChatAgentId,
} from "@/lib/agents/registry";

const SUGGESTIONS: Record<ChatAgentId, string[]> = {
  birriapp: [
    "¿Qué venues están conectados?",
    "¿Hay cancha hoy en PRO CAMP y en Fútbol Town?",
    "Compara precios mañana por la noche",
    "Reservar Fútbol Town por aquí",
  ],
  "pro-camp-explora": [
    "¿Hay cancha disponible hoy?",
    "¿Qué horarios tienen mañana?",
    "¿Cuáles son los precios?",
    "¿Dónde queda la cancha?",
  ],
  "futbol-town": [
    "¿Hay cancha hoy?",
    "Quiero reservar para mañana a las 8 p.m.",
    "¿Qué servicios tienen?",
    "Políticas de cancelación",
  ],
};

type PageProps = { params: Promise<{ agentId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { agentId } = await params;
  const ui = isChatAgentId(agentId) ? getChatAgentUi(agentId) : undefined;
  return {
    title: ui ? `${ui.title} · CanchaBot` : "Chat · CanchaBot",
    description: ui?.description ?? "Chat con el asistente de reservas",
  };
}

export default async function ChatAgentPage({ params }: PageProps) {
  const { agentId } = await params;
  if (!isChatAgentId(agentId)) notFound();

  const ui = getChatAgentUi(agentId);
  if (!ui) notFound();

  const welcomeTitle =
    agentId === "birriapp"
      ? "Birriapp"
      : `¡Hola! Asistente de ${ui.title}`;

  const welcomeHint =
    agentId === "birriapp"
      ? "Comparo sedes conectadas: pregunta por fechas y horarios; todo desde este chat."
      : agentId === "futbol-town"
        ? "Consulta cupos y deja tu reserva conmigo; el club confirma por aquí."
        : `Te ayudo a consultar disponibilidad y reservar en ${ui.title}.`;

  return (
    <main className="h-dvh flex flex-col bg-neutral-950">
      <div className="shrink-0 border-b border-neutral-800/50 bg-neutral-950/95 px-4 py-2">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          ← Elegir otro agente
        </Link>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        <Chat
          agentId={agentId}
          title={ui.title}
          tagline={ui.tagline}
          welcomeTitle={welcomeTitle}
          welcomeHint={welcomeHint}
          suggestions={SUGGESTIONS[agentId]}
          icon={ui.icon}
          accent={ui.accent}
        />
      </div>
    </main>
  );
}
