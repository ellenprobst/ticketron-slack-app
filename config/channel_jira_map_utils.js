import channelJiraMap from './channel_jira_map.js';

/**
 * @typedef {{ instance: string, project: string }} JiraConfig
 */

/**
 * Resolves the Jira config for a given Slack channel name.
 * Resolution order: exact match → prefix match → default.
 *
 * @param {string} channelName - The Slack channel name (e.g. 'eng-bugs').
 * @returns {JiraConfig}
 */
export function getJiraConfig(channelName) {
  // 1. Exact match
  const exact = channelJiraMap.find((e) => e.type === 'exact' && e.match === channelName);
  if (exact) return { instance: exact.instance, project: exact.project };

  // 2. Prefix match
  const prefix = channelJiraMap.find((e) => e.type === 'prefix' && channelName.startsWith(e.match));
  if (prefix) return { instance: prefix.instance, project: prefix.project };

  // 3. Default fallback
  const fallback = channelJiraMap.find((e) => e.type === 'default');
  if (fallback) return { instance: fallback.instance, project: fallback.project };

  // Should never reach here if map has a default entry
  return { instance: 'ticketron.atlassian.net', project: 'KAN' };
}
