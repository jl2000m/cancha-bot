import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { bookingTools } from "./tools";
import { buildBookingAgentSystemPrompt } from "./system-prompt";

export async function generateAgentResponse(
  messages: ModelMessage[]
): Promise<string> {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: buildBookingAgentSystemPrompt(),
    messages,
    tools: bookingTools,
    stopWhen: stepCountIs(5),
  });

  return result.text;
}
