/**
 * Creates a Block Kit actions block with Create Ticket and Cancel buttons.
 *
 * @param {string} sessionId - The session ID to pass to action handlers.
 * @returns {import("@slack/bolt").types.ActionsBlock}
 */
export function ticketActionsBlock(sessionId) {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Create Ticket' },
        style: 'primary',
        action_id: 'confirm_ticket',
        value: sessionId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Cancel' },
        action_id: 'cancel_ticket',
        value: sessionId,
      },
    ],
  };
}
