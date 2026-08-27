const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_PAGES = 20;
const CLIENT_INFO = { name: 'site-sage-server', version: '0.1.0' };

let client = null;
let initPromise = null;
let toolSchemas = null;

function getRequestTimeoutMs() {
  const parsed = Number.parseInt(process.env.MCP_REQUEST_TIMEOUT_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function getMaxPages() {
  const parsed = Number.parseInt(process.env.MCP_MAX_PAGES, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
}

function splitCliArgs(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return tokens.map(token => token.replace(/^["']+|["']+$/g, '')).filter(Boolean);
}

async function startConnection() {
  const command = process.env.MCP_SCRAPER_CMD || 'python';
  if (!command) {
    throw new Error('MCP_SCRAPER_CMD environment variable is not set');
  }
  const args = splitCliArgs(process.env.MCP_SCRAPER_ARGS);

  // We added the 'env' and 'cwd' options here so Python launches in the right folder!
  const transport = new StdioClientTransport({ 
    command, 
    args,
    options: {
      cwd: process.cwd(),
      env: { ...process.env }
    }
  });
  
  const nextClient = new Client(CLIENT_INFO);

  nextClient.onclose = () => {
    if (client === nextClient) {
      client = null;
      initPromise = null;
      toolSchemas = null;
    }
  };

  client = nextClient;
  await nextClient.connect(transport);
  await loadToolSchemas(nextClient);
}

function ensureConnection() {
  if (!initPromise) {
    initPromise = startConnection().catch(async err => {
      await closeScraper();
      throw err;
    });
  }
  return initPromise;
}

async function loadToolSchemas(mcpClient) {
  const result = await mcpClient.listTools(undefined, { timeout: getRequestTimeoutMs() });
  toolSchemas = {};
  for (const tool of (result && result.tools) || []) {
    if (tool && tool.name) toolSchemas[tool.name] = tool.inputSchema || {};
  }
  if (!toolSchemas.scrape_links || !toolSchemas.scrape_read) {
    const available = Object.keys(toolSchemas).join(', ') || 'none';
    throw new Error(`Scraper is missing required tools (needs scrape_links and scrape_read, exposes: ${available})`);
  }
  return toolSchemas;
}

function pickArgumentName(schema, candidates) {
  const properties = (schema && schema.properties) || {};
  return candidates.find(name => Object.prototype.hasOwnProperty.call(properties, name)) || null;
}

function extractTextContent(result) {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n');
}

async function callTool(name, args) {
  await ensureConnection();
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: getRequestTimeoutMs() }
  );
  if (result && result.isError) {
    throw new Error(extractTextContent(result) || `Tool '${name}' reported an error`);
  }
  return extractTextContent(result);
}

function assertHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http(s) URLs are supported: ${value}`);
  }
  return parsed;
}

function isSameSite(candidateUrl, baseUrl) {
  const hostA = new URL(candidateUrl).hostname.toLowerCase().replace(/^www\./, '');
  const hostB = new URL(baseUrl).hostname.toLowerCase().replace(/^www\./, '');
  return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
}

function extractUrls(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s"'<>\]\\]+/g) || [];
  return matches.map(url => url.replace(/[.,;:!?'")\]]+$/, ''));
}

async function scrapeLinks(pageUrl) {
  assertHttpUrl(pageUrl);
  const schema = toolSchemas.scrape_links;
  const args = { [pickArgumentName(schema, ['url', 'page_url', 'target_url']) || 'url']: pageUrl };

  const sameDomainKey = pickArgumentName(schema, ['same_domain_only', 'sameDomainOnly', 'restrict_to_same_domain', 'follow_same_domain_only']);
  if (sameDomainKey) args[sameDomainKey] = true;

  const includeExternalKey = pickArgumentName(schema, ['include_external']);
  if (includeExternalKey) args[includeExternalKey] = false;

  const maxPagesKey = pickArgumentName(schema, ['max_pages', 'limit']);
  if (maxPagesKey) args[maxPagesKey] = getMaxPages();

  return callTool('scrape_links', args);
}

async function scrapeRead(pageUrl) {
  assertHttpUrl(pageUrl);
  const schema = toolSchemas.scrape_read;
  const args = { [pickArgumentName(schema, ['url', 'page_url', 'target_url']) || 'url']: pageUrl };
  return callTool('scrape_read', args);
}

async function scrapeSite(url) {
  const base = assertHttpUrl(url);
  await ensureConnection();

  const linksText = await scrapeLinks(base.href);
  const sameSiteLinks = extractUrls(linksText).filter(link => isSameSite(link, base.href));
  const uniqueUrls = [...new Set([base.href, ...sameSiteLinks])].slice(0, getMaxPages());

  const pages = [];

  for (const pageUrl of uniqueUrls) {
    try {
      pages.push({
        sourceUrl: pageUrl,
        text: await scrapeRead(pageUrl)
      });
    } catch (err) {
      console.error(`mcpClient: failed to scrape ${pageUrl}: ${err.message}`);
    }
  }

  return pages;
}

async function closeScraper() {
  const current = client;
  client = null;
  initPromise = null;
  toolSchemas = null;

  if (!current) return;

  try {
    await Promise.race([
      current.close(),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  } catch {}

  try {
    const pid = current.transport && current.transport.pid;
    if (typeof pid === 'number') process.kill(pid, 'SIGKILL');
  } catch {}
}

module.exports = {
  scrapeSite,
  scrapeLinks,
  scrapeRead,
  closeScraper
};
