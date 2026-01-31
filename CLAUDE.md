# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-enabled Slack Assistant built on **Bolt for JavaScript v4** using Socket Mode. Responds to @mentions, DMs, and Assistant thread events with streaming LLM responses. Uses **Google ADK** with OpenRouter for LLM integration.

## Commands

```bash
npm start        # Run the app (node app.js)
npm run lint     # Check code with Biome
npm run lint:fix # Auto-fix formatting/linting
npm run check    # Type-check with TypeScript (JSDoc-based, no compilation)
```

For development with Slack CLI: `slack run`

## Architecture

### Entry Point & Event Flow

1. `app.js` - Initializes Bolt app with Socket Mode
2. `listeners/index.js` - Registers three listener categories:
   - `assistant/*` - Assistant container interactions (DMs, threads)
   - `events/*` - Workspace events (`app_mention`)
   - `actions/*` - Block Kit interactive components (`feedback`)
3. `ai/index.js` - Google ADK agent with OpenRouter backend

### Assistant Registration Pattern

```javascript
const assistant = new Assistant({
  threadStarted: assistantThreadStarted,
  threadContextChanged: assistantThreadContextChanged,
  userMessage: message,
})
app.assistant(assistant)
```

### Streaming Response Pattern

```javascript
const result = await rootAgent.run(text)
const streamer = client.chatStream({ channel, thread_ts })
for await (const chunk of result) {
  await streamer.append({ markdown_text: chunk })
}
await streamer.stop({ blocks: [feedbackBlock] })
```

## Environment Variables

Required in `.env`:

- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-)
- `SLACK_APP_TOKEN` - App-Level Token with `connections:write` (xapp-)
- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_BASE_URL` - OpenRouter base URL

## Code Conventions

- **ES Modules** - Uses `type: "module"` in package.json; include `.js` extensions in imports
- **Biome formatting** - 2-space indentation, single quotes, 120 line width
- **JSDoc types** - Types come from `@slack/bolt`, `@slack/types`, `@slack/web-api`
- **Listener organization** - Each listener exports its callback function; each category has `index.js` that registers with `app`
- **Block Kit views** - Exported as objects in `listeners/views/`

## Key Integration Points

- `client.assistant.threads.setStatus()` - Show loading state with custom messages
- `client.assistant.threads.setTitle()` - Set thread title from first message
- `client.chatStream()` - Stream responses (use instead of `chat.postMessage` for LLM output)
- `saveThreadContext()` / `getThreadContext()` - Persist thread context when channel changes

## Rules

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
