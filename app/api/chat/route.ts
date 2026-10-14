import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream } from "ai";
import { MODELS } from "@/lib/models";
import { stylistInstructions } from "@/lib/stylist/prompt";
import { createStylistTools, type StylistMessage } from "@/lib/stylist/tools";
import { getOrCreateUserId } from "@/lib/user";

export const maxDuration = 120;

// POST { messages, voice? } → streamed stylist turn. Text chat and the voice loop share this.
export async function POST(req: Request) {
  const { messages, voice = false }: { messages: StylistMessage[]; voice?: boolean } = await req.json();
  const userId = await getOrCreateUserId();
  const tools = createStylistTools(userId);

  const result = streamText({
    model: MODELS.stylist,
    instructions: stylistInstructions({ voice }),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: isStepCount(10),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, originalMessages: messages }),
  });
}
