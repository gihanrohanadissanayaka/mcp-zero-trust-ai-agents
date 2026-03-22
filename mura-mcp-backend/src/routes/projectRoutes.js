// ============================================================
// Project Management REST Routes
// MCP Hub — Developer Projects
//
// Projects define isolated scopes that agents can operate in
// when MCP is used as middleware.
// All routes require developer API key (Bearer token).
// ============================================================

import express from 'express';
import crypto from 'crypto';
import { getDatabase } from '../config/database/connection.js';

const router = express.Router();

// ── Auth Middleware ──────────────────────────────────────────
async function requireDeveloperAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header with Bearer token required',
      hint: 'Use your developer API key: Authorization: Bearer mcphub_...'
    });
  }
  const apiKey = authHeader.substring(7);
  try {
    const db = getDatabase();
    const apiKeyRecord = await db.collection('api_keys').findOne({ key: apiKey, active: true });
    if (!apiKeyRecord) {
      return res.status(401).json({ success: false, error: 'Invalid or inactive API key' });
    }
    req.developer = {
      developerId: apiKeyRecord.developerId?.toString() || apiKeyRecord.userId || apiKeyRecord._id.toString(),
      email: apiKeyRecord.email || apiKeyRecord.metadata?.email,
      name: apiKeyRecord.name
    };
    await db.collection('api_keys').updateOne({ key: apiKey }, { $set: { lastUsed: new Date() } });
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Authentication service error' });
  }
}

function generateProjectId() {
  return 'proj_' + Date.now().toString(36) + '_' + crypto.randomBytes(6).toString('hex');
}

// ── POST /api/projects — Create a project ───────────────────
router.post('/', requireDeveloperAuth, async (req, res) => {
  try {
    const { name, description, environment, tags, mcpConfig } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }

    const db = getDatabase();

    // Prevent duplicate names within same developer
    const existing = await db.collection('projects').findOne({
      developerId: req.developer.developerId,
      name: name.trim(),
      active: true
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'A project with this name already exists' });
    }

    const project = {
      projectId:   generateProjectId(),
      name:        name.trim(),
      description: description?.trim() || '',
      environment: environment || 'development',
      tags:        Array.isArray(tags) ? tags : [],
      developerId: req.developer.developerId,
      active:      true,
      createdAt:   new Date(),
      updatedAt:   new Date(),
      mcpConfig: {
        allowedOperations:  mcpConfig?.allowedOperations  || ['read', 'write', 'execute'],
        rateLimitPerMinute: mcpConfig?.rateLimitPerMinute || 60,
        maxAgents:           mcpConfig?.maxAgents          || 10,
        contextWindow:       mcpConfig?.contextWindow      || 'full',
        ...mcpConfig
      }
    };

    await db.collection('projects').insertOne(project);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/projects — List developer's projects ───────────
router.get('/', requireDeveloperAuth, async (req, res) => {
  try {
    const db = getDatabase();
    const projects = await db.collection('projects')
      .find({ developerId: req.developer.developerId, active: true })
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich each project with agent count
    const enriched = await Promise.all(projects.map(async (p) => {
      const agentCount = await db.collection('agents').countDocuments({
        'policy.allowedProjects': p.projectId,
        active: true
      });
      return { ...p, agentCount };
    }));

    res.json({ success: true, data: { total: enriched.length, projects: enriched } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/projects/:projectId — Get one project ──────────
router.get('/:projectId', requireDeveloperAuth, async (req, res) => {
  try {
    const db = getDatabase();
    const project = await db.collection('projects').findOne({
      projectId: req.params.projectId,
      active: true
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.developerId !== req.developer.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const agents = await db.collection('agents')
      .find({ 'policy.allowedProjects': project.projectId, active: true })
      .project({ agentId: 1, name: 1, description: 1, active: 1, _id: 0 })
      .toArray();

    res.json({ success: true, data: { ...project, agents } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/projects/:projectId — Update a project ─────────
router.put('/:projectId', requireDeveloperAuth, async (req, res) => {
  try {
    const db = getDatabase();
    const project = await db.collection('projects').findOne({
      projectId: req.params.projectId, active: true
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.developerId !== req.developer.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { name, description, environment, tags, mcpConfig } = req.body;
    const updates = {
      ...(name        && { name: name.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(environment && { environment }),
      ...(tags        && { tags }),
      ...(mcpConfig   && { mcpConfig: { ...project.mcpConfig, ...mcpConfig } }),
      updatedAt: new Date()
    };

    await db.collection('projects').updateOne({ projectId: req.params.projectId }, { $set: updates });
    const updated = await db.collection('projects').findOne({ projectId: req.params.projectId });

    res.json({ success: true, message: 'Project updated', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/projects/:projectId — Soft-delete a project ─
router.delete('/:projectId', requireDeveloperAuth, async (req, res) => {
  try {
    const db = getDatabase();
    const project = await db.collection('projects').findOne({
      projectId: req.params.projectId, active: true
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.developerId !== req.developer.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await db.collection('projects').updateOne(
      { projectId: req.params.projectId },
      { $set: { active: false, deletedAt: new Date() } }
    );

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/projects/:projectId/connectivity ─────────────────────────
// Pings each service in mcpConfig.services + the apiGatewayUrl
// and returns live connectivity status for each.
router.get('/:projectId/connectivity', requireDeveloperAuth, async (req, res) => {
  try {
    const db = getDatabase();
    const project = await db.collection('projects').findOne({
      projectId: req.params.projectId, active: true
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    if (project.developerId !== req.developer.developerId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const cfg = project.mcpConfig || {};
    const checks = [];

    // Helper: try a GET with 4s timeout
    async function ping(name, url, role) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const r = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        return { name, url, role, status: 'reachable', httpStatus: r.status, latencyMs: Date.now() - start };
      } catch (e) {
        return { name, url, role, status: 'unreachable', error: e.message, latencyMs: Date.now() - start };
      }
    }

    // Ping API gateway
    if (cfg.apiGatewayUrl) {
      checks.push(ping('api-gateway', cfg.apiGatewayUrl, 'gateway'));
    }

    // Ping each registered service
    if (Array.isArray(cfg.services)) {
      for (const svc of cfg.services) {
        if (svc.url) checks.push(ping(svc.name, svc.url, svc.type || 'service'));
      }
    }

    const results = await Promise.all(checks);

    // Empty checks array → no services configured at all
    if (results.length === 0) {
      return res.json({
        success:      true,
        projectId:    project.projectId,
        projectName:  project.name,
        environment:  project.environment,
        connectivity: 'not_configured',
        checkedAt:    new Date().toISOString(),
        services:     []
      });
    }

    const allReachable = results.length > 0 && results.every(r => r.status === 'reachable');

    res.json({
      success:      true,
      projectId:    project.projectId,
      projectName:  project.name,
      environment:  project.environment,
      connectivity: allReachable ? 'all_reachable' : 'partial',
      checkedAt:    new Date().toISOString(),
      services:     results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as projectRoutes };
