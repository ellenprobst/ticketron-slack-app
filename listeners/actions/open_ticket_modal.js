import { ticketModalView } from '../views/ticket_actions.js';

/**
 * Handles the "Create Ticket" button click by opening the ticket modal.
 * The button value contains JSON with sessionId and ticket draft data.
 *
 * @param {Object} params
 * @param {import("@slack/bolt").AckFn<any>} params.ack
 * @param {import("@slack/bolt").SlackAction} params.body
 * @param {import("@slack/web-api").WebClient} params.client
 * @param {import("@slack/logger").Logger} params.logger
 */
export const openTicketModalCallback = async ({ ack, body, client, logger }) => {
  try {
    await ack();

    if (body.type !== 'block_actions') return;

    const action = body.actions[0];
    const { sessionId, ticket } = JSON.parse(action.value);

    const message = /** @type {any} */ (body).message;
    const channel = body.channel.id;
    const thread_ts = message.thread_ts || message.ts;

    // Pass channel/thread info through private_metadata so the submission handler can post back
    const privateMetadata = JSON.stringify({ sessionId, channel, thread_ts });

    await client.views.open({
      trigger_id: body.trigger_id,
      view: ticketModalView(ticket, privateMetadata),
    });
  } catch (error) {
    logger.error(`:warning: Error opening ticket modal: ${error}`);
  }
};
