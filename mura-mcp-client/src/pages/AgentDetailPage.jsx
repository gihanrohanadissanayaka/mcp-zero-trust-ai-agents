import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, RotateCcw, ShieldOff, Trash2, ShieldCheck,
  Pencil, X, Check, Eye, PenLine, Crown, Server, Bot, AlertCircle, Key, Copy,
} from 'lucide-react'
import { getAgent, updateAgent, deactivateAgent, rotateAgentSecret, listAgentSessions, revokeAgentSessions, listProjects, authenticateAgent } from '../lib/api'

const TOOLS = [
  'search_web','read_file','write_file','execute_code',
  'query_database','send_email','call_api','manage_files',
  'analyze_data','generate_report',
]

const OPERATIONS = [
  { value: 'read',  label: 'Read',  icon: Eye,     desc: 'GET requests only',           color: 'border-sky-400 bg-sky-50 text-sky-700' },
  { value: 'write', label: 'Write', icon: PenLine,  desc: 'POST / PUT / PATCH / DELETE', color: 'border-violet-400 bg-violet-50 text-violet-700' },
  { value: 'admin', label: 'Admin', icon: Crown,    desc: 'Full access including admin',  color: 'border-amber-400 bg-amber-50 text-amber-700' },
]

const SERVICES = [
  { value: 'booking',   label: 'Booking',   color: 'border-indigo-400 bg-indigo-50 text-indigo-700' },
  { value: 'traveller', label: 'Traveller', color: 'border-teal-400   bg-teal-50   text-teal-700'   },
  { value: 'payment',   label: 'Payment',   color: 'border-rose-400   bg-rose-50   text-rose-700'    },
  { value: 'auth',      label: 'Auth',      color: 'border-gray-400   bg-gray-50   text-gray-700'   },
]

function fmt(date) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

export default function AgentDetailPage() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [agent,       setAgent]       = useState(null)
  const [projects,    setProjects]    = useState([])
  const [sessions,    setSessions]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [actionMsg,   setActionMsg]   = useState('')
  const [secretResult,setSecretResult]= useState(null)
  const [editing,     setEditing]     = useState(false)
  const [editForm,    setEditForm]    = useState({})
  const [saving,      setSaving]      = useState(false)

  // ── Token generation state ──
  const DURATION_OPTIONS = [
    { label: '30 minutes', minutes: 30 },
    { label: '1 hour',     minutes: 60 },
    { label: '4 hours',    minutes: 240 },
    { label: '8 hours',    minutes: 480 },
    { label: '1 day',      minutes: 1440 },
    { label: '3 days',     minutes: 4320 },
    { label: '1 week',     minutes: 10080 },
  ]
  const [tokenSecret,      setTokenSecret]      = useState('')
  const [tokenDuration,    setTokenDuration]    = useState(60)
  const [tokenResult,      setTokenResult]      = useState(null)
  const [tokenError,       setTokenError]       = useState('')
  const [tokenGenerating,  setTokenGenerating]  = useState(false)
  const [tokenCopied,      setTokenCopied]      = useState(false)

  async function handleGenerateToken() {
    setTokenError('')
    setTokenResult(null)
    if (!tokenSecret.trim()) { setTokenError('Enter the agent secret.'); return }
    setTokenGenerating(true)
    try {
      const { data } = await authenticateAgent({
        agentId,
        agentSecret: tokenSecret.trim(),
        context: 'mcp-client',
        requestedDurationMinutes: tokenDuration,
      })
      setTokenResult(data.data || data)
    } catch (err) {
      setTokenError(err.response?.data?.error || err.message || 'Authentication failed.')
    } finally {
      setTokenGenerating(false)
    }
  }

  function handleCopyToken() {
    if (!tokenResult?.accessToken) return
    navigator.clipboard.writeText(tokenResult.accessToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      getAgent(agentId),
      listAgentSessions(agentId),
      listProjects().catch(() => ({ data: { data: { projects: [] } } }))
    ])
      .then(([agentRes, sessionRes, projRes]) => {
        const a = agentRes.data.data || agentRes.data.agent || agentRes.data
        setAgent(a)
        setEditForm({
          name:              a.name        || '',
          description:       a.description || '',
          allowedTools:      a.policy?.allowedTools      || a.allowedTools      || [],
          allowedProjects:   a.policy?.allowedProjects   || a.allowedProjects   || [],
          allowedOperations: a.policy?.allowedOperations || a.allowedOperations || ['read'],
          allowedServices:   a.policy?.allowedServices   || a.allowedServices   || [],
        })
        setSessions(sessionRes.data.data?.sessions || sessionRes.data.sessions || sessionRes.data || [])
        setProjects(projRes.data.data?.projects || projRes.data.projects || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [agentId])

  useEffect(load, [load])

  function toggleEditTool(tool) {
    setEditForm(f => ({
      ...f,
      allowedTools: f.allowedTools.includes(tool)
        ? f.allowedTools.filter(t => t !== tool)
        : [...f.allowedTools, tool],
    }))
  }
  function toggleEditProject(pid) {
    setEditForm(f => ({
      ...f,
      allowedProjects: f.allowedProjects.includes(pid)
        ? f.allowedProjects.filter(p => p !== pid)
        : [...f.allowedProjects, pid],
    }))
  }
  function toggleEditOperation(op) {
    setEditForm(f => ({
      ...f,
      allowedOperations: f.allowedOperations.includes(op)
        ? f.allowedOperations.filter(o => o !== op)
        : [...f.allowedOperations, op],
    }))
  }
  function toggleEditService(svc) {
    setEditForm(f => ({
      ...f,
      allowedServices: f.allowedServices.includes(svc)
        ? f.allowedServices.filter(s => s !== svc)
        : [...f.allowedServices, svc],
    }))
  }

  async function handleSaveEdit() {
    setSaving(true)
    setActionMsg('')
    try {
      await updateAgent(agentId, editForm)
      setEditing(false)
      setActionMsg('Agent updated successfully.')
      load()
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    } finally {
      setSaving(false)
    }
  }

  async function handleRotate() {
    if (!window.confirm('Rotate agent secret? All existing sessions will be invalidated.')) return
    try {
      const { data } = await rotateAgentSecret(agentId)
      setSecretResult(data.data?.agentSecret || data.agentSecret || data.newSecret)
      setActionMsg('Secret rotated successfully.')
      load()
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete agent "${agent?.name}"?\nThis will deactivate it and revoke all sessions.`)) return
    try {
      await deactivateAgent(agentId)
      navigate('/agents')
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  async function handleDeactivate() {
    if (!window.confirm('Deactivate this agent? It will no longer be able to authenticate.')) return
    try {
      await deactivateAgent(agentId)
      setActionMsg('Agent deactivated.')
      load()
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  async function handleRevokeSessions() {
    if (!window.confirm('Revoke all active sessions?')) return
    try {
      await revokeAgentSessions(agentId)
      setActionMsg('All sessions revoked.')
      load()
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex items-center gap-2 text-gray-400">
        <RefreshCw size={18} className="animate-spin"/> Loading agent...
      </div>
    </div>
  )
  if (!agent) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">Agent not found.</p>
    </div>
  )

  const envColors = {
    development: 'border-sky-300 bg-sky-50 text-sky-700',
    staging:     'border-yellow-300 bg-yellow-50 text-yellow-700',
    production:  'border-green-300 bg-green-50 text-green-700',
  }

  const isActive = agent.status === 'active' || agent.active

  const allowedOps  = agent.policy?.allowedOperations || agent.allowedOperations || ['read']
  const allowedSvcs = agent.policy?.allowedServices   || agent.allowedServices   || []
  const allowedTools= agent.policy?.allowedTools      || agent.allowedTools      || []
  const allowedProjs= agent.policy?.allowedProjects   || agent.allowedProjects   || []

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero gradient header ── */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-8 pb-20">
        <div className="max-w-5xl mx-auto">

          {/* Back */}
          <Link to="/agents"
            className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-white text-sm mb-6 transition-colors">
            <ArrowLeft size={14}/> All Agents
          </Link>

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/25 flex-shrink-0">
                <Bot size={26} className="text-white"/>
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h1 className="text-2xl font-bold text-white tracking-tight">{agent.name}</h1>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    isActive
                      ? 'bg-emerald-400/20 text-emerald-200 border-emerald-400/40'
                      : 'bg-gray-400/20 text-gray-300 border-gray-400/40'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-gray-400'}`}/>
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="font-mono text-indigo-300 text-xs">{agentId}</p>
                {agent.description && (
                  <p className="text-indigo-200 text-sm mt-1.5">{agent.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { setEditing(e => !e); setActionMsg('') }}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/25 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition-colors backdrop-blur-sm">
                {editing ? <><X size={14}/> Cancel</> : <><Pencil size={14}/> Edit</>}
              </button>
              <button onClick={handleDelete}
                className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-red-200 hover:text-white text-sm font-medium px-3.5 py-2 rounded-xl transition-colors">
                <Trash2 size={14}/> Delete
              </button>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3 mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">
                {agent.authCount ?? agent.stats?.totalAuths ?? 0}
              </p>
              <p className="text-xs text-indigo-200 mt-0.5">Total Auths</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{sessions.length}</p>
              <p className="text-xs text-indigo-200 mt-0.5">Sessions</p>
            </div>
            <div className={`backdrop-blur-sm rounded-2xl px-4 py-3 text-center border ${
              isActive ? 'bg-emerald-500/20 border-emerald-400/30' : 'bg-gray-500/20 border-gray-400/30'
            }`}>
              <p className={`text-2xl font-bold tabular-nums ${isActive ? 'text-emerald-200' : 'text-gray-300'}`}>
                {allowedOps.length}
              </p>
              <p className={`text-xs mt-0.5 ${isActive ? 'text-emerald-300' : 'text-gray-400'}`}>
                Operations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-6 -mt-8 pb-12">

        {/* Banners */}
        {actionMsg && (
          <div className={`mb-4 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-sm border ${
            actionMsg.startsWith('Error')
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {actionMsg.startsWith('Error') ? <AlertCircle size={15}/> : <Check size={15}/>}
            <span className="flex-1">{actionMsg}</span>
            <button onClick={() => setActionMsg('')} className="opacity-60 hover:opacity-100"><X size={13}/></button>
          </div>
        )}

        {secretResult && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={12}/> New Agent Secret — copy now, shown once!
            </p>
            <code className="text-sm font-mono break-all select-all bg-amber-100 block rounded-xl px-3 py-2 text-amber-900">
              {secretResult}
            </code>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ─── LEFT: 2/3 wide ─── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Identity card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Identity</h2>
                <span className="text-[11px] text-gray-400 font-mono truncate max-w-[200px]">{agentId}</span>
              </div>
              <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5 uppercase tracking-wide">Created</p>
                  <p className="text-gray-800 font-medium text-xs">{fmt(agent.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5 uppercase tracking-wide">Last Auth</p>
                  <p className="text-gray-800 font-medium text-xs">{fmt(agent.lastAuthAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 mb-0.5 uppercase tracking-wide">Auth Count</p>
                  <p className="text-gray-800 font-bold text-sm">{agent.authCount ?? agent.stats?.totalAuths ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Policy card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center px-5 py-4 border-b border-gray-100">
                <ShieldCheck size={14} className="text-indigo-500 mr-2"/>
                <h2 className="font-semibold text-gray-800 text-sm">Policy</h2>
              </div>
              <div className="px-5 py-4 space-y-5">

                {/* Operations */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Operations</p>
                  <div className="flex flex-wrap gap-2">
                    {allowedOps.map(op => {
                      const meta = OPERATIONS.find(o => o.value === op)
                      const Icon = meta?.icon
                      return (
                        <span key={op}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${meta?.color || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                          {Icon && <Icon size={11}/>}{op}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Services */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {allowedSvcs.length === 0
                      ? <span className="text-xs text-gray-400 italic bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                          All services (no restriction)
                        </span>
                      : allowedSvcs.map(svc => {
                          const meta = SERVICES.find(s => s.value === svc)
                          return (
                            <span key={svc}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${meta?.color || 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                              <Server size={11}/>{svc}
                            </span>
                          )
                        })
                    }
                  </div>
                </div>

                {/* Tools */}
                {allowedTools.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Tools</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedTools.map(t => (
                        <span key={t} className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Projects */}
                {allowedProjs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Projects</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedProjs.map(p => (
                        <span key={p} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sessions card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">
                  Sessions <span className="text-gray-400 font-normal">({sessions.length})</span>
                </h2>
                <div className="flex items-center gap-1">
                  <button onClick={load}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-xl hover:bg-gray-100 transition-colors">
                    <RefreshCw size={11}/> Refresh
                  </button>
                  {sessions.length > 0 && (
                    <button onClick={handleRevokeSessions}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded-xl hover:bg-red-50 transition-colors">
                      <Trash2 size={11}/> Revoke All
                    </button>
                  )}
                </div>
              </div>
              {sessions.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2">
                    <ShieldOff size={18} className="text-gray-300"/>
                  </div>
                  <p className="text-sm">No active sessions.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {sessions.map(s => (
                    <div key={s.sessionId || s._id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                      <div>
                        <p className="font-mono text-xs text-gray-700">{s.sessionId || s._id}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Created: {fmt(s.createdAt)} · Expires: {fmt(s.expiresAt)}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex-shrink-0 ${
                        s.revoked
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        {s.revoked ? 'revoked' : 'active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT: Actions sidebar ─── */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800 text-sm">Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                <button
                  onClick={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors text-left">
                  <Pencil size={14} className="text-indigo-500 flex-shrink-0"/> Edit Agent
                </button>
                <Link to={`/agents/${agentId}/policy`}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors">
                  <ShieldCheck size={14} className="text-violet-500 flex-shrink-0"/> Policy Editor
                </Link>
                <button onClick={handleRotate}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 transition-colors text-left">
                  <RotateCcw size={14} className="text-amber-500 flex-shrink-0"/> Rotate Secret
                </button>
                <button onClick={handleRevokeSessions} disabled={sessions.length === 0}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left">
                  <Trash2 size={14} className="text-orange-400 flex-shrink-0"/> Revoke Sessions
                </button>
                <div className="pt-1 border-t border-gray-100"/>
                <button onClick={handleDeactivate} disabled={!isActive}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-yellow-700 border border-yellow-300 bg-yellow-50 hover:bg-yellow-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left">
                  <ShieldOff size={14} className="flex-shrink-0"/> Deactivate Agent
                </button>
                <button onClick={handleDelete}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-sm shadow-red-200 text-left">
                  <Trash2 size={14} className="flex-shrink-0"/> Delete Agent
                </button>
              </div>
            </div>

            {/* ── Generate Token panel ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                <Key size={14} className="text-emerald-600"/>
                <h2 className="font-semibold text-gray-800 text-sm">Generate Token</h2>
              </div>
              <div className="p-4 space-y-3">
                {/* Secret input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Agent Secret</label>
                  <input
                    type="password"
                    value={tokenSecret}
                    onChange={e => { setTokenSecret(e.target.value); setTokenResult(null); setTokenError('') }}
                    placeholder="Enter agent secret…"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-colors"
                  />
                </div>

                {/* Duration dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Session Duration</label>
                  <select
                    value={tokenDuration}
                    onChange={e => { setTokenDuration(Number(e.target.value)); setTokenResult(null) }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-colors cursor-pointer"
                  >
                    {DURATION_OPTIONS.map(opt => (
                      <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400">Capped by agent policy max session duration.</p>
                </div>

                {/* Error */}
                {tokenError && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200">
                    <AlertCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0"/>
                    <p className="text-xs text-red-600">{tokenError}</p>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerateToken}
                  disabled={tokenGenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm shadow-emerald-200">
                  {tokenGenerating
                    ? <><RefreshCw size={13} className="animate-spin"/> Generating…</>
                    : <><Key size={13}/> Generate Token</>}
                </button>

                {/* Token result */}
                {tokenResult && (
                  <div className="space-y-2 pt-1">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Access Token</span>
                        <button
                          onClick={handleCopyToken}
                          className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800 transition-colors">
                          <Copy size={11}/>{tokenCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-emerald-800 break-all leading-relaxed bg-white rounded-lg px-2 py-1.5 border border-emerald-100">
                        {tokenResult.accessToken}
                      </p>
                    </div>
                    {tokenResult.expiresAt && (
                      <p className="text-[11px] text-gray-400 text-center">
                        Expires: {new Date(tokenResult.expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-12">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditing(false)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 z-10 my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/20 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <Pencil size={15} className="text-white"/>
                <h2 className="text-white font-semibold">Edit Agent</h2>
              </div>
              <button onClick={() => setEditing(false)} className="text-white/60 hover:text-white transition-colors">
                <X size={18}/>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Name</label>
                  <input value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"/>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</label>
                  <input value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"/>
                </div>
              </div>

              {/* Operations */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Operations</label>
                <p className="text-xs text-gray-400">Controls what HTTP methods this agent can invoke through the gateway.</p>
                <div className="flex flex-wrap gap-2">
                  {OPERATIONS.map(({ value, label, icon: Icon, desc, color }) => {
                    const active = editForm.allowedOperations.includes(value)
                    return (
                      <button key={value} type="button" onClick={() => toggleEditOperation(value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${active ? color + ' shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                        <Icon size={13}/> {label}
                        {active && <Check size={11} className="ml-0.5"/>}
                        <span className="text-[10px] opacity-60 hidden sm:inline">— {desc}</span>
                      </button>
                    )
                  })}
                </div>
                {editForm.allowedOperations.length === 0 && (
                  <p className="text-xs text-red-500">Select at least one operation.</p>
                )}
              </div>

              {/* Services */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Services</label>
                <p className="text-xs text-gray-400">Restrict which microservices this agent can reach. Empty = all allowed.</p>
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map(({ value, label, color }) => {
                    const active = editForm.allowedServices.includes(value)
                    return (
                      <button key={value} type="button" onClick={() => toggleEditService(value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${active ? color + ' shadow-sm' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                        <Server size={13}/> {label}
                        {active && <Check size={11} className="ml-0.5"/>}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-gray-400">
                  {editForm.allowedServices.length === 0
                    ? '⚠️ No restriction — agent can reach every service'
                    : `✅ Restricted to: ${editForm.allowedServices.join(', ')}`}
                </p>
              </div>

              {/* Tools */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Allowed Tools</label>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map(tool => (
                    <button key={tool} type="button" onClick={() => toggleEditTool(tool)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        editForm.allowedTools.includes(tool)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}>
                      {tool}
                    </button>
                  ))}
                </div>
              </div>

              {/* Projects */}
              {projects.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Allowed Projects</label>
                  <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 min-h-[44px]">
                    {projects.map(p => {
                      const checked = editForm.allowedProjects.includes(p.projectId)
                      return (
                        <button key={p.projectId} type="button" onClick={() => toggleEditProject(p.projectId)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                            checked
                              ? 'border-indigo-500 bg-indigo-600 text-white'
                              : (envColors[p.environment] || 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300')
                          }`}>
                          {checked && <Check size={10}/>}
                          {p.name}
                          <span className="opacity-60 text-[10px]">{p.environment}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving || editForm.allowedOperations.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm shadow-indigo-200">
                {saving ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
