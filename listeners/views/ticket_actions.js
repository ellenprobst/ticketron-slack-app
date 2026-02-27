/**
 * Creates a Block Kit actions block with an "Open Ticket Modal" button.
 * The button value carries the ticket data so the modal can be pre-filled.
 *
 * @param {string} buttonData - JSON string with sessionId and ticket data.
 * @returns {import("@slack/bolt").types.ActionsBlock}
 */
export function ticketActionsBlock(buttonData) {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Open Draft Ticket',
        },
        style: 'primary',
        action_id: 'open_ticket_modal',
        value: buttonData,
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Cancel',
        },
        action_id: 'cancel_ticket',
        value: buttonData,
      },
    ],
  }
}

/**
 * Builds the modal view for ticket creation, pre-filled with draft data.
 *
 * @param {Object} ticket - The ticket draft from the agent.
 * @param {string} ticket.title
 * @param {string} ticket.description
 * @param {string} ticket.priority
 * @param {string} ticket.issueType
 * @param {string} ticket.projectKey
 * @param {string} privateMetadata - JSON string passed through to the submission handler.
 * @returns {import("@slack/types").View}
 */
export function ticketModalView(ticket, privateMetadata) {
  return {
    type: 'modal',
    callback_id: 'ticket_modal_submit',
    private_metadata: privateMetadata,
    title: {
      type: 'plain_text',
      text: 'New Ticket Draft',
    },
    submit: {
      type: 'plain_text',
      text: 'Create Ticket',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'input',
        block_id: 'ticket_title',
        label: { type: 'plain_text', text: 'Title' },
        element: {
          type: 'plain_text_input',
          action_id: 'title_input',
          initial_value: ticket.title || '',
        },
      },
      {
        type: 'input',
        block_id: 'ticket_description',
        label: { type: 'plain_text', text: 'Description' },
        element: {
          type: 'plain_text_input',
          action_id: 'description_input',
          multiline: true,
          initial_value: ticket.description || '',
        },
      },
      {
        type: 'input',
        block_id: 'ticket_priority',
        label: { type: 'plain_text', text: 'Priority' },
        element: {
          type: 'static_select',
          action_id: 'priority_input',
          initial_option: {
            text: { type: 'plain_text', text: ticket.priority || 'Medium' },
            value: ticket.priority || 'Medium',
          },
          options: ['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((p) => ({
            text: { type: 'plain_text', text: p },
            value: p,
          })),
        },
      },
      {
        type: 'input',
        block_id: 'ticket_issue_type',
        label: { type: 'plain_text', text: 'Issue Type' },
        element: {
          type: 'static_select',
          action_id: 'issue_type_input',
          initial_option: {
            text: { type: 'plain_text', text: ticket.issueType || 'Task' },
            value: ticket.issueType || 'Task',
          },
          options: ['Bug', 'Task', 'Story'].map((t) => ({
            text: { type: 'plain_text', text: t },
            value: t,
          })),
        },
      },
      {
        type: 'input',
        block_id: 'ticket_project',
        label: { type: 'plain_text', text: 'Project Key' },
        element: {
          type: 'plain_text_input',
          action_id: 'project_input',
          initial_value: ticket.projectKey || 'KAN',
        },
      },
    ],
  }
}
