/**
 * Handles the "Cancel" button click for ticket creation.
 * Updates the message to indicate cancellation.
 *
 * @param {Object} params
 * @param {import("@slack/bolt").AckFn<any>} params.ack - Acknowledgement function.
 * @param {import("@slack/bolt").SlackAction} params.body - Action payload.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {import("@slack/logger").Logger} params.logger - Logger instance.
 */
export const cancelTicketCallback = async ({ ack, body, client, logger }) => {
  try {
    await ack();

    if (body.type !== 'block_actions') {
      return;
    }

    const message = /** @type {any} */ (body).message;

    await client.chat.update({
      channel: body.channel.id,
      ts: message.ts,
      text: 'Ticket creation cancelled.',
      blocks: [],
    });
  } catch (error) {
    logger.error(`:warning: Error cancelling ticket: ${error}`);
  }
};
