import Link from "next/link";
import { CHAT_AGENT_UI } from "@/lib/agents/registry";

function accentCardClasses(accent: "emerald" | "sky" | "amber"): string {
  switch (accent) {
    case "sky":
      return "border-sky-800/40 hover:border-sky-500/50 hover:bg-sky-500/5";
    case "amber":
      return "border-amber-800/40 hover:border-amber-500/50 hover:bg-amber-500/5";
    default:
      return "border-neutral-800 hover:border-emerald-600/40 hover:bg-emerald-600/5";
  }
}

function accentBadgeClasses(accent: "emerald" | "sky" | "amber"): string {
  switch (accent) {
    case "sky":
      return "bg-sky-500/15 text-sky-300";
    case "amber":
      return "bg-amber-500/15 text-amber-300";
    default:
      return "bg-emerald-500/15 text-emerald-300";
  }
}

function AgentCard({ agent }: { agent: (typeof CHAT_AGENT_UI)[number] }) {
  return (
    <Link
      href={`/chat/${agent.id}`}
      className={`group block rounded-2xl border p-5 transition-colors ${accentCardClasses(agent.accent)}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${accentBadgeClasses(agent.accent)}`}
          aria-hidden
        >
          {agent.icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-neutral-100">{agent.title}</h2>
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              {agent.tagline}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-neutral-400 leading-snug">
            {agent.description}
          </p>
          <p className="mt-3 text-xs font-medium text-neutral-500 group-hover:text-neutral-300">
            Abrir chat →
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const birriapp = CHAT_AGENT_UI.filter((a) => a.id === "birriapp");
  const venues = CHAT_AGENT_UI.filter((a) => a.section === "venue");

  return (
    <main className="min-h-dvh flex flex-col items-center px-4 py-10 md:py-14">
      <div className="w-full max-w-lg">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 mb-2">
          CanchaBot
        </p>
        <h1 className="text-center text-2xl font-semibold text-neutral-50 mb-2">
          Elige tu agente
        </h1>
        <p className="text-center text-sm text-neutral-400 mb-10 max-w-md mx-auto">
          <strong className="text-neutral-300 font-medium">Birriapp</strong>{" "}
          compara varias sedes. Cada club tiene su propio agente para vender o
          licenciar por venue.
        </p>

        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3 px-1">
            Red Birriapp
          </h2>
          <div className="space-y-3">
            {birriapp.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-3 px-1">
            Agentes por venue
          </h2>
          <div className="space-y-3">
            {venues.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
