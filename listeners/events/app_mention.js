import { InMemorySessionService, Runner, stringifyContent } from '@google/adk';
import { rootAgent } from '../../ai/index.js';
import { feedbackBlock } from '../views/feedback_block.js';
import { ticketActionsBlock } from '../views/ticket_actions.js';

// Create session service and runner for Google ADK
const sessionService = new InMemorySessionService();
const runner = new Runner({
  appName: 'slack-assistant',
  agent: rootAgent,
  sessionService,
});

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
 */
export async function runAgentWithMessage({ channel, thread_ts, user, text, client, team }) {
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
  });

  // Create or get a session for this thread
  const sessionId = `${channel}-${thread_ts}`;
  let session = await sessionService.getSession({
    appName: 'slack-assistant',
    userId: user,
    sessionId,
  });
  if (!session) {
    session = await sessionService.createSession({
      appName: 'slack-assistant',
      userId: user,
      sessionId,
    });
  }

  // Run the agent with the user's message
  const events = runner.runAsync({
    userId: user,
    sessionId: session.id,
    newMessage: {
      role: 'user',
      parts: [{ text }],
    },
  });

  // Stream the LLM response to the channel
  const streamer = client.chatStream({
    channel: channel,
    thread_ts: thread_ts,
    recipient_team_id: team,
    recipient_user_id: user,
  });

  // Collect response text to parse stage marker
  let fullResponse = '';

  for await (const event of events) {
    const content = stringifyContent(event);

    if (content) {
      fullResponse += content;
      await streamer.append({
        markdown_text: content,
      });
    }
  }

  // Parse stage marker from response (e.g., [STAGE:preview])
  const stageMatch = fullResponse.match(/\[STAGE:(\w+)\]/);
  const stage = stageMatch ? stageMatch[1] : 'chat';

  // Show Create/Cancel buttons only when in preview stage
  const blocks = stage === 'preview' ? [ticketActionsBlock(sessionId), feedbackBlock] : [feedbackBlock];

  await streamer.stop({ blocks });
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
    const { channel, text, team, user } = event;
    const thread_ts = event.thread_ts || event.ts;

    // Create or get a session for this thread
    const sessionId = `${channel}-${thread_ts}`;
    let session = await sessionService.getSession({
      appName: 'slack-assistant',
      userId: user,
      sessionId,
    });
    if (!session) {
      session = await sessionService.createSession({
        appName: 'slack-assistant',
        userId: user,
        sessionId,
      });
    }

    // Check if session is fresh (no prior conversation history)
    const isFreshSession = session.events.length === 0;

    // Only fetch thread history if session is fresh AND we're in a thread
    // This avoids sending duplicate context when ADK already has the conversation history
    let threadMessages = [];
    if (isFreshSession && event.thread_ts) {
      const thread = await client.conversations.replies({
        channel,
        ts: thread_ts,
        oldest: thread_ts,
      });
      // Exclude current message to avoid duplication
      threadMessages = (thread.messages || []).filter((msg) => msg.ts !== event.ts);
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
    const threadContext = threadMessages.map((message) => `${message.user}: ${message.text}`).join('\n');
    const userInput = threadContext ? `${threadContext}\n${text}` : text;

    await runAgentWithMessage({
      channel,
      thread_ts,
      user,
      text: userInput,
      client,
      team,
    });
  } catch (e) {
    logger.error(e);

    // Send message to advise user and clear processing status if a failure occurs
    await say({ text: `Sorry, something went wrong! ${e}` });
  }
};
