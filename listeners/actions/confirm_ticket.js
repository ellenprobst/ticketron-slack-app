import { runAgentWithMessage } from '../events/app_mention.js'

/**
 * Handles the ticket modal submission (callback_id: ticket_modal_submit).
 * Sends the confirmed ticket data back to the agent to trigger creation.
 *
 * @param {Object} params
 * @param {import("@slack/bolt").AckFn<any>} params.ack - Acknowledgement function.
 * @param {Object} params.body - View submission payload.
 * @param {import("@slack/web-api").WebClient} params.client - Slack web client.
 * @param {Object} params.view - The submitted view.
 * @param {import("@slack/logger").Logger} params.logger - Logger instance.
 */
export const confirmTicketCallback = async ({
  ack,
  body,
  client,
  view,
  logger,
}) => {
  try {
    await ack()

    const { channel, thread_ts } = JSON.parse(view.private_metadata)
    const user = body.user.id

    // Extract values from the modal inputs
    const values = view.state.values
    const title = values.ticket_title.title_input.value
    const description = values.ticket_description.description_input.value
    const priority = values.ticket_priority.priority_input.selected_option.value
    const issueType =
      values.ticket_issue_type.issue_type_input.selected_option.value
    const projectKey = values.ticket_project.project_input.value

    const confirmationText = `create it with these details: title="${title}", description="${description}", priority=${priority}, issueType=${issueType}, projectKey=${projectKey}`

    // Send confirmation to agent with the (possibly edited) ticket data
    await runAgentWithMessage({
      channel,
      thread_ts,
      user,
      text: confirmationText,
      client,
      team: body.user.team_id,
    })
  } catch (error) {
    logger.error(`:warning: Error confirming ticket: ${error}`)
  }
}
