import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { resolveChatAgent } from "@/lib/agents/registry";

export async function generateAgentResponse(
  messages: ModelMessage[],
  agentId: string
): Promise<string> {
  const resolved = resolveChatAgent(agentId);
  if (!resolved) {
    throw new Error(`Unknown chat agent: ${agentId}`);
  }

  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: resolved.system,
    messages,
    tools: resolved.tools,
    stopWhen: stepCountIs(5),
  });

  return result.text;
}
