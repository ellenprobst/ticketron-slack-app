import { runAgentWithMessage } from '../events/app_mention.js'

/**
 * Handles the "Create Ticket" button click.
 * Sends a confirmation message to the agent to trigger actual ticket creation.
 *
 * @param {Object} params
 * @param {import("@slack/bolt").AckFn<any>} params.ack - Acknowledgement function.
 * @param {import("@slack/bolt").SlackAction} params.body - Action payload.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {import("@slack/logger").Logger} params.logger - Logger instance.
 */
export const confirmTicketCallback = async ({ ack, body, client, logger }) => {
  try {
    await ack()
    console.log({ body })
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
    logger.error(`:warning: Error confirming ticket: ${error}`)
  }
}
