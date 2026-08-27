# MCP Web Scraper

## Overview

MCP Web Scraper is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that safely fetches webpages over HTTP(S) and extracts structured information from them. It exposes web-scraping capabilities as MCP tools that can be used from any MCP-compatible client, including VS Code with GitHub Copilot.

The project follows a clear pipeline design:

```
MCP tool call  →  fetch.py (URL → HTML)  →  extract.py (HTML → structured data)
```

- `fetch.py` handles all network I/O: URL validation, SSRF protection, streaming downloads, and error handling.
- `extract.py` is a pure, offline layer: it parses HTML with BeautifulSoup/lxml and returns structured data.
- `server.py` wires both layers together as MCP tool definitions via FastMCP.

## Features

- **Five MCP tools** for health checking, reading pages, extracting structured fields, collecting links, and extracting tables.
- **SSRF protection**: refuses to fetch loopback, private, link-local, and other non-global addresses. Redirect targets are re-validated.
- **DNS rebinding / Host header protection**: the deployed endpoint validates incoming `Host` headers against an allowlist to prevent DNS rebinding attacks.
- **Streaming body downloads** with a configurable `max_bytes` limit to prevent memory exhaustion.
- **Deployed on Vercel** as a serverless Python function exposing a Streamable HTTP endpoint.
- **GitHub Copilot prompt shortcuts** for quick scraping tasks from VS Code (`.github/prompts/`).

## MCP Tools

The server exposes five MCP tools:

| Tool | Description |
|---|---|
| `ping` | Health check. Returns `"pong"`. |
| `scrape_read` | Fetch a webpage and return its readable text with navigation, scripts, and styles removed. |
| `scrape_extract` | Fetch a webpage and extract named fields using a map of CSS selectors. |
| `scrape_links` | Fetch a webpage and return its links, with same-domain filtering and pagination. |
| `scrape_tables` | Fetch a webpage and extract the HTML tables found on it. |

### ping

- **Parameters:** none.
- **Returns:** `"pong"`.

### scrape_read

Fetch a webpage and return clean, readable text.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | *required* | Absolute `http://` or `https://` URL. |
| `timeout_seconds` | float | `10.0` | Request timeout in seconds. |
| `max_bytes` | int | `1_000_000` | Maximum bytes to download. |
| `max_chars` | int | `10_000` | Maximum characters of text to return. |

**Returns:** `{"final_url": "...", "status_code": 200, "text": "..."}`

### scrape_extract

Fetch a webpage and extract structured fields using CSS selectors.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | *required* | Absolute `http://` or `https://` URL. |
| `selectors` | dict | *required* | Field names mapped to CSS selectors (see below). |
| `timeout_seconds` | float | `10.0` | Request timeout in seconds. |
| `max_bytes` | int | `1_000_000` | Maximum bytes to download. |

The `selectors` value can be a plain CSS selector string (returns cleaned text of the first match) or an object with optional keys:

- `selector` (string, required) — CSS selector.
- `attr` (string, optional) — return this attribute instead of text. Relative `href`/`src` values are resolved against the page URL.
- `all` (bool, default `false`) — return a list of all matches instead of just the first.

```json
{
  "title": "h1",
  "price": ".price",
  "image": {"selector": "img.hero", "attr": "src"},
  "tags": {"selector": ".tag", "all": true}
}
```

**Returns:** `{"final_url": "...", "status_code": 200, "fields": {"title": "...", "price": "...", ...}}`

Selectors that match nothing return `null` (or an empty list when `all: true`).

### scrape_links

Fetch a webpage and return its links. Links are deduplicated, resolved to absolute URLs, and returned in document order.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | *required* | Absolute `http://` or `https://` URL. |
| `same_domain` | bool | `false` | Only return links whose hostname matches the page hostname. |
| `limit` | int | `100` | Maximum number of links to return. |
| `offset` | int | `0` | Number of matching links to skip before applying `limit`. |
| `timeout_seconds` | float | `10.0` | Request timeout in seconds. |
| `max_bytes` | int | `1_000_000` | Maximum bytes to download. |

**Returns:** `{"final_url": "...", "status_code": 200, "total": N, "links": [{"url": "...", "text": "..."}]}`

Only `http://` and `https://` links are returned; `mailto:`, `javascript:`, `data:`, and fragment-only links are ignored.

### scrape_tables

Fetch a webpage and extract its HTML tables.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | string | *required* | Absolute `http://` or `https://` URL. |
| `timeout_seconds` | float | `10.0` | Request timeout in seconds. |
| `max_bytes` | int | `1_000_000` | Maximum bytes to download. |
| `max_tables` | int | `10` | Maximum number of tables to return. |
| `max_rows` | int | `100` | Maximum data rows per table. |

**Returns:** `{"final_url": "...", "status_code": 200, "tables": [{"headers": ["..."], "rows": [["...", ...]]}]}`

## Project Structure

```
mcp-web-scraper/
├── src/
│   └── web_scraper_mcp/
│       ├── __init__.py
│       ├── fetch.py          # URL → HTML (network layer, SSRF protection)
│       ├── extract.py        # HTML → structured data (pure, offline)
│       └── server.py         # MCP tool definitions (FastMCP)
├── api/
│   └── mcp.py               # Vercel entrypoint: exposes FastMCP as ASGI app
├── test/
│   ├── test_fetch.py         # 11 tests — URL validation, SSRF, streaming, errors
│   ├── test_extract.py       # 14 tests — text, CSS, links, tables, structured
│   ├── test_links.py         # 13 tests — link extraction, pagination, filtering
│   └── test_structured.py    #  6 tests — structured extraction edge cases
├── .github/
│   └── prompts/
│       ├── scrape-read.prompt.md
│       ├── scrape-extract.prompt.md
│       ├── scrape-links.prompt.md
│       └── scrape-tables.prompt.md
├── pyproject.toml            # Project metadata, dependencies, Vercel entrypoint config
├── uv.lock                   # Locked dependency versions (uv)
├── README.md
└── .gitignore
```

## Architecture

```
MCP Client (VS Code, MCP Inspector, etc.)
        │
        ▼
Streamable HTTP endpoint (/mcp)        ← Vercel Serverless Function
        │
        ▼
FastMCP Server  (server.py)
        │
        ├─► ping           (no network)
        │
        ▼
   fetch.py
   URL → HTML             ← httpx streaming, SSRF checks, size limits
        │
        ▼
   extract.py
   HTML → structured data  ← BeautifulSoup + lxml, pure function
```

The MCP server (`server.py`) exposes tools that orchestrate the fetch and extract layers. Each tool that takes a URL first calls `fetch_page()` to get the HTML, then passes the result to the appropriate extraction function. Errors at every layer are converted into clean, user-facing `ValueError` messages.

For local development, the server runs over MCP **stdio** transport (`mcp.run()`). When deployed to Vercel, `api/mcp.py` exposes it as a Streamable HTTP ASGI application (`mcp.streamable_http_app()`).

## Technologies Used

| Technology | Purpose |
|---|---|
| [Python](https://www.python.org/) (≥ 3.10) | Runtime |
| [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) (`mcp[cli]>=1,<2`) | MCP server framework (FastMCP) |
| [httpx](https://www.python-httpx.org/) | Async HTTP client for fetching webpages |
| [BeautifulSoup4](https://www.crummy.com/software/BeautifulSoup/) + [lxml](https://lxml.de/) | HTML parsing and data extraction |
| [pytest](https://docs.pytest.org/) | Test framework |
| [Vercel](https://vercel.com/) | Serverless deployment platform |
| [uv](https://docs.astral.sh/uv/) | Python package management (lockfile) |

## Local Setup

### Prerequisites

- Python 3.10 or newer.

### Installation

Clone the repository and set up a virtual environment:

```bash
git clone https://github.com/<your-org>/mcp-web-scraper.git
cd mcp-web-scraper
```

Using **uv** (recommended):

```bash
uv venv
uv pip install -e .
```

Or using **pip**:

```bash
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# .venv\Scripts\Activate.ps1  # Windows PowerShell
pip install -e .
```

### Running the MCP Server

Start the server over stdio:

```bash
python -m web_scraper_mcp.server
```

This launches the server in stdio mode, intended to be connected to by an MCP client.

### Testing with MCP Inspector

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) provides a browser UI for testing tools interactively:

```bash
mcp dev src/web_scraper_mcp/server.py --with-editable .
```

The `--with-editable .` flag installs the project into Inspector's temporary environment. A browser window opens where you can invoke each tool and inspect responses.

## Testing

The test suite uses [pytest](https://docs.pytest.org/) and runs entirely offline (no real network requests).

```bash
pytest
```

The project currently has **44 tests** across four test files:

| File | Tests | Covers |
|---|---|---|
| `test/test_fetch.py` | 11 | URL validation, SSRF blocking, streaming, timeouts, HTTP errors |
| `test/test_extract.py` | 14 | Readable text, CSS selectors, links, tables, structured extraction |
| `test/test_links.py` | 13 | Link resolution, deduplication, same-domain filtering, pagination |
| `test/test_structured.py` | 6 | Plain selectors, attribute extraction, `all` mode, edge cases |

All tests use mocks or in-memory HTML fixtures. No external services are contacted.

## Vercel Deployment

The project deploys to Vercel as a single serverless Python function.

### How it works

`pyproject.toml` declares the Vercel entrypoint:

```toml
[tool.vercel]
entrypoint = "api.mcp:app"
```

`api/mcp.py` is the Vercel entrypoint. It:

1. Adds the `src/` directory to `sys.path` so the package is importable.
2. Configures DNS rebinding / Host header protection by reading Vercel system environment variables (`VERCEL_URL`, `VERCEL_BRANCH_URL`, etc.) and adding them to the allowed hosts list.
3. Calls `mcp.streamable_http_app()` to produce a Starlette ASGI application that Vercel serves at the `/mcp` path.

Vercel detects the Python runtime from `pyproject.toml` dependencies, installs them, and routes all requests to the ASGI app.

### Environment variables

The following Vercel system environment variables are read by `api/mcp.py` to configure allowed `Host` headers:

| Variable | Source | Description |
|---|---|---|
| `VERCEL_URL` | Vercel system | The deployment hostname (e.g. `project-abc123.vercel.app`). Available at runtime for every deployment. |
| `VERCEL_BRANCH_URL` | Vercel system | The branch-specific URL (e.g. `project-git-main-abc123.vercel.app`). |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel system | The production domain. Set even on preview deployments. |
| `VERCEL_PROJECT_DOMAIN` | User-defined | Optional custom domain. Only effective if manually set in the Vercel project. |

No other environment variables are required.

### Deploying

```bash
vercel deploy
```

Environment variables are injected at deploy time. After changing code or env vars, a new deploy is required.

## Production MCP Endpoint

The Vercel project is linked as `mcp-web-scraper` (project ID `prj_jpawCWFFEqa7C6LCOOi5pljg1s7q`). The MCP endpoint is available at:

```
https://<deployment-url>/mcp
```

Replace `<deployment-url>` with the actual Vercel deployment hostname (found in the Vercel dashboard or in the `VERCEL_URL` environment variable).

## VS Code Integration

### Connecting the MCP server

Add the MCP server to your VS Code MCP configuration (`.vscode/mcp.json` or user settings) to make the tools available to GitHub Copilot and other MCP-aware extensions.

For a **local** stdio connection:

```json
{
  "servers": {
    "web-scraper": {
      "command": "python",
      "args": ["-m", "web_scraper_mcp.server"],
      "cwd": "<path-to-project>"
    }
  }
}
```

For a **remote** HTTP connection (Vercel deployment):

```json
{
  "servers": {
    "web-scraper": {
      "type": "http",
      "url": "https://<deployment-url>/mcp"
    }
  }
}
```

### Custom prompt shortcuts

The project includes four GitHub Copilot custom prompts in `.github/prompts/`. These are invoked as `/` shortcuts in VS Code Copilot Chat:

| Shortcut | Prompt file | What it does |
|---|---|---|
| `/scrape-read` | `scrape-read.prompt.md` | Uses the `scrape_read` tool to fetch and display a webpage's content. |
| `/scrape-extract` | `scrape-extract.prompt.md` | Uses the `scrape_extract` tool to pull structured fields from a webpage. |
| `/scrape-links` | `scrape-links.prompt.md` | Uses the `scrape_links` tool to collect links from a webpage. |
| `/scrape-tables` | `scrape-tables.prompt.md` | Uses the `scrape_tables` tool to extract tables from a webpage. |

Each prompt asks for a URL (if not provided), enforces that only the corresponding MCP tool is used (no Python code, no curl, etc.), and formats the output for readability.

## Usage Examples

**Read a webpage:**

```
Use the scrape_read tool to fetch https://example.com
```

**Extract specific fields from a product page:**

```
Use scrape_extract on https://example.com/product/123 to get the title (h1),
price (.price), and product images (img.product with attr src, all: true).
```

**Collect all links from a page, same domain only:**

```
Use scrape_links on https://docs.example.com with same_domain: true
```

**Extract tables from a Wikipedia page:**

```
Use scrape_tables on https://en.wikipedia.org/wiki/List_of_countries_by_population
```

## Security

### URL validation (`fetch.py`)

- Only `http://` and `https://` schemes are accepted.
- Malformed URLs, missing hostnames, and invalid ports are rejected before any network request.
- All `httpx` exceptions (timeouts, connection errors, too many redirects, etc.) are caught and converted to safe, user-facing messages.

### SSRF protection (`fetch.py`)

Before connecting, the target hostname is resolved via DNS and every resulting IP address is checked against a blocklist:

- Loopback (`127.0.0.0/8`, `::1`)
- Private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`)
- Link-local (`169.254.0.0/16`, `fe80::/10`)
- Unspecified, reserved, multicast, and any other non-global address

Redirect targets are re-checked with the same SSRF logic after each redirect.

### Response size limits (`fetch.py`)

The response body is streamed and counted as it arrives. If the cumulative size exceeds `max_bytes`, the download is aborted immediately. This prevents memory exhaustion from oversized or malicious responses.

### DNS rebinding / Host header protection (`api/mcp.py`)

The deployed Vercel endpoint validates the `Host` header of every incoming request against an allowlist. Requests with an unrecognized `Host` value receive HTTP 421 (Misdirected Request). This prevents DNS rebinding attacks where a malicious DNS record points to the Vercel infrastructure.

Allowed hosts include `localhost` (for local development) and the hostnames provided by Vercel system environment variables (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`). The protection is enabled by default via `TransportSecuritySettings(enable_dns_rebinding_protection=True)`.

### What this project does NOT do

- No browser automation or JavaScript rendering.
- No authentication or session management.
- No crawling or link-following beyond a single page.
- No rate limiting or request caching.

## Development

### Adding a new MCP tool

1. Define the function in `src/web_scraper_mcp/server.py`.
2. Decorate it with `@mcp.tool()`.
3. Use the existing `_fetch_page()` helper for network requests and the `extract.py` functions for HTML processing.
4. Add tests in the appropriate `test/test_*.py` file.

### Running the full check suite

```bash
pytest -v
```

### Project layout conventions

- **`fetch.py`** owns all networking: URL validation, SSRF checks, streaming, error conversion.
- **`extract.py`** owns all HTML processing: a pure function of the HTML it receives, never makes network requests.
- **`server.py`** owns the MCP plumbing: tool definitions, parameter schemas, request orchestration, and converting exceptions into clean client errors.
- **`api/mcp.py`** owns the deployment layer: Vercel entrypoint, transport security configuration, and ASGI app creation.

When changing behavior, keep responsibilities in their respective files.

## Troubleshooting

### MCP server not connecting

- Ensure the Python virtual environment is activated and dependencies are installed (`pip install -e .`).
- Run `python -m web_scraper_mcp.server` directly to confirm it starts without errors.
- Check that your MCP client configuration points to the correct Python executable and server module.

### Vercel deployment returns 421 Misdirected Request

The `Host` header of the incoming request is not in the allowed list. Verify that the relevant Vercel system environment variable (`VERCEL_URL` or `VERCEL_BRANCH_URL`) is set and available at runtime. Environment variables are injected at deploy time; changing them requires a redeploy.

### VS Code not discovering tools

- Confirm the MCP server is listed in your VS Code MCP configuration (`.vscode/mcp.json` or user settings).
- For the prompt shortcuts (`/scrape-read`, etc.), ensure the `.github/prompts/` directory is present in your workspace root.

### Python version errors

The project requires Python 3.10 or newer. Check your version with:

```bash
python --version
```

### Tests failing after changes

Run tests with verbose output to identify the specific failure:

```bash
pytest -v
```

All tests are offline and use mock fixtures. If a test fails, it is likely due to a change in `fetch.py`, `extract.py`, or their interfaces.

## Future Improvements

- **Authentication**: add API key or OAuth support for the MCP endpoint.
- **Caching**: cache fetched pages to reduce redundant requests to the same URL.
- **Rate limiting**: enforce per-client request limits to prevent abuse.
- **Additional extraction formats**: support JSON-LD, microdata, or Open Graph metadata extraction.
- **Full-text truncation control**: allow clients to request the full page text without truncation.
- **Error reporting and observability**: structured logging and error metrics for deployed instances.
- **Custom CSS selector validation**: provide clearer error messages when selectors are syntactically invalid.

## License

No license has been specified yet.
