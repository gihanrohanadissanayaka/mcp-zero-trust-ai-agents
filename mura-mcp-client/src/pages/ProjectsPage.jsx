import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen, Plus, RefreshCw, Pencil, Trash2, Bot,
  ChevronDown, X, Check, Wifi, WifiOff,
  Globe, Wrench, Server, AlertCircle, CheckCircle2,
  Layers, ZapIcon,
} from 'lucide-react'
import {
  listProjects, createProject, updateProject,
  deleteProject, checkProjectConnectivity,
} from '../lib/api'

// ─── Constants ───────────────────────────────────────────────
const ENVIRONMENTS  = ['development', 'staging', 'production']
const OPERATIONS    = ['read', 'write', 'execute', 'delete', 'admin']
const SERVICE_TYPES = ['auth', 'business', 'data', 'notification', 'gateway', 'other']

const ENV_BADGE = {
  development: 'bg-sky-50 text-sky-700 border-sky-200',
  staging:     'bg-amber-50 text-amber-700 border-amber-200',
  production:  'bg-emerald-50 text-emerald-700 border-emerald-200',
}
const ENV_BAR = {
  development: 'bg-sky-400',
  staging:     'bg-amber-400',
  production:  'bg-emerald-400',
}
const SVC_CHIP = {
  auth:         'bg-blue-50 text-blue-700 border-blue-200',
  business:     'bg-orange-50 text-orange-700 border-orange-200',
  gateway:      'bg-purple-50 text-purple-700 border-purple-200',
  data:         'bg-cyan-50 text-cyan-700 border-cyan-200',
  notification: 'bg-pink-50 text-pink-700 border-pink-200',
  other:        'bg-gray-100 text-gray-600 border-gray-200',
}
const ROLE_CHIP = {
  gateway: 'bg-purple-50 text-purple-700',
  auth:    'bg-blue-50 text-blue-700',
}

const EMPTY_FORM = {
  name: '', description: '', environment: 'development', tags: '',
  mcpConfig: {
    apiGatewayUrl:      '',
    allowedOperations:  ['execute'],
    allowedTools:       '',
    rateLimitPerMinute: 60,
    maxAgents:          10,
    services:           [],
  },
}

function emptyService() { return { name: '', url: '', type: 'business' } }

// ─── ProjectForm ─────────────────────────────────────────────
function ProjectForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    mcpConfig: {
      ...EMPTY_FORM.mcpConfig,
      ...initial.mcpConfig,
      allowedTools: Array.isArray(initial.mcpConfig?.allowedTools)
        ? initial.mcpConfig.allowedTools.join(', ')
        : (initial.mcpConfig?.allowedTools || ''),
      services: (initial.mcpConfig?.services || []).map(s => ({ ...s })),
    },
  }))

  function setMcp(key, val) {
    setForm(f => ({ ...f, mcpConfig: { ...f.mcpConfig, [key]: val } }))
  }

  function toggleOp(op) {
    const ops = form.mcpConfig.allowedOperations
    setMcp('allowedOperations', ops.includes(op) ? ops.filter(o => o !== op) : [...ops, op])
  }

  function addService() { setMcp('services', [...form.mcpConfig.services, emptyService()]) }
  function removeService(i) { setMcp('services', form.mcpConfig.services.filter((_, idx) => idx !== i)) }
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
        services: form.mcpConfig.services.filter(s => s.name && s.url),
      },
    })
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 bg-white transition-colors placeholder:text-gray-400'
  const labelCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide'

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Name + Environment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className={labelCls}>Project Name *</p>
          <input placeholder="my-booking-system" required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={inputCls}/>
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>Environment</p>
          <select value={form.environment}
            onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}
            className={inputCls}>
            {ENVIRONMENTS.map(env => (
              <option key={env} value={env}>{env.charAt(0).toUpperCase() + env.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Description + Tags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className={labelCls}>Description</p>
          <input placeholder="What is this project for?"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className={inputCls}/>
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>Tags <span className="text-gray-400 font-normal normal-case tracking-normal">(comma-separated)</span></p>
          <input placeholder="ai, backend, booking"
            value={typeof form.tags === 'string' ? form.tags : form.tags.join(', ')}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            className={inputCls}/>
        </div>
      </div>

      {/* MCP Config */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Bot size={14} className="text-violet-500"/> MCP Middleware Config
        </p>

        {/* API Gateway URL */}
        <div className="space-y-1.5">
          <p className={`${labelCls} flex items-center gap-1.5`}><Globe size={11}/> API Gateway URL</p>
          <input placeholder="http://localhost:4000"
            value={form.mcpConfig.apiGatewayUrl || ''}
            onChange={e => setMcp('apiGatewayUrl', e.target.value)}
            className={inputCls}/>
        </div>

        {/* Allowed Tools */}
        <div className="space-y-1.5">
          <p className={`${labelCls} flex items-center gap-1.5`}><Wrench size={11}/> Allowed Tools <span className="text-gray-400 font-normal normal-case tracking-normal">(comma-separated)</span></p>
          <input placeholder="generate_email, analyze_data"
            value={form.mcpConfig.allowedTools || ''}
            onChange={e => setMcp('allowedTools', e.target.value)}
            className={inputCls}/>
        </div>

        {/* Services */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={`${labelCls} flex items-center gap-1.5`}><Server size={11}/> Services</p>
            <button type="button" onClick={addService}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors">
              <Plus size={11}/> Add Service
            </button>
          </div>
          {form.mcpConfig.services.length === 0 && (
            <p className="text-xs text-gray-400 italic">No services added yet.</p>
          )}
          <div className="space-y-2">
            {form.mcpConfig.services.map((svc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input placeholder="auth-service" value={svc.name}
                  onChange={e => updateService(i, 'name', e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white"/>
                <input placeholder="http://localhost:4001" value={svc.url}
                  onChange={e => updateService(i, 'url', e.target.value)}
                  className="flex-[2] px-2.5 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white"/>
                <select value={svc.type} onChange={e => updateService(i, 'type', e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-200 bg-white">
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => removeService(i)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                  <X size={13}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Operations */}
        <div className="space-y-2">
          <p className={labelCls}>Allowed Agent Operations</p>
          <div className="flex flex-wrap gap-2">
            {OPERATIONS.map(op => {
              const active = form.mcpConfig.allowedOperations.includes(op)
              return (
                <button key={op} type="button" onClick={() => toggleOp(op)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    active ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                  }`}>
                  {op}
                </button>
              )
            })}
          </div>
        </div>

        {/* Rate Limit + Max Agents */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className={labelCls}>Rate Limit (req/min)</p>
            <input type="number" min="1" max="1000"
              value={form.mcpConfig.rateLimitPerMinute}
              onChange={e => setMcp('rateLimitPerMinute', Number(e.target.value))}
              className={inputCls}/>
          </div>
          <div className="space-y-1.5">
            <p className={labelCls}>Max Agents</p>
            <input type="number" min="1" max="100"
              value={form.mcpConfig.maxAgents}
              onChange={e => setMcp('maxAgents', Number(e.target.value))}
              className={inputCls}/>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm shadow-violet-200">
          {saving ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
          {saving ? 'Saving…' : 'Save Project'}
        </button>
      </div>
    </form>
  )
}

// ─── ConnectivityPanel ────────────────────────────────────────
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
    } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { runCheck() }, [runCheck])

  const allOk         = result?.connectivity === 'all_reachable'
  const notConfigured = result?.connectivity === 'not_configured'

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Wifi size={14} className="text-violet-500"/> Connectivity Test
        </p>
        <div className="flex items-center gap-2">
          <button onClick={runCheck} disabled={loading}
            className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50 transition-colors">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''}/>  Re-run
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={14}/></button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <RefreshCw size={14} className="animate-spin"/> Pinging services…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle size={12}/> {error}
        </div>
      )}

      {result && !loading && (
        notConfigured ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <Server size={14} className="flex-shrink-0 text-gray-400"/>
            No services configured. Add an API Gateway URL or services to enable testing.
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
              allOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {allOk ? <CheckCircle2 size={12}/> : <AlertCircle size={12}/>}
              {allOk ? 'All services reachable' : 'Some services unreachable'}
              <span className="text-gray-400 font-normal ml-1">
                · {new Date(result.checkedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="space-y-1.5">
              {result.services?.map((svc, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {svc.status === 'reachable'
                      ? <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0"/>
                      : <WifiOff       size={13} className="text-red-500 flex-shrink-0"/>}
                    <span className="font-medium text-gray-700">{svc.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-lg text-[10px] font-medium ${ROLE_CHIP[svc.role] || 'bg-orange-50 text-orange-700'}`}>
                      {svc.role}
                    </span>
                    <span className="text-gray-400 font-mono truncate hidden sm:block">{svc.url}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {svc.httpStatus && (
                      <span className={`font-mono text-[10px] ${svc.httpStatus < 400 ? 'text-emerald-600' : 'text-red-600'}`}>
                        HTTP {svc.httpStatus}
                      </span>
                    )}
                    <span className="text-gray-400 text-[11px]">{svc.latencyMs}ms</span>
                    {svc.error && <span className="text-red-500 truncate max-w-32">{svc.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── ProjectCard ──────────────────────────────────────────────
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

  const cfg       = project.mcpConfig || {}
  const toolsList = Array.isArray(cfg.allowedTools) ? cfg.allowedTools : []
  const accentBar = ENV_BAR[project.environment] || 'bg-gray-200'
  const envBadge  = ENV_BADGE[project.environment] || 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      <div className="flex">
        {/* Environment accent bar */}
        <div className={`w-1 flex-shrink-0 ${accentBar}`}/>

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            {/* Icon + info */}
            <button className="flex items-start gap-3 flex-1 min-w-0 text-left"
              onClick={() => { if (!editing) setExpanded(e => !e) }}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 text-white shadow-sm">
                <FolderOpen size={16}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{project.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${envBadge}`}>
                    {project.environment}
                  </span>
                  {toolsList.map(tool => (
                    <span key={tool} className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg font-medium">
                      {tool}
                    </span>
                  ))}
                </div>
                {project.description && (
                  <p className="text-xs text-gray-500 truncate">{project.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[10px] text-gray-400 font-mono">{project.projectId}</p>
                  {cfg.apiGatewayUrl && (
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 truncate">
                      <Globe size={9}/> {cfg.apiGatewayUrl}
                    </p>
                  )}
                </div>
              </div>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="flex items-center gap-1 text-xs text-gray-400 mr-1">
                <Bot size={11}/> {project.agentCount ?? 0}
              </span>
              <button title="Test Connectivity"
                onClick={() => { setExpanded(true); setEditing(false); setShowConn(s => !s) }}
                className={`p-2 rounded-xl transition-colors text-sm ${showConn ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-violet-600 hover:bg-violet-50'}`}>
                <Wifi size={14}/>
              </button>
              <button title="Expand / collapse"
                onClick={() => { setEditing(false); setShowConn(false); setExpanded(e => !e) }}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`}/>
              </button>
              <button title="Edit" onClick={startEdit}
                className="p-2 rounded-xl text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors">
                <Pencil size={14}/>
              </button>
              <button title="Delete" onClick={handleDelete} disabled={deleting}
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={14}/>
              </button>
            </div>
          </div>

          {/* Tags */}
          {project.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              {project.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 rounded-lg font-medium">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 pb-5 pt-4">
          {showConn && !editing && (
            <ConnectivityPanel projectId={project.projectId} onClose={() => setShowConn(false)}/>
          )}

          {editing && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Pencil size={13} className="text-violet-500"/> Edit Project
              </p>
              <ProjectForm
                initial={{
                  name: project.name, description: project.description,
                  environment: project.environment,
                  tags: project.tags?.join(', ') || '',
                  mcpConfig: cfg,
                }}
                onSave={handleUpdate}
                onCancel={() => { setEditing(false); setExpanded(false) }}
                saving={saving}
              />
              {msg && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-3">
                  <AlertCircle size={11}/> {msg}
                </div>
              )}
            </div>
          )}

          {!editing && !showConn && (
            <div className="space-y-4">
              {/* Gateway + Tools */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cfg.apiGatewayUrl && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                      <Globe size={10}/> API Gateway
                    </p>
                    <p className="text-xs font-mono text-gray-700 break-all">{cfg.apiGatewayUrl}</p>
                  </div>
                )}
                {toolsList.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                      <Wrench size={10}/> Allowed Tools
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {toolsList.map(tool => (
                        <span key={tool} className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg font-medium">{tool}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Services table */}
              {cfg.services?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold flex items-center gap-1">
                    <Server size={10}/> Registered Services
                  </p>
                  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Name</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">URL</th>
                          <th className="text-left px-4 py-2 font-semibold text-gray-500">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cfg.services.map((svc, i) => (
                          <tr key={i} className={i > 0 ? 'border-t border-gray-100' : ''}>
                            <td className="px-4 py-2.5 font-medium text-gray-700">{svc.name}</td>
                            <td className="px-4 py-2.5 font-mono text-gray-400 truncate max-w-[200px]">{svc.url}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border ${SVC_CHIP[svc.type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
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

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Rate Limit</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">
                    {cfg.rateLimitPerMinute ?? 60} <span className="text-xs font-normal text-gray-400">req/min</span>
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Max Agents</p>
                  <p className="text-sm font-bold text-gray-800 mt-0.5">{cfg.maxAgents ?? 10}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-3 py-2.5">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Operations</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(cfg.allowedOperations || []).map(op => (
                      <span key={op} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded-lg text-[10px] font-medium">{op}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                <span>
                  Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleDateString()}
                </span>
                <button onClick={() => setShowConn(true)}
                  className="flex items-center gap-1 text-violet-600 hover:text-violet-800 font-medium transition-colors">
                  <Wifi size={11}/> Test Connectivity
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ProjectsPage ─────────────────────────────────────────────
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

  const counts = {
    total:      projects.length,
    production: projects.filter(p => p.environment === 'production').length,
    active:     projects.filter(p => (p.agentCount ?? 0) > 0).length,
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero gradient header ── */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 px-6 pt-10 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers size={18} className="text-violet-300"/>
                <span className="text-violet-300 text-sm font-medium">MCP Hub</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Projects</h1>
              <p className="text-violet-300 text-sm mt-1">Register backends and control AI tool access through MCP middleware</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-white text-violet-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-violet-50 transition-colors shadow-lg shadow-violet-900/20 flex-shrink-0">
              <Plus size={15}/> New Project
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{counts.total}</p>
              <p className="text-xs text-violet-200 mt-0.5">Total</p>
            </div>
            <div className="bg-emerald-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-emerald-400/30">
              <p className="text-2xl font-bold text-emerald-200 tabular-nums">{counts.production}</p>
              <p className="text-xs text-emerald-300 mt-0.5">Production</p>
            </div>
            <div className="bg-violet-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-violet-400/30">
              <p className="text-2xl font-bold text-violet-200 tabular-nums">{counts.active}</p>
              <p className="text-xs text-violet-300 mt-0.5">With Agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content card ── */}
      <div className="max-w-5xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500">
              {projects.length} project{projects.length !== 1 ? 's' : ''} registered
            </p>
            <button onClick={load} title="Refresh"
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>

          {/* Info banner */}
          <div className="mx-5 mt-4 bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5 mb-1">
              <ZapIcon size={11}/> How Projects work as MCP Middleware
            </p>
            <p className="text-xs text-violet-600 leading-relaxed">
              Register your API gateway URL and microservices here. When a service calls{' '}
              <code className="bg-violet-100 px-1 rounded font-mono">POST /api/tools/invoke</code> with a{' '}
              <code className="bg-violet-100 px-1 rounded font-mono">projectId</code>, MCP validates ownership,
              enforces <code className="bg-violet-100 px-1 rounded font-mono">allowedTools</code>, logs the call,
              and passes project context to the AI model.
              Click <Wifi size={10} className="inline"/> on any project to ping all registered services live.
            </p>
          </div>

          {/* Project list */}
          <div className="p-5">
            {loading ? (
              <div className="text-center py-20 text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-violet-300"/>
                <p className="text-sm">Loading projects…</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <FolderOpen size={28} className="text-gray-300"/>
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">No projects yet</p>
                <p className="text-xs text-gray-400">Create your first project to start scoping agent access.</p>
                <button onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                  <Plus size={14}/> New Project
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map(project => (
                  <ProjectCard key={project.projectId} project={project} onRefresh={load}/>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-6">
          {projects.length} project{projects.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {/* ── Create Project Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-12">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 z-10 my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <FolderOpen size={16} className="text-white"/>
                <h2 className="text-white font-semibold">Create New Project</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="text-white/60 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto">
              <ProjectForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving}/>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mt-3">
                  <AlertCircle size={12}/> {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
