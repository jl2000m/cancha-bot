import { convertToModelMessages, type UIMessage } from "ai";
import { createBookingAgent } from "@/lib/ai/agent";
import { resolveChatAgent } from "@/lib/agents/registry";

/** Playwright + Skedda puede superar 30s en cold start. */
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, agentId: rawAgentId } = body as {
    messages: UIMessage[];
    agentId?: string;
  };

  const agentId =
    typeof rawAgentId === "string" && rawAgentId.length > 0
      ? rawAgentId
      : "pro-camp-explora";

  const resolved = resolveChatAgent(agentId);
  if (!resolved) {
    return new Response(JSON.stringify({ error: "Unknown agent" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modelMessages = await convertToModelMessages(messages, {
    tools: resolved.tools,
  });
  const result = await createBookingAgent(agentId, modelMessages);
  return result.toUIMessageStreamResponse();
}
