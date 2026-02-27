import { runAgentWithMessage } from '../events/app_mention.js'

/**
 * Handles the ticket submission from button (callback_id: ticket_submit).
 * Sends the confirmed ticket data back to the agent to trigger creation.
 *
 * @param {Object} params
 * @param {import("@slack/bolt").AckFn<any>} params.ack - Acknowledgement function.
 * @param {Object} params.body - View submission payload.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {import("@slack/logger").Logger} params.logger - Logger instance.
 */
export const createTicketCallback = async ({ ack, body, client, logger }) => {
  try {
    await ack()

    if (body.type !== 'block_actions') {
      return
    }

    const channel = body.channel.id
    const message = /** @type {any} */ (body).message
    const thread_ts = message.thread_ts || message.ts
    const user = body.user.id

    // Remove buttons from message
    await client.chat.update({
      channel,
      ts: message.ts,
      text: message.text,
      blocks: message.blocks.filter(
        (/** @type {any} */ b) => b.type !== 'actions',
      ),
    })

    // Send confirmation to agent (it has the draft in session memory)
    await runAgentWithMessage({
      channel,
      thread_ts,
      user,
      text: 'create it',
      client,
      team: body.user.team_id,
    })
  } catch (error) {
    logger.error(`:warning: Error creating ticket: ${error}`)
  }
}
