import { useState, useEffect, useCallback } from 'react'
import {
  ScrollText, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, ShieldOff, Clock, X, Copy, Check, Bot,
  AlertCircle, Filter, FileText,
} from 'lucide-react'
import { listLogs, getLog, listProjects } from '../lib/api'

// ─── Helpers ─────────────────────────────────────────────────
function AllowedBadge({ allowed, statusCode }) {
  if (allowed) return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle2 size={10}/> allowed
    </span>
  )
  const isAuthErr = statusCode === 401 || statusCode === 403
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${isAuthErr ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {isAuthErr ? <ShieldOff size={10}/> : <XCircle size={10}/>}
      {isAuthErr ? 'blocked' : 'error'}
    </span>
  )
}

const METHOD_COLORS = {
  GET:    'bg-sky-50 text-sky-700 border-sky-200',
  POST:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT:    'bg-amber-50 text-amber-700 border-amber-200',
  PATCH:  'bg-orange-50 text-orange-700 border-orange-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
}

function MethodBadge({ method }) {
  return (
    <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-lg border font-mono font-semibold ${METHOD_COLORS[method?.toUpperCase()] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {method || '—'}
    </span>
  )
}

function ToolStatusBadge({ status }) {
  const ok = status === 'success'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
      {ok ? <CheckCircle2 size={10}/> : <XCircle size={10}/>}
      {status || '—'}
    </span>
  )
}

// ─── Detail sub-components ────────────────────────────────────
function InfoCell({ label, children, span }) {
  return (
    <div className={`bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 space-y-0.5 ${span ? 'col-span-2' : ''}`}>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <div className="font-medium text-gray-800 text-xs">{children}</div>
    </div>
  )
}

function Stat({ label, val }) {
  return (
    <div className="space-y-0.5">
      <p className="text-gray-400 text-[10px]">{label}</p>
      <p className="font-semibold text-sm">{val}</p>
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function CopyBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${active ? 'text-emerald-600' : 'text-indigo-500 hover:text-indigo-700'}`}>
      {active ? <Check size={11}/> : <Copy size={11}/>} {active ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ text }) {
  return (
    <pre className="whitespace-pre-wrap text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 font-mono leading-relaxed max-h-52 overflow-y-auto text-gray-700">
      {text || '—'}
    </pre>
  )
}

// ─── ToolInvokeDetail ────────────────────────────────────────
function ToolInvokeDetail({ log, copied, onCopy }) {
  function prettyInput(str) {
    if (!str) return ''
    try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoCell label="Status"><ToolStatusBadge status={log.status}/></InfoCell>
        <InfoCell label="Tool">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded-lg font-mono text-indigo-700">{log.tool || '—'}</code>
        </InfoCell>
        <InfoCell label="Project">{log.projectName || log.projectId || '—'}</InfoCell>
        <InfoCell label="Environment">{log.environment || '—'}</InfoCell>
        <InfoCell label="Caller">{log.callerEmail || '—'}</InfoCell>
        <InfoCell label="Caller Name">{log.callerName || '—'}</InfoCell>
        <InfoCell label="IP">{log.ip || '—'}</InfoCell>
        <InfoCell label="Duration">
          <span className="flex items-center gap-1"><Clock size={11}/> {log.durationMs ?? '—'}ms</span>
        </InfoCell>
        <InfoCell label="Timestamp" span>{new Date(log.timestamp).toLocaleString()}</InfoCell>
      </div>

      {log.userAgent && (
        <Section title="User Agent">
          <p className="text-xs text-gray-500 break-all">{log.userAgent}</p>
        </Section>
      )}

      {log.response?.tokenUsage && (
        <Section title="Token Usage">
          <div className="grid grid-cols-4 gap-3 bg-gray-50 border border-gray-100 rounded-xl p-3">
            <Stat label="Prompt"     val={log.response.tokenUsage.promptTokens}/>
            <Stat label="Completion" val={log.response.tokenUsage.completionTokens}/>
            <Stat label="Total"      val={log.response.tokenUsage.totalTokens}/>
            <Stat label="Model"      val={log.response.model || '—'}/>
          </div>
        </Section>
      )}

      {log.request?.input && (
        <Section title="Request Payload"
          action={<CopyBtn label="req" active={copied === 'req'} onClick={() => onCopy('req', log.request.input)}/>}>
          <CodeBlock text={prettyInput(log.request.input)}/>
        </Section>
      )}

      {log.response?.content && (
        <Section title="AI Response"
          action={<CopyBtn label="res" active={copied === 'res'} onClick={() => onCopy('res', log.response.content)}/>}>
          <pre className="whitespace-pre-wrap text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 leading-relaxed max-h-80 overflow-y-auto text-gray-700">
            {log.response.content}
          </pre>
        </Section>
      )}

      {log.error && (
        <Section title="Error">
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-mono">{log.error}</div>
        </Section>
      )}

      <Section title="Raw Log"
        action={<CopyBtn label="raw" active={copied === 'raw'} onClick={() => onCopy('raw', JSON.stringify(log, null, 2))}/>}>
        <CodeBlock text={JSON.stringify(log, null, 2)}/>
      </Section>
    </div>
  )
}

// ─── GatewayAccessDetail ──────────────────────────────────────
function GatewayAccessDetail({ log, copied, onCopy }) {
  return (
    <div className="space-y-5">
      {/* Deny reason banner */}
      {!log.allowed && log.denyReason && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
          <ShieldOff size={13} className="text-red-500 mt-0.5 flex-shrink-0"/>
          <div>
            <p className="text-xs font-semibold text-red-700">Access Denied</p>
            <p className="text-[11px] text-red-600 font-mono mt-0.5">{log.denyReason}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoCell label="Status">
          <AllowedBadge allowed={log.allowed} statusCode={log.statusCode}/>
        </InfoCell>
        <InfoCell label="HTTP Status">
          <span className={`font-mono font-bold text-sm ${(log.statusCode || 0) >= 400 ? 'text-red-600' : 'text-emerald-600'}`}>
            {log.statusCode || '—'}
          </span>
        </InfoCell>
        <InfoCell label="Method"><MethodBadge method={log.method}/></InfoCell>
        <InfoCell label="Path">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded-lg text-[10px] font-mono break-all text-indigo-700">{log.path || '—'}</code>
        </InfoCell>
        <InfoCell label="Action"><span className="font-mono text-[11px]">{log.action || '—'}</span></InfoCell>
        <InfoCell label="Resource">{log.resource || '—'}</InfoCell>
        <InfoCell label="Agent ID"><span className="font-mono text-[10px] break-all">{log.agentId || '—'}</span></InfoCell>
        <InfoCell label="Session ID"><span className="font-mono text-[10px] break-all">{log.sessionId || '—'}</span></InfoCell>
        <InfoCell label="Project">
          {log.projectName
            ? <span>{log.projectName} <span className="text-[10px] text-gray-400 font-mono">({log.projectId})</span></span>
            : (log.projectId || '—')}
        </InfoCell>
        <InfoCell label="IP">{log.ip || '—'}</InfoCell>
        <InfoCell label="Duration">
          <span className="flex items-center gap-1"><Clock size={11}/> {log.durationMs ?? log.meta?.durationMs ?? '—'}ms</span>
        </InfoCell>
        <InfoCell label="Timestamp">{new Date(log.timestamp).toLocaleString()}</InfoCell>
      </div>

      {log.meta?.userAgent && (
        <Section title="User Agent">
          <p className="text-xs text-gray-500 break-all">{log.meta.userAgent}</p>
        </Section>
      )}

      <Section title="Raw Log"
        action={<CopyBtn label="raw" active={copied === 'raw'} onClick={() => onCopy('raw', JSON.stringify(log, null, 2))}/>}>
        <CodeBlock text={JSON.stringify(log, null, 2)}/>
      </Section>
    </div>
  )
}

// ─── LogDetail drawer ─────────────────────────────────────────
function LogDetail({ logId, onClose }) {
  const [log,     setLog]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState('')

  useEffect(() => {
    setLoading(true)
    getLog(logId)
      .then(({ data }) => setLog(data.data?.log))
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [logId])

  function handleCopy(label, text) {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(label)
    setTimeout(() => setCopied(''), 1500)
  }

  const isTool = log?.source === 'tool_invoke'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-2xl h-full bg-white flex flex-col shadow-2xl border-l border-gray-100">

        {/* Drawer header */}
        <div className={`px-5 py-4 flex items-center justify-between flex-shrink-0 bg-gradient-to-r ${isTool ? 'from-indigo-600 to-violet-600' : 'from-slate-700 to-gray-800'}`}>
          <div>
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-white"/>
              <h2 className="font-semibold text-white text-sm">Log Detail</h2>
              {log && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${isTool ? 'bg-white/20 text-white border-white/30' : 'bg-white/20 text-white border-white/30'}`}>
                  {isTool ? 'tool_invoke' : 'gateway_access'}
                </span>
              )}
            </div>
            {log && <p className="text-[10px] text-white/60 font-mono mt-0.5">{log.logId}</p>}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1">
            <X size={16}/>
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
              <RefreshCw size={16} className="animate-spin"/> Loading log…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <AlertCircle size={12}/> {error}
            </div>
          )}
          {log && !loading && (
            isTool
              ? <ToolInvokeDetail log={log} copied={copied} onCopy={handleCopy}/>
              : <GatewayAccessDetail log={log} copied={copied} onCopy={handleCopy}/>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chip ─────────────────────────────────────────────────────
function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-red-500 transition-colors"><X size={9}/></button>
    </span>
  )
}

// ─── LogsPage ─────────────────────────────────────────────────
export default function LogsPage() {
  const [logs,       setLogs]       = useState([])
  const [projects,   setProjects]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [selected,   setSelected]   = useState(null)
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 })
  const [showFilters, setShowFilters] = useState(false)

  const [filters, setFilters] = useState({
    projectId: '', method: '', allowed: '', from: '', to: '',
    page: 1, limit: 20,
  })

  const load = useCallback(() => {
    setLoading(true); setError('')
    const params = {}
    if (filters.projectId) params.projectId = filters.projectId
    if (filters.method)    params.method    = filters.method
    if (filters.allowed)   params.allowed   = filters.allowed
    if (filters.from)      params.from      = filters.from
    if (filters.to)        params.to        = filters.to
    params.page  = filters.page
    params.limit = filters.limit

    listLogs(params)
      .then(({ data }) => {
        setLogs(data.data?.logs || [])
        setPagination(data.data?.pagination || { total: 0, page: 1, pages: 1 })
      })
      .catch(err => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    listProjects()
      .then(({ data }) => setProjects(data.data?.projects || []))
      .catch(() => {})
  }, [])

  function setFilter(key, val) { setFilters(f => ({ ...f, [key]: val, page: 1 })) }
  function setPage(p)          { setFilters(f => ({ ...f, page: p })) }
  function clearAll()          { setFilters({ projectId: '', method: '', allowed: '', from: '', to: '', page: 1, limit: 20 }) }

  const hasFilters = filters.projectId || filters.method || filters.allowed || filters.from || filters.to

  const selectCls = 'w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors'
  const labelCls  = 'text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1'

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero gradient header ── */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-gray-900 px-6 pt-10 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ScrollText size={18} className="text-slate-400"/>
                <span className="text-slate-400 text-sm font-medium">MCP Hub</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Audit Logs</h1>
              <p className="text-slate-400 text-sm mt-1">Full audit trail of every AI tool invocation through MCP</p>
            </div>
            <button onClick={load}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-white/20 flex-shrink-0">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{pagination.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">Total Logs</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{pagination.page}</p>
              <p className="text-xs text-slate-400 mt-0.5">Current Page</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{pagination.pages}</p>
              <p className="text-xs text-slate-400 mt-0.5">Total Pages</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content card ── */}
      <div className="max-w-6xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setShowFilters(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                  showFilters || hasFilters
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                }`}>
                <Filter size={12}/>
                Filters
                {hasFilters && <span className="bg-white/30 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">!</span>}
              </button>

              {/* Active filter chips */}
              {hasFilters && (
                <>
                  {filters.projectId && <Chip label={`project: ${projects.find(p => p.projectId === filters.projectId)?.name || filters.projectId}`} onRemove={() => setFilter('projectId', '')}/>}
                  {filters.method    && <Chip label={`method: ${filters.method}`} onRemove={() => setFilter('method', '')}/>}
                  {filters.allowed   && <Chip label={`status: ${filters.allowed === 'true' ? 'allowed' : 'blocked'}`} onRemove={() => setFilter('allowed', '')}/>}
                  {filters.from      && <Chip label={`from: ${filters.from}`} onRemove={() => setFilter('from', '')}/>}
                  {filters.to        && <Chip label={`to: ${filters.to}`} onRemove={() => setFilter('to', '')}/>}
                  <button onClick={clearAll} className="text-[10px] text-gray-400 hover:text-red-500 font-medium transition-colors">
                    Clear all
                  </button>
                </>
              )}
            </div>

            <span className="text-xs text-gray-400 flex-shrink-0">
              {pagination.total} log{pagination.total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <p className={labelCls}>Project</p>
                  <select value={filters.projectId} onChange={e => setFilter('projectId', e.target.value)} className={selectCls}>
                    <option value="">All projects</option>
                    {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className={labelCls}>Method</p>
                  <select value={filters.method} onChange={e => setFilter('method', e.target.value)} className={selectCls}>
                    <option value="">All methods</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div>
                  <p className={labelCls}>Status</p>
                  <select value={filters.allowed} onChange={e => setFilter('allowed', e.target.value)} className={selectCls}>
                    <option value="">All</option>
                    <option value="true">Allowed</option>
                    <option value="false">Blocked</option>
                  </select>
                </div>
                <div>
                  <p className={labelCls}>From</p>
                  <input type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} className={selectCls}/>
                </div>
                <div>
                  <p className={labelCls}>To</p>
                  <input type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} className={selectCls}/>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-5 mt-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <AlertCircle size={12}/> {error}
            </div>
          )}

          {/* Pagination — top */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={13}/> Prev
              </button>
              <span className="text-xs text-gray-500 font-medium">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPage(pagination.page + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight size={13}/>
              </button>
            </div>
          )}

          {/* Log table */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <RefreshCw size={24} className="animate-spin mb-3 text-indigo-300"/>
              <p className="text-sm">Loading logs…</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <ScrollText size={28} className="text-gray-300"/>
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">No logs found</p>
              <p className="text-xs text-gray-400">Logs appear here after AI tools are invoked through MCP.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 w-28">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 w-24">Method / Tool</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500">Path / Agent</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500">Caller / Project</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 w-24">Duration</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 w-36">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const isTool     = log.source === 'tool_invoke'
                    const durationMs = log.durationMs ?? log.meta?.durationMs
                    const isOk       = isTool ? log.status === 'success' : log.allowed
                    return (
                      <tr key={log.logId}
                        onClick={() => setSelected(log.logId)}
                        className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-indigo-50/40 group ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-3">
                          {isTool
                            ? <ToolStatusBadge status={log.status}/>
                            : <AllowedBadge allowed={log.allowed} statusCode={log.statusCode}/>}
                        </td>
                        <td className="px-4 py-3">
                          {isTool
                            ? <code className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold">{log.tool}</code>
                            : <MethodBadge method={log.method}/>}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-400 max-w-xs">
                          {isTool
                            ? <span className="inline-flex items-center gap-1"><Bot size={10}/> {log.callerEmail || '—'}</span>
                            : <span className="truncate block max-w-[200px]">{log.path || '—'}</span>}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-gray-500 max-w-xs">
                          {isTool ? (
                            <span>{log.projectName || log.projectId || '—'}</span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 font-mono text-gray-500"><Bot size={10}/> <span title={log.agentId}>{log.agentId ? log.agentId.slice(-12) : '—'}</span></span>
                              {(log.projectName || log.projectId) && (
                                <p className="text-[10px] text-gray-400 truncate">{log.projectName || log.projectId}</p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 text-[11px] font-medium ${(durationMs ?? 0) > 3000 ? 'text-amber-600' : 'text-gray-500'}`}>
                            <Clock size={10}/> {durationMs ?? '0'}ms
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}


        </div>

        <p className="text-center text-xs text-gray-400 py-6">
          {pagination.total} log{pagination.total !== 1 ? 's' : ''} · showing page {pagination.page} of {pagination.pages}
        </p>
      </div>

      {/* Detail drawer */}
      {selected && <LogDetail logId={selected} onClose={() => setSelected(null)}/>}
    </div>
  )
}
