import type { Message } from "discord.js";

/**
 * Context passed to Claude for each message
 */
export interface MessageContext {
  /** The user's message content */
  content: string;
  /** Discord channel ID */
  channelId: string;
  /** Discord user ID */
  authorId: string;
  /** Discord username */
  authorName: string;
  /** Recent message history for context */
  history: HistoryEntry[];
  /** Thread ID if in a thread */
  threadId?: string;
  /** Guild/server name */
  guildName?: string;
}

/**
 * A single message in the conversation history
 */
export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
  authorName?: string;
  timestamp: number;
}

/**
 * Configuration for the bot
 */
export interface BotConfig {
  /** Discord bot token */
  discordToken: string;
  /** Anthropic API key */
  anthropicApiKey: string;
  /** Claude model to use */
  model: string;
  /** Max tokens in response */
  maxTokens: number;
  /** System prompt for Claude */
  systemPrompt: string;
  /** Number of history messages to include */
  historyLimit: number;
  /** Debounce time in ms for rapid messages */
  debounceMs: number;
  /** Allowed channel IDs (empty = all channels) */
  allowedChannels: string[];
  /** Allowed user IDs (empty = all users) */
  allowedUsers: string[];
}

/**
 * Pending message in the debounce queue
 */
export interface PendingMessage {
  message: Message;
  timestamp: number;
}
