import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { resolveChatAgent } from "@/lib/agents/registry";

export function createBookingAgent(agentId: string, messages: ModelMessage[]) {
  const resolved = resolveChatAgent(agentId);
  if (!resolved) {
    throw new Error(`Unknown chat agent: ${agentId}`);
  }

  return streamText({
    model: openai("gpt-4o-mini"),
    system: resolved.system,
    messages,
    tools: resolved.tools,
    stopWhen: stepCountIs(5),
  });
}
