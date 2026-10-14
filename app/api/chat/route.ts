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
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // Say why, instead of the SDK's generic "An error occurred."
      onError: (e) => {
        console.error("stylist error", e);
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 402) return "The AI Gateway budget is used up. Raise it in Vercel → AI Gateway → Budgets.";
        if (status === 429) return "Too many requests to the AI right now. Try again in a moment.";
        return e instanceof Error ? e.message : "Something went wrong.";
      },
    }),
  });
}
