import Anthropic from "@anthropic-ai/sdk";
import type { MessageContext, BotConfig, HistoryEntry } from "./types.js";

let client: Anthropic | null = null;

/**
 * Initialize the Anthropic client
 */
export function initClaudeClient(apiKey: string): void {
  client = new Anthropic({ apiKey });
}

/**
 * Convert our history format to Anthropic's message format
 */
function historyToMessages(
  history: HistoryEntry[]
): Anthropic.MessageParam[] {
  return history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}

/**
 * Get a response from Claude
 */
export async function getClaudeResponse(
  context: MessageContext,
  config: BotConfig
): Promise<string> {
  if (!client) {
    throw new Error("Claude client not initialized");
  }

  // Build messages array from history + current message
  const messages: Anthropic.MessageParam[] = [
    ...historyToMessages(context.history),
    {
      role: "user",
      content: context.content,
    },
  ];

  // Build system prompt with context
  const systemParts = [config.systemPrompt];

  if (context.guildName) {
    systemParts.push(`\nYou are chatting in the Discord server: ${context.guildName}`);
  }

  systemParts.push(`\nThe user's name is: ${context.authorName}`);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemParts.join(""),
      messages,
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return "I couldn't generate a response.";
    }

    return textBlock.text;
  } catch (error) {
    console.error("Claude API error:", error);
    throw error;
  }
}

/**
 * Chunk text to fit Discord's 2000 character limit
 * Tries to split at natural boundaries (paragraphs, sentences)
 */
export function chunkResponse(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point
    let breakPoint = maxLength;

    // Try paragraph break first
    const paragraphBreak = remaining.lastIndexOf("\n\n", maxLength);
    if (paragraphBreak > maxLength * 0.5) {
      breakPoint = paragraphBreak + 2;
    } else {
      // Try sentence break
      const sentenceBreak = remaining.lastIndexOf(". ", maxLength);
      if (sentenceBreak > maxLength * 0.5) {
        breakPoint = sentenceBreak + 2;
      } else {
        // Try newline
        const lineBreak = remaining.lastIndexOf("\n", maxLength);
        if (lineBreak > maxLength * 0.5) {
          breakPoint = lineBreak + 1;
        } else {
          // Try space
          const spaceBreak = remaining.lastIndexOf(" ", maxLength);
          if (spaceBreak > maxLength * 0.5) {
            breakPoint = spaceBreak + 1;
          }
        }
      }
    }

    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }

  return chunks;
}
