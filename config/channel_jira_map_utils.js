import channelJiraMap from './channel_jira_map.js';

/**
 * @typedef {{ instance: string, project: string, boardUrl: string }} JiraConfig
 */

const URL_RE = /https?:\/\/([^/]+)\/.*?\/projects\/([^/]+)\//;

/**
 * Parses a Jira board URL into instance hostname and project key.
 * @param {string} url
 * @returns {{ instance: string, project: string }}
 */
function parseJiraUrl(url) {
  const m = url.match(URL_RE);
  if (m) return { instance: m[1], project: m[2] };
  // Fallback: return the raw URL as instance
  return { instance: url, project: '' };
}

/**
 * Resolves the Jira config for a given Slack channel name.
 * Falls back to the 'ticketron' entry if no match is found.
 *
 * @param {string} channelName - The Slack channel name (e.g. 'barr-rmp-build').
 * @returns {JiraConfig}
 */
export function getJiraConfig(channelName) {
  const boardUrl = channelJiraMap[channelName] ?? channelJiraMap['ticketron'];
  return { ...parseJiraUrl(boardUrl), boardUrl };
}
