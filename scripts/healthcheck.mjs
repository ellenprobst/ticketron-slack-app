/**
 * Healthcheck script to verify Atlassian MCP connection and Jira project access.
 *
 * Usage: node scripts/healthcheck.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TIMEOUT_MS = 30_000;

async function healthcheck() {
  console.log('1. Connecting to Atlassian MCP server...');

  const client = new Client({ name: 'healthcheck', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.atlassian.com/v1/sse'],
  });

  const timeout = setTimeout(() => {
    console.error('FAIL: Connection timed out after 30s');
    process.exit(1);
  }, TIMEOUT_MS);

  try {
    await client.connect(transport);
    console.log('   OK: Connected\n');

    console.log('2. Listing available tools...');
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);
    console.log(`   OK: ${toolNames.length} tools available`);

    const jiraTools = toolNames.filter((n) => n.toLowerCase().includes('jira'));
    console.log(`   Jira tools: ${jiraTools.join(', ')}\n`);

    console.log('3. Fetching visible Jira projects...');
    const projectsResult = await client.callTool({
      name: 'getVisibleJiraProjects',
      arguments: {
        cloudId: process.env.ATLASSIAN_SITE_URL || 'https://ticketron-play.atlassian.net',
      },
    });

    const content = projectsResult.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        console.log(`   OK: ${parsed.length} projects found`);
        for (const project of parsed.slice(0, 5)) {
          console.log(`   - ${project.key}: ${project.name}`);
        }
      } else {
        console.log('   Response:', content.slice(0, 500));
      }
    } else {
      console.log('   Response:', JSON.stringify(projectsResult).slice(0, 500));
    }

    console.log('\nHealthcheck PASSED');
  } catch (error) {
    console.error(`\nHealthcheck FAILED: ${error.message}`);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
    await client.close().catch(() => {});
    process.exit(0);
  }
}

healthcheck();
