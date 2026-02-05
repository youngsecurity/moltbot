import type { Message, TextChannel, DMChannel, ThreadChannel } from "discord.js";
import { getClaudeResponse, chunkResponse } from "./claude.js";
import type { BotConfig, HistoryEntry, MessageContext } from "./types.js";

/**
 * Per-channel message history storage
 * Key: channelId, Value: array of history entries
 */
const channelHistory = new Map<string, HistoryEntry[]>();

/**
 * Get or create history for a channel
 */
function getHistory(channelId: string, limit: number): HistoryEntry[] {
  const history = channelHistory.get(channelId) ?? [];
  // Return last N entries
  return history.slice(-limit);
}

/**
 * Add an entry to channel history
 */
function addToHistory(
  channelId: string,
  entry: HistoryEntry,
  limit: number
): void {
  let history = channelHistory.get(channelId);
  if (!history) {
    history = [];
    channelHistory.set(channelId, history);
  }

  history.push(entry);

  // Trim to limit (keep extra buffer for context)
  const maxSize = limit * 2;
  if (history.length > maxSize) {
    channelHistory.set(channelId, history.slice(-limit));
  }
}

/**
 * Check if a message should be processed
 */
function shouldProcess(message: Message, config: BotConfig): boolean {
  // Ignore bot messages
  if (message.author.bot) {
    return false;
  }

  // Check allowed channels (empty = all allowed)
  if (
    config.allowedChannels.length > 0 &&
    !config.allowedChannels.includes(message.channelId)
  ) {
    return false;
  }

  // Check allowed users (empty = all allowed)
  if (
    config.allowedUsers.length > 0 &&
    !config.allowedUsers.includes(message.author.id)
  ) {
    return false;
  }

  // Check if bot is mentioned or it's a DM
  const isDM = message.channel.isDMBased();
  const isMentioned = message.mentions.has(message.client.user!);

  // In DMs, always process. In servers, require mention
  if (!isDM && !isMentioned) {
    return false;
  }

  return true;
}

/**
 * Build context for Claude from message(s)
 */
function buildContext(
  messages: Message[],
  config: BotConfig
): MessageContext | null {
  if (messages.length === 0) return null;

  const lastMessage = messages[messages.length - 1];

  // Combine multiple messages into one (for debounced batches)
  const combinedContent = messages
    .map((m) => {
      // Remove bot mention from content
      let content = m.content;
      if (m.client.user) {
        content = content.replace(new RegExp(`<@!?${m.client.user.id}>`, "g"), "").trim();
      }
      return content;
    })
    .filter((c) => c.length > 0)
    .join("\n");

  if (!combinedContent) return null;

  const channelId = lastMessage.channelId;
  const history = getHistory(channelId, config.historyLimit);

  // Get guild name if in a server
  let guildName: string | undefined;
  if (lastMessage.guild) {
    guildName = lastMessage.guild.name;
  }

  // Get thread ID if in a thread
  let threadId: string | undefined;
  if (lastMessage.channel.isThread()) {
    threadId = lastMessage.channelId;
  }

  return {
    content: combinedContent,
    channelId,
    authorId: lastMessage.author.id,
    authorName: lastMessage.author.displayName || lastMessage.author.username,
    history,
    guildName,
    threadId,
  };
}

/**
 * Send typing indicator while processing
 */
async function showTyping(
  channel: TextChannel | DMChannel | ThreadChannel
): Promise<void> {
  try {
    await channel.sendTyping();
  } catch {
    // Ignore typing errors
  }
}

/**
 * Process one or more messages and send response
 */
export async function handleMessages(
  messages: Message[],
  config: BotConfig
): Promise<void> {
  if (messages.length === 0) return;

  const lastMessage = messages[messages.length - 1];

  // Filter to messages that should be processed
  const validMessages = messages.filter((m) => shouldProcess(m, config));
  if (validMessages.length === 0) return;

  // Build context
  const context = buildContext(validMessages, config);
  if (!context) return;

  const channel = lastMessage.channel as TextChannel | DMChannel | ThreadChannel;

  // Show typing indicator
  const typingInterval = setInterval(() => {
    void showTyping(channel);
  }, 5000);
  void showTyping(channel);

  try {
    // Add user message to history
    addToHistory(
      context.channelId,
      {
        role: "user",
        content: context.content,
        authorName: context.authorName,
        timestamp: Date.now(),
      },
      config.historyLimit
    );

    // Get response from Claude
    const response = await getClaudeResponse(context, config);

    // Add assistant response to history
    addToHistory(
      context.channelId,
      {
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      },
      config.historyLimit
    );

    // Chunk and send response
    const chunks = chunkResponse(response);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      if (i === 0) {
        // First chunk: reply to the message
        await lastMessage.reply(chunk);
      } else {
        // Subsequent chunks: send as follow-up
        await channel.send(chunk);
      }
    }
  } catch (error) {
    console.error("Error processing message:", error);

    // Send error message to user
    try {
      await lastMessage.reply(
        "Sorry, I encountered an error processing your message."
      );
    } catch {
      // Ignore reply errors
    }
  } finally {
    clearInterval(typingInterval);
  }
}
