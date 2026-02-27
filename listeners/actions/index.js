import { cancelTicketCallback } from './cancel_ticket.js'
import { confirmTicketCallback } from './confirm_ticket.js'
import { createTicketCallback } from './create_ticket.js'
import { feedbackActionCallback } from './feedback.js'
import { openTicketModalCallback } from './open_ticket_modal.js'

/**
 * @param {import("@slack/bolt").App} app
 */
export const register = (app) => {
  app.action('feedback', feedbackActionCallback)
  app.action('create_ticket', createTicketCallback)
  app.action('cancel_ticket', cancelTicketCallback)
  app.action('open_ticket_modal', openTicketModalCallback)
  app.view('ticket_modal_submit', confirmTicketCallback)
}
