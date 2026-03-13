/**
 * Maps Slack channel name patterns to Jira instance/project config.
 * Resolved in order: exact match → prefix match → default.
 *
 * @type {Array<{match: string, type: 'exact' | 'prefix' | 'default', instance: string, project: string}>}
 */
export default [
  { match: 'eng-', type: 'prefix', instance: 'eng.atlassian.net', project: 'ENG' },
  { match: 'ops-', type: 'prefix', instance: 'ops.atlassian.net', project: 'OPS' },
  { match: 'default', type: 'default', instance: 'ticketron.atlassian.net', project: 'KAN' },
];
