import { InMemorySessionService, Runner, stringifyContent } from '@google/adk'
import { getAgent } from '../../ai/index.js'
import { feedbackBlock } from '../views/feedback_block.js'
import { downloadImages } from './download_images.js'
import { ticketActionsBlock } from '../views/ticket_actions.js'

// Session service for Google ADK (created immediately - no external deps)
const sessionService = new InMemorySessionService()

// Promise-based singleton to prevent race conditions on concurrent first calls.
/** @type {Promise<Runner> | null} */
let runnerPromise = null

/**
 * Get the runner, creating it lazily on first use.
 * Safe to call concurrently — only one Runner is ever created.
 * @returns {Promise<Runner>}
 */
async function getRunner() {
  if (!runnerPromise) {
    runnerPromise = getAgent().then(
      (agent) =>
        new Runner({
          appName: 'slack-assistant',
          agent,
          sessionService,
        }),
    )
    runnerPromise.catch(() => { runnerPromise = null })
  }
  return runnerPromise
}

/**
 * Runs the agent with a message and streams the response.
 * Extracted for reuse by action handlers (e.g., confirm_ticket).
 *
 * @param {Object} params
 * @param {string} params.channel - The channel ID.
 * @param {string} params.thread_ts - The thread timestamp.
 * @param {string} params.user - The user ID.
 * @param {string} params.text - The message text.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {string} [params.team] - The team ID.
 * @param {Array<{mimeType: string, data: string}>} [params.images] - Base64-encoded images.
 */
export async function runAgentWithMessage({
  channel,
  thread_ts,
  user,
  text,
  client,
  team,
  images,
}) {
  try {
    console.log(
      '\x1b[36m%s\x1b[0m',
      `[runAgentWithMessage] Started — channel=${channel} user=${user} thread_ts=${thread_ts} team=${team}`,
    )

    // Set the app's loading state while waiting for the LLM response
    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: thread_ts,
      status: 'thinking...',
      loading_messages: [
        'Teaching the hamsters to type faster…',
        'Untangling the internet cables…',
        'Consulting the office goldfish…',
        'Polishing up the response just for you…',
        'Convincing the AI to stop overthinking…',
      ],
    })

    // Create or get a session for this thread
    const sessionId = `${channel}-${thread_ts}`
    let session = await sessionService.getSession({
      appName: 'slack-assistant',
      userId: user,
      sessionId,
    })
    if (!session) {
      console.log(
        '\x1b[33m%s\x1b[0m',
        `[runAgentWithMessage] Creating new session: ${sessionId}`,
      )
      session = await sessionService.createSession({
        appName: 'slack-assistant',
        userId: user,
        sessionId,
      })
    } else {
      console.log(
        '\x1b[32m%s\x1b[0m',
        `[runAgentWithMessage] Reusing existing session: ${sessionId}`,
      )
    }
    // Run the agent with the user's message
    const agentRunner = await getRunner()
    /** @type {Array<Object>} */
    const parts = [{ text: text || 'Describe this image' }]
    if (images?.length) {
      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
      }
    }
    const events = agentRunner.runAsync({
      userId: user,
      sessionId: session.id,
      newMessage: {
        role: 'user',
        parts,
      },
    })
    // Process agent events: show each intermediate step as a status update,
    // then stream only the final response to the user as a message.
    let fullResponse = ''
    console.log(
      '\x1b[35m%s\x1b[0m',
      '[runAgentWithMessage] Streaming agent response…',
    )

    for await (const event of events) {
      const content = stringifyContent(event)

      if (content) {
        fullResponse = content
        const status = content
          .replace(/\*\*/g, '')
          .replace(/\n/g, ' ')
          .slice(0, 100)
        await client.assistant.threads.setStatus({
          channel_id: channel,
          thread_ts: thread_ts,
          status,
        })
      }
    }

    // Parse the JSON response from the agent
    let agentResponse
    try {
      agentResponse = JSON.parse(fullResponse)
    } catch {
      // Fallback for non-JSON responses
      console.log(
        '\x1b[33m%s\x1b[0m',
        '[runAgentWithMessage] Response is not valid JSON, treating as chat',
      )
      agentResponse = { stage: 'chat', message: fullResponse }
    }

    const { stage = 'chat', message, ticket } = agentResponse
    const displayMessage = message || fullResponse

    console.log(
      '\x1b[34m%s\x1b[0m',
      `[runAgentWithMessage] Stage: ${stage}, Message: "${displayMessage.slice(0, 100)}${displayMessage.length > 100 ? '…' : ''}"`,
    )
    if (ticket) {
      console.log(
        '\x1b[35m%s\x1b[0m',
        `[runAgentWithMessage] Ticket draft: ${ticket.title}`,
      )
    }

    // Stream the message (not the raw JSON) to the channel
    const streamer = client.chatStream({
      channel: channel,
      thread_ts: thread_ts,
      recipient_team_id: team,
      recipient_user_id: user,
    })
    await streamer.append({ markdown_text: displayMessage })

    // Show Create/Cancel buttons only when in draft stage
    // Pass ticket data in the button value for the modal.
    // Slack enforces a 2000-char limit on button values, so truncate the
    // description field if the serialised payload would exceed that limit.
    let blocks
    if (stage === 'draft' && ticket) {
      const SLACK_VALUE_LIMIT = 2000
      let safeTicket = ticket
      let buttonData = JSON.stringify({ sessionId, ticket: safeTicket })
      if (buttonData.length > SLACK_VALUE_LIMIT && safeTicket.description) {
        const overhead = buttonData.length - safeTicket.description.length
        const maxDescLen = Math.max(0, SLACK_VALUE_LIMIT - overhead - 3) // 3 for '...'
        safeTicket = { ...safeTicket, description: safeTicket.description.slice(0, maxDescLen) + '...' }
        buttonData = JSON.stringify({ sessionId, ticket: safeTicket })
      }
      console.log(
        '\x1b[36m%s\x1b[0m',
        `[runAgentWithMessage] Adding ticket action buttons (dataLen=${buttonData.length})`,
      )
      blocks = [ticketActionsBlock(buttonData), feedbackBlock]
    } else {
      blocks = [feedbackBlock]
    }

    await streamer.stop({ blocks })
    console.log(
      '\x1b[32m%s\x1b[0m',
      `[runAgentWithMessage] Done — stage: ${stage}`,
    )
  } catch (error) {
    console.log(
      '\x1b[31m%s\x1b[0m',
      `[runAgentWithMessage] ERROR: ${error.message}`,
    )
    console.error(error)
    // Post the error to the channel — do not re-throw; callers (appMentionCallback,
    // confirmTicketCallback) each have their own catch that would post a second message.
    try {
      await client.chat.postMessage({
        channel: channel,
        thread_ts: thread_ts,
        text: `Sorry, something went wrong! ${error}`,
      })
    } catch (postError) {
      console.error('[runAgentWithMessage] Failed to post error message:', postError)
    }
  }
}

/**
 * The `appMentionCallback` event handler allows your app to receive message
 * events that directly mention your app. The app must be a member of the
 * channel/conversation to receive the event. Messages in a DM with your app
 * will not dispatch this event, event if the message mentions your app.
 *
 * @param {Object} params
 * @param {import("@slack/types").AppMentionEvent} params.event - The app mention event.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {import("@slack/logger").Logger} params.logger - Logger instance.
 * @param {import("@slack/bolt").SayFn} params.say - Function to send messages.
 *
 * @see {@link https://docs.slack.dev/reference/events/app_mention/}
 */
export const appMentionCallback = async ({ event, client, logger, say }) => {
  try {
    const { channel, text, team, user } = event
    const thread_ts = event.thread_ts || event.ts
    console.log(
      '\x1b[36m%s\x1b[0m',
      `\n━━━ [appMention] New mention from user=${user} in channel=${channel} ━━━`,
    )
    console.log(
      '\x1b[90m%s\x1b[0m',
      `[appMention] thread_ts=${thread_ts} (isThread=${!!event.thread_ts})`,
    )
    // Create or get a session for this thread
    const sessionId = `${channel}-${thread_ts}`
    let session = await sessionService.getSession({
      appName: 'slack-assistant',
      userId: user,
      sessionId,
    })
    if (!session) {
      session = await sessionService.createSession({
        appName: 'slack-assistant',
        userId: user,
        sessionId,
      })
    }

    // Check if session is fresh (no prior conversation history)
    const isFreshSession = session.events.length === 0
    console.log(
      '\x1b[33m%s\x1b[0m',
      `[appMention] Session fresh=${isFreshSession} (events=${session.events.length})`,
    )

    // Only fetch thread history if session is fresh AND we're in a thread
    // This avoids sending duplicate context when ADK already has the conversation history
    let threadMessages = []
    if (isFreshSession && event.thread_ts) {
      const thread = await client.conversations.replies({
        channel,
        ts: thread_ts,
        oldest: thread_ts,
      })

      // Exclude current message to avoid duplication
      threadMessages = (thread.messages || []).filter(
        (msg) => msg.ts !== event.ts,
      )
      console.log(
        '\x1b[35m%s\x1b[0m',
        `[appMention] Fetched ${threadMessages.length} prior thread messages`,
      )
    }

    // We only fetch Slack's thread history on the FIRST interaction (when
    // session.events is empty) to give ADK the initial context. After that,
    // ADK remembers the conversation itself. (through InMemorySessionService)
    //
    // NOTE: We're using InMemorySessionService, which stores sessions in Node.js
    // memory. If the app restarts, all session history is lost. However, this isn't
    // a big problem for us - when a new session starts, we re-fetch the thread
    // history from Slack (see the isFreshSession check above). The Slack thread
    // itself acts as our "backup", so the conversation context is always recoverable.
    const threadContext = threadMessages
      .map((message) => `${message.user}: ${message.text}`)
      .join('\n')
    const userInput = threadContext ? `${threadContext}\n${text}` : text

    // const images = await downloadImages({
    //   threadMessages,
    //   event,
    //   token: client.token,
    // })
    const images = [] // Disable image downloading for now to avoid issues with ADK vision requests

    console.log(
      '\x1b[34m%s\x1b[0m',
      `[appMention] Calling runAgentWithMessage (inputLength=${userInput.length}, images=${images.length})`,
    )

    await runAgentWithMessage({
      channel,
      thread_ts,
      user,
      text: userInput,
      client,
      team,
      images: images.length > 0 ? images : undefined,
    })
  } catch (e) {
    console.log('\x1b[31m%s\x1b[0m', `[appMention] ERROR: ${e.message}`)
    logger.error(e)

    // Send message to advise user and clear processing status if a failure occurs
    await say({ text: `Sorry, something went wrong! ${e}` })
  }
}
