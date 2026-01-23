import { cancelTicketCallback } from './cancel_ticket.js';
import { confirmTicketCallback } from './confirm_ticket.js';
import { feedbackActionCallback } from './feedback.js';

/**
 * @param {import("@slack/bolt").App} app
 */
export const register = (app) => {
  app.action('feedback', feedbackActionCallback);
  app.action('confirm_ticket', confirmTicketCallback);
  app.action('cancel_ticket', cancelTicketCallback);
};
