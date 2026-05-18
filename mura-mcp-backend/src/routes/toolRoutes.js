#!/usr/bin/env node

// ============================================================
// Tool Invocation Routes  — /api/tools
// MCP Middleware layer between services and AI providers.
//
// External services (e.g. booking-service) call this endpoint
// to invoke AI tools. MCP handles:
//   1. API key authentication
//   2. Tool policy enforcement
//   3. Groq AI execution
//   4. Full audit logging → agent_action_logs
//
// POST /api/tools/invoke
//   Body: { tool, input, projectId? }
//   Auth: Authorization: Bearer <developer-api-key>
//
// POST /api/tools/list
//   Returns the list of available tools (no auth required)
// ============================================================

import express from 'express'
import Groq    from 'groq-sdk'
import { getDatabase } from '../config/database/connection.js'
import { evaluatePolicy } from '../auth/policyEngine.js'

const router = express.Router()

// ── Project lookup helper ───────────────────────────────────
async function resolveProject(projectId, developerId) {
  if (!projectId) return { ok: true, project: null }
  try {
    const db = getDatabase()
    const project = await db.collection('projects').findOne({ projectId, active: true })
    if (!project) return { ok: false, status: 404, error: `Project "${projectId}" not found` }
    if (project.developerId !== developerId) {
      return { ok: false, status: 403, error: 'API key does not belong to this project' }
    }
    return { ok: true, project }
  } catch (err) {
    return { ok: false, status: 500, error: 'Project lookup failed: ' + err.message }
  }
}

// ── Available tools registry ──────────────────────────────────
const TOOLS = {
  generate_email: {
    name:        'generate_email',
    description: 'Generate a professional booking notification email using AI',
    inputSchema: ['bookingId', 'title', 'date', 'location', 'attendees', 'notes', 'status']
  }
}

// ── Auth middleware: validate developer API key ───────────────
async function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error:   'Authorization header required: Bearer <api-key>'
    })
  }

  const key = authHeader.substring(7)
  try {
    const db  = getDatabase()
    const rec = await db.collection('api_keys').findOne({ key, active: true })
    if (!rec) {
      return res.status(401).json({ success: false, error: 'Invalid or inactive API key' })
    }
    await db.collection('api_keys').updateOne({ key }, { $set: { lastUsed: new Date() } })
    req.caller = {
      developerId: rec.developerId?.toString() || 'unknown',
      email:       rec.email || 'unknown',
      name:        rec.name  || 'unknown',
      apiKeyId:    rec._id?.toString()
    }
    next()
  } catch (err) {
    console.error('[tool-routes] API key validation error:', err.message)
    res.status(500).json({ success: false, error: 'Authentication error' })
  }
}

// ── Helper: write to audit log ────────────────────────────────
async function writeLog({ tool, input, result, allowed, error, req, durationMs, project, tokenUsage }) {
  try {
    const db     = getDatabase()
    const status = error ? (allowed ? 'failed' : 'rejected') : 'success'

    await db.collection('agent_action_logs').insertOne({
      logId:        `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source:       'tool_invoke',
      tool,
      status,                                          // success | failed | rejected
      allowed,

      // ── Caller identity ──────────────────────────
      agentId:      req.headers?.['x-agent-id'] || null,
      developerId:  req.caller?.developerId || null,
      callerEmail:  req.caller?.email        || null,
      callerName:   req.caller?.name         || null,
      ip:           req.ip,
      userAgent:    req.headers?.['user-agent'] || null,

      // ── Project context ──────────────────────────
      projectId:    project?.projectId   || req.body?.projectId || null,
      projectName:  project?.name        || null,
      environment:  project?.environment || null,

      // ── Request payload (full, capped at 4KB) ────
      request: {
        tool,
        input:       JSON.stringify(input).slice(0, 4096),
        projectId:   req.body?.projectId || null,
        receivedAt:  new Date().toISOString()
      },

      // ── AI response ──────────────────────────────
      response: result ? {
        content:     result,
        model:       'llama-3.3-70b-versatile',
        tokenUsage:  tokenUsage || null,
        generatedAt: new Date().toISOString()
      } : null,

      // ── Error details ─────────────────────────────
      error:       error || null,

      // ── Performance ──────────────────────────────
      durationMs,
      timestamp:   new Date()
    })
  } catch (logErr) {
    console.error('[tool-routes] Logging error:', logErr.message)
  }
}

// ============================================================
// GET /api/tools/list  — public, lists available tools
// ============================================================
router.get('/list', (_req, res) => {
  res.json({
    success: true,
    data: {
      tools: Object.values(TOOLS),
      total: Object.keys(TOOLS).length
    }
  })
})

// ============================================================
// POST /api/tools/invoke  — authenticated tool invocation
// ============================================================
router.post('/invoke', requireApiKey, async (req, res) => {
  const start = Date.now()
  const { tool, input = {}, projectId } = req.body

  // ── Validate tool name ────────────────────────────────────
  if (!tool) {
    return res.status(400).json({ success: false, error: '"tool" field is required' })
  }

  if (!TOOLS[tool]) {
    return res.status(400).json({
      success: false,
      error:   `Unknown tool: "${tool}"`,
      hint:    `Available tools: ${Object.keys(TOOLS).join(', ')}`
    })
  }

  // ── Check GROQ key is configured ─────────────────────────
  if (!process.env.GROQ_API_KEY) {
    await writeLog({ tool, input, allowed: false, error: 'GROQ_API_KEY not configured', req, durationMs: Date.now() - start, project: null })
    return res.status(503).json({ success: false, error: 'AI provider not configured on MCP server' })
  }

  // ── Resolve & validate project ─────────────────────────
  const { ok, project, status: projStatus, error: projError } = await resolveProject(projectId, req.caller.developerId)
  if (!ok) {
    await writeLog({ tool, input, allowed: false, error: projError, req, durationMs: Date.now() - start, project: null })
    return res.status(projStatus).json({ success: false, error: projError })
  }

  // If project defines allowedTools, enforce it
  if (project?.mcpConfig?.allowedTools?.length) {
    if (!project.mcpConfig.allowedTools.includes(tool)) {
      const err = `Tool "${tool}" is not allowed for project "${project.name}". Allowed: ${project.mcpConfig.allowedTools.join(', ')}`
      await writeLog({ tool, input, allowed: false, error: err, req, durationMs: Date.now() - start, project })
      return res.status(403).json({ success: false, error: err })
    }
  }

  console.log(`[mcp/tools] invoke tool="${tool}" caller="${req.caller.email}" project="${project?.name || projectId || 'none'}"`)

  // ── Agent policy enforcement ──────────────────────────────
  // If the request was initiated by an agent (x-agent-id forwarded from gateway),
  // evaluate the agent's policy rules before proceeding.
  const agentId = req.headers['x-agent-id'] || null
  if (agentId) {
    const policyResult = await evaluatePolicy(
      agentId,
      tool,
      { projectId: projectId || null, operation: 'write' }
    )
    if (policyResult.decision !== 'allow') {
      await writeLog({
        tool, input, allowed: false,
        error: `policy_denied:${policyResult.reason}`,
        req, durationMs: Date.now() - start, project
      })
      return res.status(403).json({
        success:     false,
        error:       `Tool "${tool}" denied by agent policy.`,
        reason:      policyResult.reason,
        matchedRule: policyResult.matchedRule ?? null,
        agentId,
        hint:        'Update the agent\'s policy rules via the MCP Hub Policy Editor.'
      })
    }
    console.log(`[mcp/tools] policy ALLOW | tool="${tool}" agent="${agentId}" rule="${policyResult.matchedRule?.id ?? policyResult.reason}"`)
  }

  // ── Execute tool ──────────────────────────────────────────
  try {
    let result
    let tokenUsage = null

    if (tool === 'generate_email') {
      const out  = await executeGenerateEmail(input, project)
      result     = out.content
      tokenUsage = out.tokenUsage
    }

    const durationMs = Date.now() - start
    await writeLog({ tool, input, result, allowed: true, req, durationMs, project, tokenUsage })

    return res.json({
      success:    true,
      tool,
      result,
      meta: {
        durationMs,
        model:        'llama-3.3-70b-versatile',
        tokenUsage,
        loggedBy:     'mcp-hub',
        calledBy:     req.caller.email,
        projectId:    projectId    || null,
        projectName:  project?.name || null,
        environment:  project?.environment || null,
        timestamp:    new Date().toISOString()
      }
    })

  } catch (err) {
    const durationMs = Date.now() - start
    await writeLog({ tool, input, allowed: true, error: err.message, req, durationMs, project })
    console.error(`[mcp/tools] Tool execution error (${tool}):`, err.message)
    res.status(500).json({ success: false, error: `Tool execution failed: ${err.message}` })
  }
})

// ── Tool implementation: generate_email ──────────────────────
async function executeGenerateEmail(input, project) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const {
    title     = 'Untitled Booking',
    date      = 'TBD',
    location  = 'TBD',
    attendees = [],
    notes     = '',
    status    = 'pending'
  } = input

  const attendeeList = Array.isArray(attendees) && attendees.length
    ? attendees.join(', ')
    : 'All attendees'

  const serviceCtx = project?.mcpConfig?.services?.find(s => s.type === 'business')
  const systemName  = project?.name || 'Booking System'

  const prompt = `You are a professional assistant generating booking notification emails for ${systemName}.

Booking Details:
- Title: ${title}
- Date: ${date}
- Location: ${location}
- Attendees: ${attendeeList}
- Status: ${status}
- Notes: ${notes || 'None'}

Write a professional, friendly booking notification email. Include:
1. A clear subject line (prefix with "Subject: ")
2. A greeting
3. The booking details clearly listed
4. A call to action if needed
5. A sign-off

Keep it concise and professional. Do not add any extra commentary outside the email itself.`

  // serviceCtx is available for richer prompts: serviceCtx?.name, serviceCtx?.url

  const completion = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    messages:    [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens:  600
  })

  const content = completion.choices[0]?.message?.content?.trim()
  if (!content) throw new Error('AI returned empty response')

  const tokenUsage = completion.usage ? {
    promptTokens:     completion.usage.prompt_tokens,
    completionTokens: completion.usage.completion_tokens,
    totalTokens:      completion.usage.total_tokens
  } : null

  return { content, tokenUsage }
}

export { router as toolRoutes }
