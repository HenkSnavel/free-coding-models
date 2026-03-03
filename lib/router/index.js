/**
 * @file lib/router/index.js
 * @description OpenAI-compatible HTTP router/gateway for free-coding-models.
 *
 * @details
 *   Starts an HTTP server that acts as an OpenAI-compatible gateway.
 *   It selects the best available provider/model based on current config filters
 *   and supports automatic failover when a provider is unavailable.
 *
 *   Endpoints:
 *   - GET  /health                → 200 OK with status JSON
 *   - GET  /v1/models             → OpenAI-compatible model list (filtered by config)
 *   - POST /v1/chat/completions   → Forward to best provider, with failover
 *   - POST /v1/completions        → Forward to best provider, with failover
 *
 *   The router uses the same config/filters as the TUI:
 *   - Provider enabled/disabled state from ~/.free-coding-models.json
 *   - --tier filter (S, A, B, C)
 *   - --best flag (S+, S, A+ only)
 *   - Automatic failover on 429/5xx/network errors
 *   - Streaming (SSE) proxy support
 *
 *   🚀 OpenClaw configuration example:
 *   {
 *     "api": "openai-completions",
 *     "baseUrl": "http://localhost:3000",
 *     "authHeader": false
 *   }
 *
 * @see bin/free-coding-models.js — starts this via `--router` flag
 * @see lib/utils.js — buildRouterCandidates, sortCandidatesForFailover
 * @see sources.js — MODELS and provider URL definitions
 */

import { createServer } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { sources, MODELS } from '../../sources.js'
import { getApiKey, isProviderEnabled } from '../config.js'
import { buildRouterCandidates, sortCandidatesForFailover } from '../utils.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const PING_TIMEOUT_MS = 15_000       // 📖 15s timeout per background ping
const PING_INTERVAL_MS = 60_000      // 📖 Ping all models every 60 seconds
const REQUEST_TIMEOUT_MS = 30_000    // 📖 30s timeout per upstream forwarding attempt
const DEFAULT_PORT = 3000

// 📖 Providers not forwarded by the router (non-OpenAI-compatible endpoints).
// 📖 Replicate uses /v1/predictions with a different payload — skipped in router mode.
const UNSUPPORTED_PROVIDERS = new Set(['replicate'])

// ─── Cloudflare URL helper ────────────────────────────────────────────────────

function resolveProviderUrl(providerKey) {
  const url = sources[providerKey]?.url ?? sources.nvidia.url
  if (providerKey === 'cloudflare' && url.includes('{account_id}')) {
    return url.replace('{account_id}', (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() || 'missing-account-id')
  }
  return url
}

// ─── Background ping loop ─────────────────────────────────────────────────────

// 📖 Lightweight ping to check if a model is reachable.
// 📖 Updates the result object's status/pings in place.
async function pingCandidate(candidate, config) {
  const apiKey = getApiKey(config, candidate.providerKey) ?? null
  const url = resolveProviderUrl(candidate.providerKey)
  const apiModelId = candidate.providerKey === 'zai'
    ? candidate.modelId.replace(/^zai\//, '')
    : candidate.modelId

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (candidate.providerKey === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/vava-nessa/free-coding-models'
    headers['X-Title'] = 'free-coding-models'
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
  const t0 = performance.now()
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: apiModelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: ctrl.signal,
    })
    const code = resp.status >= 200 && resp.status < 300 ? '200' : String(resp.status)
    candidate.pings.push({ ms: Math.round(performance.now() - t0), code })
    if (code === '200') {
      candidate.status = 'up'
    } else if (code === '401') {
      candidate.status = 'noauth'
      candidate.httpCode = code
    } else {
      candidate.status = 'down'
      candidate.httpCode = code
    }
  } catch {
    candidate.pings.push({ ms: Math.round(performance.now() - t0), code: '000' })
    candidate.status = 'timeout'
  } finally {
    clearTimeout(timer)
  }
}

// ─── Request forwarding ───────────────────────────────────────────────────────

// 📖 Forward an incoming request body to the specified candidate provider.
// 📖 Returns a fetch Response (not yet consumed) or throws on network error.
async function forwardRequest(candidate, body, signal) {
  const apiKey = getApiKey(candidate._config, candidate.providerKey) ?? null
  const url = resolveProviderUrl(candidate.providerKey)
  const apiModelId = candidate.providerKey === 'zai'
    ? candidate.modelId.replace(/^zai\//, '')
    : candidate.modelId

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (candidate.providerKey === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/vava-nessa/free-coding-models'
    headers['X-Title'] = 'free-coding-models'
  }

  // 📖 Replace the model in the request body with the actual provider model ID
  const forwardBody = { ...body, model: apiModelId }

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(forwardBody),
    signal,
  })
}

// ─── Read request body helper ─────────────────────────────────────────────────

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

// ─── OpenClaw auto-configuration ─────────────────────────────────────────────

// 📖 The OpenClaw provider key used when the router auto-configures OpenClaw.
// 📖 Appears as a prefix in model IDs within OpenClaw: "fcm-router/<modelId>".
export const OPENCLAW_ROUTER_PROVIDER = 'fcm-router'

// 📖 buildOpenClawRouterConfig: Pure function — takes an existing ~/.openclaw/openclaw.json
// 📖 object (or {}) and returns a new config object patched with:
// 📖   - models.providers["fcm-router"] pointing at the local router
// 📖   - agents.defaults.model.primary set to the best candidate
// 📖   - agents.defaults.models entry allowing the primary model
// 📖 Does NOT touch the filesystem — call configureOpenClawForRouter() for that.
export function buildOpenClawRouterConfig(existingConfig, port, modelId) {
  // 📖 Deep-clone so we never mutate the caller's object
  const cfg = JSON.parse(JSON.stringify(existingConfig))

  if (!cfg.models) cfg.models = {}
  if (!cfg.models.providers) cfg.models.providers = {}

  // 📖 Overwrite any existing fcm-router provider block with the current port/settings
  cfg.models.providers[OPENCLAW_ROUTER_PROVIDER] = {
    baseUrl: `http://localhost:${port}`,
    api: 'openai-completions',
    authHeader: false,
  }

  if (!cfg.agents) cfg.agents = {}
  if (!cfg.agents.defaults) cfg.agents.defaults = {}
  if (!cfg.agents.defaults.model) cfg.agents.defaults.model = {}

  const primaryKey = `${OPENCLAW_ROUTER_PROVIDER}/${modelId}`
  cfg.agents.defaults.model.primary = primaryKey

  // 📖 OpenClaw requires the model to be in agents.defaults.models (allowlist)
  if (!cfg.agents.defaults.models) cfg.agents.defaults.models = {}
  cfg.agents.defaults.models[primaryKey] = {}

  return cfg
}

// 📖 configureOpenClawForRouter: Write the OpenClaw config for the router.
// 📖 Reads the existing config (if any), patches it, and saves it back.
// 📖 Returns the fully-qualified primary model key (e.g. "fcm-router/deepseek-ai/deepseek-v3.2").
function configureOpenClawForRouter(port, allCandidates) {
  const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json')
  const dir = join(homedir(), '.openclaw')

  let existingConfig = {}
  if (existsSync(OPENCLAW_CONFIG)) {
    try { existingConfig = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf8')) } catch {
      // 📖 Config exists but is not valid JSON — warn and start fresh so we don't corrupt it further
      console.warn(`  ⚠ Existing OpenClaw config could not be parsed — overwriting with a fresh config.`)
      console.warn(`     (${OPENCLAW_CONFIG})`)
    }
  }

  // 📖 Use the best candidate at startup time (pings haven't run yet — sort is by tier)
  const primaryCandidate = sortCandidatesForFailover(allCandidates)[0]
  const newConfig = buildOpenClawRouterConfig(existingConfig, port, primaryCandidate.modelId)

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(newConfig, null, 2))

  return `${OPENCLAW_ROUTER_PROVIDER}/${primaryCandidate.modelId}`
}

// ─── Main export: startRouter ─────────────────────────────────────────────────

/**
 * 📖 startRouter: Start the HTTP gateway server.
 *
 * @param {object} config — Loaded config from loadConfig()
 * @param {object} cliArgs — Parsed CLI args from parseArgs()
 */
export function startRouter(config, cliArgs) {
  const port = (cliArgs.port && !isNaN(cliArgs.port))
    ? cliArgs.port
    : (parseInt(process.env.PORT || '', 10) || DEFAULT_PORT)

  // 📖 Build candidate list (provider-enabled + tier/best filters)
  const allCandidates = buildRouterCandidates(MODELS, config, isProviderEnabled, {
    tierFilter: cliArgs.tierFilter,
    bestMode: cliArgs.bestMode,
  }).filter(c => !UNSUPPORTED_PROVIDERS.has(c.providerKey))

  if (allCandidates.length === 0) {
    console.error('  ✖ No models available with current filters/providers. Cannot start router.')
    console.error('  Run `free-coding-models` first to configure API keys.')
    process.exit(1)
  }

  // 📖 Attach config reference to each candidate so forwardRequest can use getApiKey
  for (const c of allCandidates) c._config = config

  // ─── Background ping loop ───────────────────────────────────────────────────

  const runPings = () => {
    for (const candidate of allCandidates) {
      pingCandidate(candidate, config).catch(() => {})
    }
  }

  // 📖 Initial ping on startup (fire-and-forget — server starts immediately)
  runPings()
  setInterval(runPings, PING_INTERVAL_MS).unref()

  // ─── HTTP server ────────────────────────────────────────────────────────────

  const server = createServer((req, res) => {
    // 📖 Wrap the entire async handler in a try/catch so any unexpected error
    // 📖 ends the response cleanly instead of leaking as an unhandledRejection
    // 📖 (which crashes the process on Node 15+ where the default mode is 'throw').
    handleRequest(req, res).catch((_err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Internal server error', type: 'server_error', code: 500 } }))
      } else if (!res.destroyed) {
        res.end()
      }
    })
  })

  async function handleRequest(req, res) {
    const method = req.method ?? 'GET'
    const urlPath = (req.url ?? '/').split('?')[0]

    // ── GET /health ───────────────────────────────────────────────────────────
    if (method === 'GET' && urlPath === '/health') {
      const up = allCandidates.filter(c => c.status === 'up').length
      const total = allCandidates.length
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', models_up: up, models_total: total }))
      return
    }

    // ── GET /v1/models ────────────────────────────────────────────────────────
    if (method === 'GET' && urlPath === '/v1/models') {
      const data = allCandidates.map(c => ({
        id: c.modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: c.providerKey,
        // 📖 Extra metadata useful for clients
        tier: c.tier,
        status: c.status,
      }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data }))
      return
    }

    // ── POST /v1/chat/completions  or  POST /v1/completions ───────────────────
    if (method === 'POST' && (urlPath === '/v1/chat/completions' || urlPath === '/v1/completions')) {
      // 📖 Parse request body
      let body
      try {
        const raw = await readBody(req)
        body = JSON.parse(raw)
      } catch {
        if (!res.headersSent) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'Invalid JSON body', type: 'invalid_request_error', code: 400 } }))
        }
        return
      }

      const isStreaming = body.stream === true

      // 📖 Sort candidates: up + fast first, then tier order
      const candidates = sortCandidatesForFailover(allCandidates)

      let lastError = 'No candidates available'
      let responded = false

      for (const candidate of candidates) {
        // 📖 Stop iterating if the response was already started (e.g. streaming
        // 📖 began but the upstream connection dropped mid-stream).
        if (res.headersSent) break

        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

        try {
          const upstream = await forwardRequest(candidate, body, ctrl.signal)
          clearTimeout(timer)

          // 📖 Retry on rate-limit or server errors (failover to next candidate)
          if (upstream.status === 429 || upstream.status >= 500) {
            lastError = `HTTP ${upstream.status} from ${candidate.providerKey}/${candidate.modelId}`
            // 📖 Drain the body to free the connection
            await upstream.body?.cancel?.().catch(() => {})
            continue
          }

          // 📖 Proxy response to client
          const contentType = upstream.headers.get('content-type') ?? 'application/json'
          res.writeHead(upstream.status, {
            'Content-Type': contentType,
            'X-FCM-Provider': candidate.providerKey,
            'X-FCM-Model': candidate.modelId,
          })

          if (isStreaming && upstream.body) {
            // 📖 Stream SSE chunks from upstream directly to client
            const reader = upstream.body.getReader()
            const pump = async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  // 📖 Stop pumping if client has disconnected
                  if (res.destroyed) break
                  if (!res.write(value)) {
                    // 📖 Backpressure: wait for drain with disconnect guard
                    await new Promise((resolve) => {
                      const onDrain = () => { res.removeListener('close', onClose); resolve() }
                      const onClose = () => { res.removeListener('drain', onDrain); resolve() }
                      res.once('drain', onDrain)
                      res.once('close', onClose)
                    })
                  }
                }
              } finally {
                reader.cancel().catch(() => {})
                if (!res.destroyed) res.end()
              }
            }
            await pump()
          } else {
            const text = await upstream.text()
            res.end(text)
          }

          responded = true
          break
        } catch (err) {
          clearTimeout(timer)
          lastError = err.message ?? 'Network error'
          // 📖 Continue to next candidate on network/timeout errors
        }
      }

      // 📖 Only send 503 if we have not already started writing a response
      // 📖 (headers not sent = we haven't committed to any candidate yet)
      if (!responded && !res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            message: `All providers failed. Last error: ${lastError}`,
            type: 'server_error',
            code: 503,
          },
        }))
      }
      return
    }

    // ── 404 for everything else ───────────────────────────────────────────────
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Not found', type: 'invalid_request_error', code: 404 } }))
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`  ✖ Port ${port} is already in use. Use --port <number> or PORT env var to choose a different port.`)
    } else {
      console.error(`  ✖ Router server error: ${err.message}`)
    }
    process.exit(1)
  })

  server.listen(port, () => {
    console.log()
    console.log(`  🚀 free-coding-models router started`)
    console.log(`  🔗 Base URL:  http://localhost:${port}`)
    console.log(`  📡 Models:    ${allCandidates.length} available`)
    if (cliArgs.tierFilter) console.log(`  🏷  Tier:      ${cliArgs.tierFilter}`)
    if (cliArgs.bestMode)   console.log(`  ⭐ Mode:      best (S+/S/A+ only)`)
    console.log()

    // 📖 When --openclaw is combined with --router, auto-write ~/.openclaw/openclaw.json
    // 📖 so the user doesn't have to configure OpenClaw manually.
    if (cliArgs.openClawMode) {
      try {
        const primaryModel = configureOpenClawForRouter(port, allCandidates)
        const configPath = join(homedir(), '.openclaw', 'openclaw.json')
        console.log(`  🦞 OpenClaw auto-configured!`)
        console.log(`     Provider: "${OPENCLAW_ROUTER_PROVIDER}" → http://localhost:${port}`)
        console.log(`     Default model: ${primaryModel}`)
        console.log(`     Config: ${configPath}`)
        console.log()
      } catch (err) {
        console.error(`  ⚠ Could not auto-configure OpenClaw: ${err.message}`)
        console.error(`     Configure manually — see OpenClaw config below.`)
        console.log()
      }
    }

    console.log(`  Endpoints:`)
    console.log(`    GET  /health`)
    console.log(`    GET  /v1/models`)
    console.log(`    POST /v1/chat/completions`)
    console.log(`    POST /v1/completions`)
    console.log()

    if (!cliArgs.openClawMode) {
      // 📖 Only show the manual config hint when --openclaw was NOT used
      // 📖 (when --openclaw is used the config was already written automatically above)
      console.log(`  OpenClaw config:`)
      console.log(`    api: "openai-completions"`)
      console.log(`    baseUrl: "http://localhost:${port}"`)
      console.log(`    authHeader: false`)
      console.log()
    }

    console.log(`  Press Ctrl+C to stop.`)
  })
}
