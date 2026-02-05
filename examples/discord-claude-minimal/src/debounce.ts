import type { Message } from "discord.js";
import type { PendingMessage } from "./types.js";

type FlushCallback = (messages: Message[]) => Promise<void>;

interface DebouncerEntry {
  messages: PendingMessage[];
  timer: NodeJS.Timeout | null;
}

/**
 * Creates a debouncer that batches rapid messages from the same user in the same channel.
 * This prevents overwhelming Claude with many small messages sent in quick succession.
 *
 * Pattern adapted from moltbot's src/auto-reply/inbound-debounce.ts
 */
export function createMessageDebouncer(
  debounceMs: number,
  onFlush: FlushCallback
) {
  const pending = new Map<string, DebouncerEntry>();

  /**
   * Build a unique key for grouping messages
   */
  function buildKey(message: Message): string {
    return `${message.channelId}:${message.author.id}`;
  }

  /**
   * Check if a message should be debounced
   * Messages with attachments or commands are processed immediately
   */
  function shouldDebounce(message: Message): boolean {
    // Don't debounce messages with attachments
    if (message.attachments.size > 0) {
      return false;
    }

    // Don't debounce if message looks like a command
    const content = message.content.trim();
    if (content.startsWith("/") || content.startsWith("!")) {
      return false;
    }

    return true;
  }

  /**
   * Flush all pending messages for a key
   */
  async function flush(key: string): Promise<void> {
    const entry = pending.get(key);
    if (!entry) return;

    pending.delete(key);

    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    const messages = entry.messages.map((p) => p.message);
    if (messages.length > 0) {
      try {
        await onFlush(messages);
      } catch (error) {
        console.error("Debounce flush error:", error);
      }
    }
  }

  /**
   * Enqueue a message for processing
   */
  function enqueue(message: Message): void {
    const key = buildKey(message);

    // If message shouldn't be debounced, flush existing and process immediately
    if (!shouldDebounce(message)) {
      // Flush any pending messages first
      const entry = pending.get(key);
      if (entry) {
        void flush(key);
      }
      // Process this message immediately
      void onFlush([message]);
      return;
    }

    // Get or create entry for this key
    let entry = pending.get(key);
    if (!entry) {
      entry = { messages: [], timer: null };
      pending.set(key, entry);
    }

    // Add message to pending list
    entry.messages.push({
      message,
      timestamp: Date.now(),
    });

    // Reset timer
    if (entry.timer) {
      clearTimeout(entry.timer);
    }

    entry.timer = setTimeout(() => {
      void flush(key);
    }, debounceMs);
  }

  /**
   * Flush all pending messages (for shutdown)
   */
  async function flushAll(): Promise<void> {
    const keys = Array.from(pending.keys());
    await Promise.all(keys.map((key) => flush(key)));
  }

  return {
    enqueue,
    flushAll,
  };
}
