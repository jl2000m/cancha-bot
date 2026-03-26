import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { bookingTools } from "./tools";
import { buildBookingAgentSystemPrompt } from "./system-prompt";

export function createBookingAgent(messages: ModelMessage[]) {
  return streamText({
    model: openai("gpt-4o-mini"),
    system: buildBookingAgentSystemPrompt(),
    messages,
    tools: bookingTools,
    stopWhen: stepCountIs(5),
  });
}
