import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen, Plus, RefreshCw, Pencil, Trash2, Bot,
  ChevronDown, ChevronUp, X, Check, Wifi, WifiOff,
  Globe, Wrench, Server, AlertCircle, CheckCircle2, Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import {
  listProjects, createProject, updateProject,
  deleteProject, checkProjectConnectivity
} from '../lib/api'

// ── Constants ────────────────────────────────────────────────
const ENVIRONMENTS  = ['development', 'staging', 'production']
const ENV_COLORS    = {
  development: 'bg-sky-50 text-sky-700 border-sky-200',
  staging:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  production:  'bg-green-50 text-green-700 border-green-200',
}
const OPERATIONS    = ['read', 'write', 'execute', 'delete', 'admin']
const SERVICE_TYPES = ['auth', 'business', 'data', 'notification', 'gateway', 'other']

const EMPTY_FORM = {
  name: '', description: '', environment: 'development', tags: '',
  mcpConfig: {
    apiGatewayUrl:      '',
    allowedOperations:  ['execute'],
    allowedTools:       '',
    rateLimitPerMinute: 60,
    maxAgents:          10,
    services:           []
  }
}

// ── Helpers ──────────────────────────────────────────────────
function emptyService() { return { name: '', url: '', type: 'business' } }

function ProjectForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    mcpConfig: {
      ...EMPTY_FORM.mcpConfig,
      ...initial.mcpConfig,
      allowedTools: Array.isArray(initial.mcpConfig?.allowedTools)
        ? initial.mcpConfig.allowedTools.join(', ')
        : (initial.mcpConfig?.allowedTools || ''),
      services: initial.mcpConfig?.services
        ? initial.mcpConfig.services.map(s => ({ ...s }))
        : []
    }
  }))

  function setMcp(key, val) {
    setForm(f => ({ ...f, mcpConfig: { ...f.mcpConfig, [key]: val } }))
  }

  function toggleOp(op) {
    setMcp('allowedOperations',
      form.mcpConfig.allowedOperations.includes(op)
        ? form.mcpConfig.allowedOperations.filter(o => o !== op)
        : [...form.mcpConfig.allowedOperations, op]
    )
  }

  function addService()              { setMcp('services', [...form.mcpConfig.services, emptyService()]) }
  function removeService(i)          { setMcp('services', form.mcpConfig.services.filter((_, idx) => idx !== i)) }
  function updateService(i, key, val) {
    setMcp('services', form.mcpConfig.services.map((s, idx) => idx === i ? { ...s, [key]: val } : s))
  }

  function submit(e) {
    e.preventDefault()
    onSave({
      ...form,
      tags: typeof form.tags === 'string'
        ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
        : form.tags,
      mcpConfig: {
        ...form.mcpConfig,
        allowedTools: typeof form.mcpConfig.allowedTools === 'string'
          ? form.mcpConfig.allowedTools.split(',').map(t => t.trim()).filter(Boolean)
          : form.mcpConfig.allowedTools,
        services: form.mcpConfig.services.filter(s => s.name && s.url)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Name + Environment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Project Name *</Label>
          <Input
            placeholder="my-booking-system"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Environment</Label>
          <select
            value={form.environment}
            onChange={e => setForm({ ...form, environment: e.target.value })}
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ENVIRONMENTS.map(env => (
              <option key={env} value={env}>{env.charAt(0).toUpperCase() + env.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Description + Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            placeholder="What is this project for?"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
          <Input
            placeholder="ai, backend, booking"
            value={typeof form.tags === 'string' ? form.tags : form.tags.join(', ')}
            onChange={e => setForm({ ...form, tags: e.target.value })}
          />
        </div>
      </div>

      {/* MCP Config box */}
      <div className="rounded-lg border p-4 space-y-5 bg-muted/30">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Bot size={14} /> MCP Middleware Config
        </p>

        {/* API Gateway URL */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><Globe size={12} /> API Gateway URL</Label>
          <Input
            placeholder="http://localhost:4000"
            value={form.mcpConfig.apiGatewayUrl || ''}
            onChange={e => setMcp('apiGatewayUrl', e.target.value)}
          />
        </div>

        {/* Allowed Tools */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Wrench size={12} /> Allowed Tools
            <span className="text-muted-foreground font-normal">(comma-separated)</span>
          </Label>
          <Input
            placeholder="generate_email, analyze_data"
            value={form.mcpConfig.allowedTools || ''}
            onChange={e => setMcp('allowedTools', e.target.value)}
          />
        </div>

        {/* Services */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1.5"><Server size={12} /> Services</Label>
            <button
              type="button"
              onClick={addService}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus size={11} /> Add Service
            </button>
          </div>
          {form.mcpConfig.services.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No services added yet.</p>
          )}
          <div className="space-y-2">
            {form.mcpConfig.services.map((svc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="auth-service"
                  value={svc.name}
                  onChange={e => updateService(i, 'name', e.target.value)}
                  className="flex-1 text-xs h-8"
                />
                <Input
                  placeholder="http://localhost:4001"
                  value={svc.url}
                  onChange={e => updateService(i, 'url', e.target.value)}
                  className="flex-[2] text-xs h-8"
                />
                <select
                  value={svc.type}
                  onChange={e => updateService(i, 'type', e.target.value)}
                  className="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => removeService(i)} className="p-1 text-muted-foreground hover:text-destructive">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Allowed Operations */}
        <div className="space-y-2">
          <Label className="text-xs">Allowed Agent Operations</Label>
          <div className="flex flex-wrap gap-2">
            {OPERATIONS.map(op => {
              const active = form.mcpConfig.allowedOperations.includes(op)
              return (
                <button
                  key={op} type="button" onClick={() => toggleOp(op)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary'}`}
                >
                  {op}
                </button>
              )
            })}
          </div>
        </div>

        {/* Rate Limit + Max Agents */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Rate Limit (req/min)</Label>
            <Input
              type="number" min="1" max="1000"
              value={form.mcpConfig.rateLimitPerMinute}
              onChange={e => setMcp('rateLimitPerMinute', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max Agents</Label>
            <Input
              type="number" min="1" max="100"
              value={form.mcpConfig.maxAgents}
              onChange={e => setMcp('maxAgents', Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Check size={13} /> Save Project</>}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X size={13} /> Cancel
        </Button>
      </div>
    </form>
  )
}

// ── ConnectivityPanel ─────────────────────────────────────────
function ConnectivityPanel({ projectId, onClose }) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const runCheck = useCallback(async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const { data } = await checkProjectConnectivity(projectId)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { runCheck() }, [runCheck])

  const allOk        = result?.connectivity === 'all_reachable'
  const notConfigured = result?.connectivity === 'not_configured'

  return (
    <div className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Wifi size={14} className="text-primary" /> Connectivity Test
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={runCheck} disabled={loading}
            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Re-run
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 size={14} className="animate-spin" /> Pinging services…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {result && !loading && (
        <>
          {notConfigured ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 border rounded-lg px-3 bg-muted/30">
              <Server size={14} className="flex-shrink-0" />
              <span>No services configured for this project. Add an API Gateway URL or services to enable connectivity testing.</span>
            </div>
          ) : (
            <>
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${allOk ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                {allOk ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {allOk ? 'All services reachable' : 'Some services unreachable'}
                <span className="text-muted-foreground font-normal ml-1">· {new Date(result.checkedAt).toLocaleTimeString()}</span>
              </div>

              <div className="space-y-1.5">
                {result.services?.map((svc, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded-md border px-3 py-2 bg-background">
                    <div className="flex items-center gap-2 min-w-0">
                      {svc.status === 'reachable'
                        ? <CheckCircle2 size={13} className="text-green-600 flex-shrink-0" />
                        : <WifiOff       size={13} className="text-destructive flex-shrink-0" />
                      }
                      <span className="font-medium">{svc.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${svc.role === 'gateway' ? 'bg-purple-50 text-purple-700' : svc.role === 'auth' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
                        {svc.role}
                      </span>
                      <span className="text-muted-foreground font-mono truncate hidden sm:block">{svc.url}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {svc.httpStatus && (
                        <span className={`font-mono text-[10px] ${svc.httpStatus < 400 ? 'text-green-600' : 'text-destructive'}`}>
                          HTTP {svc.httpStatus}
                        </span>
                      )}
                      <span className="text-muted-foreground">{svc.latencyMs}ms</span>
                      {svc.error && <span className="text-destructive truncate max-w-32">{svc.error}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── ProjectCard ───────────────────────────────────────────────
function ProjectCard({ project, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showConn, setShowConn] = useState(false)
  const [msg,      setMsg]      = useState('')

  async function handleUpdate(data) {
    setSaving(true)
    try {
      await updateProject(project.projectId, data)
      setEditing(false); setMsg(''); onRefresh()
    } catch (err) {
      setMsg(err.response?.data?.error || err.message)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete project "${project.name}"? Agents using it will lose access.`)) return
    setDeleting(true)
    try {
      await deleteProject(project.projectId); onRefresh()
    } catch (err) {
      setMsg(err.response?.data?.error || err.message); setDeleting(false)
    }
  }

  function startEdit() { setShowConn(false); setExpanded(true); setEditing(true) }

  const envClass  = ENV_COLORS[project.environment] || 'bg-muted text-muted-foreground'
  const cfg       = project.mcpConfig || {}
  const toolsList = Array.isArray(cfg.allowedTools) ? cfg.allowedTools : []

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen size={16} className="text-primary flex-shrink-0" />
              <h3 className="font-semibold text-sm">{project.name}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${envClass}`}>
                {project.environment}
              </span>
              {toolsList.map(tool => (
                <span key={tool} className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full font-medium">
                  ⚙ {tool}
                </span>
              ))}
            </div>
            {project.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1">
              <p className="text-[10px] text-muted-foreground font-mono">{project.projectId}</p>
              {cfg.apiGatewayUrl && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Globe size={9} /> {cfg.apiGatewayUrl}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Bot size={12} /> {project.agentCount ?? 0}
            </span>
            <button
              title="Test Connectivity"
              onClick={() => { setExpanded(true); setEditing(false); setShowConn(s => !s) }}
              className={`p-1 rounded transition-colors ${showConn ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Wifi size={14} />
            </button>
            <button
              onClick={() => { setEditing(false); setShowConn(false); setExpanded(e => !e) }}
              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <button onClick={startEdit} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground" title="Edit project">
              <Pencil size={14} />
            </button>
            <button
              onClick={handleDelete} disabled={deleting}
              className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {project.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {project.tags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-medium text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 border-t bg-muted/20">
          {/* Connectivity panel */}
          {showConn && !editing && (
            <div className="pt-4">
              <ConnectivityPanel projectId={project.projectId} onClose={() => setShowConn(false)} />
            </div>
          )}

          {/* Edit form */}
          {editing && (
            <div className="pt-4">
              <ProjectForm
                initial={{
                  name: project.name, description: project.description,
                  environment: project.environment,
                  tags: project.tags?.join(', ') || '',
                  mcpConfig: cfg
                }}
                onSave={handleUpdate}
                onCancel={() => setEditing(false)}
                saving={saving}
              />
              {msg && <p className="text-xs text-destructive mt-2">{msg}</p>}
            </div>
          )}

          {/* Detail view */}
          {!editing && !showConn && (
            <div className="pt-4 space-y-4">
              {/* Gateway + Tools */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cfg.apiGatewayUrl && (
                  <div className="rounded-md bg-background border p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Globe size={10} /> API Gateway</p>
                    <p className="text-xs font-mono text-foreground break-all">{cfg.apiGatewayUrl}</p>
                  </div>
                )}
                {toolsList.length > 0 && (
                  <div className="rounded-md bg-background border p-3 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Wrench size={10} /> Allowed Tools</p>
                    <div className="flex flex-wrap gap-1">
                      {toolsList.map(tool => (
                        <span key={tool} className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium">{tool}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Services table */}
              {cfg.services?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Server size={10} /> Registered Services</p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">URL</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cfg.services.map((svc, i) => (
                          <tr key={i} className="border-t bg-background">
                            <td className="px-3 py-2 font-medium">{svc.name}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">{svc.url}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${svc.type === 'auth' ? 'bg-blue-50 text-blue-700' : svc.type === 'business' ? 'bg-orange-50 text-orange-700' : svc.type === 'gateway' ? 'bg-purple-50 text-purple-700' : 'bg-muted text-muted-foreground'}`}>
                                {svc.type}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Limits */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-md bg-background border p-2.5 space-y-1">
                  <p className="text-muted-foreground">Rate Limit</p>
                  <p className="font-semibold">{cfg.rateLimitPerMinute ?? 60} <span className="font-normal text-muted-foreground">req/min</span></p>
                </div>
                <div className="rounded-md bg-background border p-2.5 space-y-1">
                  <p className="text-muted-foreground">Max Agents</p>
                  <p className="font-semibold">{cfg.maxAgents ?? 10}</p>
                </div>
                <div className="rounded-md bg-background border p-2.5 space-y-1">
                  <p className="text-muted-foreground">Operations</p>
                  <div className="flex flex-wrap gap-1">
                    {(cfg.allowedOperations || []).map(op => (
                      <span key={op} className="px-1 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-medium">{op}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t pt-2">
                <span>Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                <button onClick={() => setShowConn(true)} className="flex items-center gap-1 text-primary hover:underline">
                  <Wifi size={11} /> Test Connectivity
                </button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ── ProjectsPage ──────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const load = useCallback(() => {
    setLoading(true)
    listProjects()
      .then(({ data }) => setProjects(data.data?.projects || data.projects || []))
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function handleCreate(data) {
    setSaving(true); setError('')
    try {
      await createProject(data); setShowForm(false); load()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Register your microservice backends and control AI tool access through MCP
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowForm(s => !s)}><Plus size={14} /> New Project</Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FolderOpen size={16} /> Create New Project</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
            {error && <p className="text-sm text-destructive mt-3">{error}</p>}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 text-sm">
        <p className="font-medium text-primary mb-1">How Projects work as MCP Middleware</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Register your API gateway URL and individual microservices here. When a service calls{' '}
          <code className="bg-muted px-1 rounded">POST /api/tools/invoke</code> with a{' '}
          <code className="bg-muted px-1 rounded">projectId</code>, MCP validates ownership,
          enforces <code className="bg-muted px-1 rounded">allowedTools</code>, logs the call, and
          passes project context to the AI model. Click <Wifi size={11} className="inline" /> on any project to ping all registered services live.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading projects…
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to start scoping agent access.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => (
            <ProjectCard key={project.projectId} project={project} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  )
}
