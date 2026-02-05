import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Message,
} from "discord.js";
import { initClaudeClient } from "./claude.js";
import { createMessageDebouncer } from "./debounce.js";
import { handleMessages } from "./message-handler.js";
import type { BotConfig } from "./types.js";

/**
 * Load configuration from environment variables
 */
function loadConfig(): BotConfig {
  const discordToken = process.env.DISCORD_TOKEN;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!discordToken) {
    throw new Error("DISCORD_TOKEN environment variable is required");
  }

  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  return {
    discordToken,
    anthropicApiKey,
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    maxTokens: parseInt(process.env.MAX_TOKENS || "4096", 10),
    systemPrompt:
      process.env.SYSTEM_PROMPT ||
      "You are a helpful AI assistant in a Discord chat. Be concise and friendly. Use Discord markdown formatting when appropriate.",
    historyLimit: parseInt(process.env.HISTORY_LIMIT || "20", 10),
    debounceMs: parseInt(process.env.DEBOUNCE_MS || "500", 10),
    allowedChannels: process.env.ALLOWED_CHANNELS
      ? process.env.ALLOWED_CHANNELS.split(",").map((s) => s.trim())
      : [],
    allowedUsers: process.env.ALLOWED_USERS
      ? process.env.ALLOWED_USERS.split(",").map((s) => s.trim())
      : [],
  };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("Starting Discord-Claude bot...");

  // Load config
  const config = loadConfig();

  // Initialize Claude client
  initClaudeClient(config.anthropicApiKey);

  // Create Discord client with required intents
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      // Required for DM support
      Partials.Channel,
      Partials.Message,
    ],
  });

  // Create message debouncer
  const debouncer = createMessageDebouncer(
    config.debounceMs,
    async (messages: Message[]) => {
      await handleMessages(messages, config);
    }
  );

  // Handle ready event
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Bot is in ${readyClient.guilds.cache.size} server(s)`);

    if (config.allowedChannels.length > 0) {
      console.log(`Restricted to channels: ${config.allowedChannels.join(", ")}`);
    }

    if (config.allowedUsers.length > 0) {
      console.log(`Restricted to users: ${config.allowedUsers.join(", ")}`);
    }
  });

  // Handle message events
  client.on(Events.MessageCreate, (message) => {
    // Quick filter: ignore bots
    if (message.author.bot) return;

    // Enqueue for processing (debouncer handles the rest)
    debouncer.enqueue(message);
  });

  // Handle errors
  client.on(Events.Error, (error) => {
    console.error("Discord client error:", error);
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down...");

    // Flush any pending messages
    await debouncer.flushAll();

    // Destroy Discord client
    client.destroy();

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Login to Discord
  await client.login(config.discordToken);
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
