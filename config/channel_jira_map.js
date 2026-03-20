/**
 * Maps Slack channel name patterns to Jira instance/project config.
 * Resolved in order: exact match → prefix match → default.
 *
 * @type {Array<{match: string, type: 'exact' | 'prefix' | 'default', instance: string, project: string}>}
 */
export default {
  'barr-rmp-build':
    'https://firetrail.atlassian.net/jira/software/c/projects/BRMP/boards/304',
  'barr-rmp-build-engineering':
    'https://firetrail.atlassian.net/jira/software/c/projects/BRMP/boards/304',
  'barr-rmp-product-design':
    'https://firetrail.atlassian.net/jira/software/c/projects/BRMP/boards/370',
  'barr-production-issues':
    'https://kablamo.atlassian.net/jira/servicedesk/projects/BRS/queues/custom/199',
  ticketron:
    'https://ticketron.atlassian.net/jira/software/projects/KAN/boards/1',
}
