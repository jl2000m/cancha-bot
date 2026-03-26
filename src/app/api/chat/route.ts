import { convertToModelMessages } from "ai";
import { createBookingAgent } from "@/lib/ai/agent";
import { bookingTools } from "@/lib/ai/tools";

export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages } = body;
  const modelMessages = await convertToModelMessages(messages, {
    tools: bookingTools,
  });
  const result = await createBookingAgent(modelMessages);
  return result.toUIMessageStreamResponse();
}
