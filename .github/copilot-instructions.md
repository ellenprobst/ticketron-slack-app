# Copilot Instructions for Ticketron Bolt.js Assistant

## Project Overview
AI-enabled Slack Assistant built on **Bolt for JavaScript v4** with **OpenAI integration**. Uses Socket Mode (no public endpoints) to respond to mentions, DMs, and Assistant thread events with streaming LLM responses.

## Architecture & Core Components

### Event Flow
1. **Entry**: [app.js](../app.js) initializes Bolt app with Socket Mode
2. **Registration**: [listeners/index.js](../listeners/index.js) registers three listener categories:
   - `assistant/*` - Assistant container interactions (DMs, threads)
   - `events/*` - Workspace events (`app_mention`)
   - `actions/*` - Block Kit interactive components (`feedback`)
3. **AI Integration**: [ai/index.js](../ai/index.js) provides OpenAI client and system prompt

### Key Patterns

**Assistant Registration** ([listeners/assistant/index.js](../listeners/assistant/index.js)):
```javascript
const assistant = new Assistant({
  threadStarted: assistantThreadStarted,
  threadContextChanged: assistantThreadContextChanged,
  userMessage: message,
});
app.assistant(assistant);
```
This is Bolt's declarative Assistant API - handlers receive context-aware utilities like `say`, `setTitle`, `setStatus`.

**Streaming Responses** (used in [app_mention.js](../listeners/events/app_mention.js) and [message.js](../listeners/assistant/message.js)):
```javascript
const llmResponse = await openai.responses.create({ model: 'gpt-4o-mini', input, stream: true });
const streamer = client.chatStream({ channel, thread_ts });
for await (const chunk of llmResponse) {
  await streamer.append({ markdown_text: chunk.delta });
}
await streamer.stop({ blocks: [feedbackBlock] });
```
**Always** use `chatStream` for LLM responses. The `stop()` method attaches feedback buttons.

**Thread Context Persistence**: Assistant threads track context (channel_id) via `saveThreadContext()` / `getThreadContext()`. Initial message in `assistant_thread_started.js` establishes this - don't remove the `say('Hi...')` call.

## Environment & Development

**Required Environment Variables** (`.env`):
- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-)
- `SLACK_APP_TOKEN` - App-Level Token with `connections:write` (xapp-)
- `OPENAI_API_KEY` - OpenAI API key
- Optional: `SLACK_API_URL` (defaults to production)

**Run Commands**:
- `npm start` - Start the app (no build step)
- `npm run lint` - Check code with Biome
- `npm run lint:fix` - Auto-fix formatting/linting
- `npm run check` - Type-check with TypeScript (JSDoc-based, no compilation)

**Module System**: ES Modules (`type: "module"` in package.json). Use `.js` extensions in imports.

## Conventions

**Listener Organization**:
- Each listener exports its callback function (e.g., `assistantThreadStarted`)
- Each category has `index.js` that registers listeners with `app`
- Callback naming: `{eventName}Callback` or `{eventName}` (e.g., `appMentionCallback`)

**Error Handling**: Wrap async code in try/catch. Log errors with `logger.error()` and send user-facing message via `say()` or `client.chat.postEphemeral()`.

**Block Kit Views**: Exported as objects in `listeners/views/` (see [feedback_block.js](../listeners/views/feedback_block.js)).

**Formatting**: 
- Biome enforces 2-space indentation, single quotes, 120 line width
- JSDoc comments on all exported functions with parameter types from `@slack/bolt`, `@slack/types`

## Integration Points

**Slack API Methods**:
- `client.assistant.threads.setStatus()` - Show loading state
- `client.assistant.threads.setTitle()` - Set thread title from first message
- `client.chatStream()` - Stream responses (replaces `client.chat.postMessage` for LLM output)
- `client.conversations.history()` - Fetch channel history (requires app to be member via `conversations.join`)

**OpenAI**: Uses `openai.responses.create()` with streaming. System prompt in `DEFAULT_SYSTEM_CONTENT` includes Slack-specific instructions (preserve `<@USER_ID>` syntax, convert markdown to Slack format).

## Critical Notes

- **Permissions**: Manifest requires `assistant:write`, `app_mentions:read`, and history scopes for channels/groups/IMs
- **Context Changes**: `assistant_thread_context_changed` fires when user switches channels - must call `saveThreadContext()` to update
- **Not a Slack Function**: This is a classic Bolt app, not a Slack CLI workflow/function - no deno, triggers, or datastores
- **Suggested Prompts**: Set in `assistant_thread_started` using `setSuggestedPrompts()` - only shown in DM context (no channel_id)
