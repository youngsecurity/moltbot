# Discord-Claude Minimal Example

A minimal Discord bot that uses Claude for conversations. This example demonstrates the core patterns used in the moltbot Discord integration in a simplified, standalone form.

## Features

- Responds to DMs and @mentions in servers
- Maintains per-channel conversation history
- Debounces rapid messages to batch them together
- Chunks long responses to fit Discord's 2000 character limit
- Supports allowlists for channels and users
- Shows typing indicator while Claude is processing

## Architecture

```
Discord Message → Debouncer → Message Handler → Claude API → Discord Reply
                     ↓
              Channel History
```

### Key Components

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, Discord client setup |
| `src/message-handler.ts` | Message processing and history |
| `src/claude.ts` | Claude API wrapper and response chunking |
| `src/debounce.ts` | Batches rapid messages |
| `src/types.ts` | TypeScript type definitions |

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" in the sidebar
4. Click "Reset Token" and copy the token
5. Enable these Privileged Gateway Intents:
   - **Message Content Intent** (required to read message content)
6. Go to "OAuth2" > "URL Generator"
7. Select scopes: `bot`
8. Select permissions: `Send Messages`, `Read Message History`, `Add Reactions`
9. Copy the generated URL and open it to invite the bot to your server

### 2. Get an Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create an API key

### 3. Install and Run

```bash
# Navigate to the example directory
cd examples/discord-claude-minimal

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your tokens
# DISCORD_TOKEN=your_discord_bot_token
# ANTHROPIC_API_KEY=your_anthropic_api_key

# Run in development mode
npm run dev

# Or build and run in production
npm run build
npm start
```

## Usage

### In a Server

Mention the bot to start a conversation:

```
@YourBot What's the weather like today?
```

### In DMs

Just send a message directly to the bot:

```
Hello! Can you help me with something?
```

## Configuration

All configuration is done via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | - | Your Discord bot token |
| `ANTHROPIC_API_KEY` | Yes | - | Your Anthropic API key |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Claude model to use |
| `MAX_TOKENS` | No | `4096` | Max tokens in response |
| `SYSTEM_PROMPT` | No | (see code) | Custom system prompt |
| `HISTORY_LIMIT` | No | `20` | Messages to include in context |
| `DEBOUNCE_MS` | No | `500` | Debounce time for rapid messages |
| `ALLOWED_CHANNELS` | No | (all) | Comma-separated channel IDs |
| `ALLOWED_USERS` | No | (all) | Comma-separated user IDs |

## How It Works

### Message Flow

1. **Message Received**: Discord.js receives a `messageCreate` event
2. **Quick Filter**: Ignores bot messages immediately
3. **Debounce**: Groups rapid messages from the same user/channel
4. **Validation**: Checks allowlists, mentions, DM vs server
5. **Context Building**: Gathers history and message content
6. **Claude Request**: Sends context to Claude API
7. **Response Handling**: Chunks and sends response to Discord

### Debouncing

When a user sends multiple messages rapidly (within 500ms by default), they're combined into a single request to Claude. This prevents overwhelming the API and provides better context.

```
User: Hey
User: Can you help me
User: with something?
→ Combined: "Hey\nCan you help me\nwith something?"
```

Messages with attachments or command prefixes (`/`, `!`) bypass debouncing and are processed immediately.

### History Management

Each channel maintains its own conversation history. The last N messages (default 20) are included in the context sent to Claude, enabling multi-turn conversations.

History is stored in memory and lost on restart. For persistence, you could add a database.

### Response Chunking

Discord limits messages to 2000 characters. Long responses are automatically split at natural boundaries (paragraphs, sentences, or words) to maintain readability.

## Extending This Example

### Add Slash Commands

```typescript
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask Claude a question")
    .addStringOption((option) =>
      option.setName("question").setDescription("Your question").setRequired(true)
    ),
];

// Register commands
const rest = new REST().setToken(config.discordToken);
await rest.put(Routes.applicationCommands(clientId), { body: commands });

// Handle command
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "ask") {
    const question = interaction.options.getString("question", true);
    // Process with Claude...
  }
});
```

### Add Persistent History

```typescript
import { writeFileSync, readFileSync, existsSync } from "fs";

function saveHistory(channelId: string, history: HistoryEntry[]): void {
  writeFileSync(`./history/${channelId}.json`, JSON.stringify(history));
}

function loadHistory(channelId: string): HistoryEntry[] {
  const path = `./history/${channelId}.json`;
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return [];
}
```

### Add Image Understanding

```typescript
// In message-handler.ts
if (message.attachments.size > 0) {
  const images = message.attachments
    .filter((a) => a.contentType?.startsWith("image/"))
    .map((a) => ({
      type: "image" as const,
      source: {
        type: "url" as const,
        url: a.url,
      },
    }));

  // Add to Claude message content
  messages.push({
    role: "user",
    content: [...images, { type: "text", text: message.content }],
  });
}
```

## License

MIT
