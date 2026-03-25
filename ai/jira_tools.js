import { FunctionTool } from '@google/adk';

/**
 * Build Basic auth + JSON headers using env vars.
 * Supports per-instance overrides via JIRA_EMAIL / JIRA_API_TOKEN,
 * falling back to the existing ATLASSIAN_* vars.
 */
function authHeaders() {
  const email = process.env.JIRA_EMAIL ?? process.env.ATLASSIAN_EMAIL;
  const token = process.env.JIRA_API_TOKEN ?? process.env.ATLASSIAN_API_TOKEN;
  const basic = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Thin fetch wrapper: throws on non-2xx, returns parsed JSON (or null for 204).
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function jiraFetch(url, options = {}) {
  console.log(`[jira] ${options.method ?? 'GET'} ${url}`);
  if (options.body) console.log(`[jira] request body:`, options.body);
  const res = await fetch(url, { ...options, headers: authHeaders() });
  console.log(`[jira] response status: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[jira] error body:`, body);
    throw new Error(`Jira ${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return null;
  const json = await res.json();
  console.log(`[jira] response body:`, JSON.stringify(json, null, 2));
  return json;
}

/**
 * Convert a markdown string to the minimal ADF structure Jira API v3 requires.
 * This preserves the text content; full markdown rendering is handled by Jira's renderer.
 * @param {string} text
 */
function toAdf(text) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

// ---------------------------------------------------------------------------
// Tool: getVisibleJiraProjects
// ---------------------------------------------------------------------------
export const getVisibleJiraProjects = new FunctionTool({
  name: 'getVisibleJiraProjects',
  description: 'List all Jira projects visible to the authenticated user.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance, e.g. https://myorg.atlassian.net',
      },
    },
    required: ['jiraBaseUrl'],
  },
  execute: async ({ jiraBaseUrl }) => {
    const data = await jiraFetch(`${jiraBaseUrl}/rest/api/3/project/search?maxResults=100&orderBy=name`);
    return (data.values ?? []).map((p) => ({
      key: p.key,
      name: p.name,
      id: p.id,
      type: p.projectTypeKey,
    }));
  },
});

// ---------------------------------------------------------------------------
// Tool: getJiraProjectIssueTypesMetadata
// ---------------------------------------------------------------------------
export const getJiraProjectIssueTypesMetadata = new FunctionTool({
  name: 'getJiraProjectIssueTypesMetadata',
  description: 'Return the issue types available for a given Jira project.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance.',
      },
      projectKey: {
        type: 'string',
        description: 'The Jira project key, e.g. KAN.',
      },
    },
    required: ['jiraBaseUrl', 'projectKey'],
  },
  execute: async ({ jiraBaseUrl, projectKey }) => {
    const data = await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
    return (data.issueTypes ?? []).map((t) => ({ id: t.id, name: t.name, subtask: t.subtask }));
  },
});

// ---------------------------------------------------------------------------
// Tool: searchJiraIssuesUsingJql
// ---------------------------------------------------------------------------
export const searchJiraIssuesUsingJql = new FunctionTool({
  name: 'searchJiraIssuesUsingJql',
  description: 'Search Jira issues using a JQL query string.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance.',
      },
      jql: {
        type: 'string',
        description: 'A valid JQL query string.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 20).',
      },
      fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Field names to include in each result (default: summary, status, priority, issuetype, parent).',
      },
    },
    required: ['jiraBaseUrl', 'jql'],
  },
  execute: async ({ jiraBaseUrl, jql, maxResults = 20, fields }) => {
    const resolvedFields = (fields ?? ['summary', 'status', 'priority', 'issuetype', 'parent', 'assignee']).join(',');
    const params = new URLSearchParams({ jql, maxResults: String(maxResults), fields: resolvedFields });
    const data = await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/search?${params}`);
    return (data.issues ?? []).map((i) => ({
      key: i.key,
      id: i.id,
      url: `${jiraBaseUrl}/browse/${i.key}`,
      fields: i.fields,
    }));
  },
});

// ---------------------------------------------------------------------------
// Tool: getJiraIssue
// ---------------------------------------------------------------------------
export const getJiraIssue = new FunctionTool({
  name: 'getJiraIssue',
  description: 'Fetch a single Jira issue by key.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance.',
      },
      issueKey: {
        type: 'string',
        description: 'The issue key, e.g. KAN-42.',
      },
    },
    required: ['jiraBaseUrl', 'issueKey'],
  },
  execute: async ({ jiraBaseUrl, issueKey }) => {
    const i = await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/${issueKey}`);
    return {
      key: i.key,
      id: i.id,
      url: `${jiraBaseUrl}/browse/${i.key}`,
      fields: i.fields,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: createJiraIssue
// ---------------------------------------------------------------------------
export const createJiraIssue = new FunctionTool({
  name: 'createJiraIssue',
  description: 'Create a new Jira issue.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance.',
      },
      projectKey: {
        type: 'string',
        description: 'The Jira project key.',
      },
      summary: {
        type: 'string',
        description: 'Issue title / summary.',
      },
      description: {
        type: 'string',
        description: 'Issue description in markdown.',
      },
      issueType: {
        type: 'string',
        description: 'Issue type name: Bug, Task, or Story.',
      },
      priority: {
        type: 'string',
        description: 'Priority name: Highest, High, Medium, Low, or Lowest.',
      },
      parentKey: {
        type: 'string',
        description: 'Optional parent epic key to link this issue to.',
      },
    },
    required: ['jiraBaseUrl', 'projectKey', 'summary', 'issueType'],
  },
  execute: async ({ jiraBaseUrl, projectKey, summary, description, issueType, priority, parentKey }) => {
    /** @type {Record<string, unknown>} */
    const fields = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
    };
    if (description) fields.description = toAdf(description);
    if (priority) fields.priority = { name: priority };
    if (parentKey) fields.parent = { key: parentKey };

    const created = await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    });
    return {
      key: created.key,
      id: created.id,
      url: `${jiraBaseUrl}/browse/${created.key}`,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: editJiraIssue
// ---------------------------------------------------------------------------
export const editJiraIssue = new FunctionTool({
  name: 'editJiraIssue',
  description: 'Update fields on an existing Jira issue.',
  parameters: {
    type: 'object',
    properties: {
      jiraBaseUrl: {
        type: 'string',
        description: 'Base URL of the Jira instance.',
      },
      issueKey: {
        type: 'string',
        description: 'The issue key to update, e.g. KAN-42.',
      },
      summary: {
        type: 'string',
        description: 'New summary/title.',
      },
      description: {
        type: 'string',
        description: 'New description in markdown.',
      },
      priority: {
        type: 'string',
        description: 'New priority name.',
      },
      issueType: {
        type: 'string',
        description: 'New issue type name.',
      },
      status: {
        type: 'string',
        description: 'Transition the issue to this status name.',
      },
    },
    required: ['jiraBaseUrl', 'issueKey'],
  },
  execute: async ({ jiraBaseUrl, issueKey, summary, description, priority, issueType, status }) => {
    /** @type {Record<string, unknown>} */
    const fields = {};
    if (summary) fields.summary = summary;
    if (description) fields.description = toAdf(description);
    if (priority) fields.priority = { name: priority };
    if (issueType) fields.issuetype = { name: issueType };

    if (Object.keys(fields).length > 0) {
      await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      });
    }

    // Handle status transition separately
    if (status) {
      const { transitions } = await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/${issueKey}/transitions`);
      const transition = transitions?.find((t) => t.name.toLowerCase() === status.toLowerCase());
      if (!transition) throw new Error(`No transition named "${status}" found for ${issueKey}`);
      await jiraFetch(`${jiraBaseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transition.id } }),
      });
    }

    return { key: issueKey, url: `${jiraBaseUrl}/browse/${issueKey}`, updated: true };
  },
});

export const jiraTools = [
  getVisibleJiraProjects,
  getJiraProjectIssueTypesMetadata,
  searchJiraIssuesUsingJql,
  getJiraIssue,
  createJiraIssue,
  editJiraIssue,
];
