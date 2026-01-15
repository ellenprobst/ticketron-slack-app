import { GOOGLE_SEARCH, LlmAgent } from '@google/adk'

// LLM system prompt
export const DEFAULT_SYSTEM_CONTENT = `You're an assistant in a Slack workspace.
Users in the workspace will ask you to help them write something or to think better about a specific topic.
You'll respond to those questions in a professional way.
When you include markdown text, convert them to Slack compatible ones.
When a prompt has Slack's special syntax like <@USER_ID> or <#CHANNEL_ID>, you must keep them as-is in your response.`

export const rootAgent = new LlmAgent({
  name: 'search_assistant',
  description: 'An assistant that can search the web.',
  model: 'openrouter/anthropic/claude-sonnet-4-5',
  api_base: process.env.OPENROUTER_BASE_URL,
  api_key: process.env.OPENROUTER_API_KEY,
  instruction: DEFAULT_SYSTEM_CONTENT,
  tools: [GOOGLE_SEARCH],
})
