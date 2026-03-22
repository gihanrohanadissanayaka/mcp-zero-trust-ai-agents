import { useState, useEffect, useCallback } from 'react'
import {
  ScrollText, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, ShieldOff, Clock, Loader2,
  X, Copy, Check
} from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { listLogs, getLog, listProjects } from '../lib/api'

// ── Helpers ───────────────────────────────────────────────────
const STATUS_CONFIG = {
  success:  { icon: CheckCircle2, cls: 'text-green-600',      bg: 'bg-green-50 text-green-700 border-green-200' },
  failed:   { icon: XCircle,      cls: 'text-destructive',    bg: 'bg-red-50 text-red-700 border-red-200'       },
  rejected: { icon: ShieldOff,    cls: 'text-yellow-600',     bg: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

function StatusBadge({ status }) {
  const cfg  = STATUS_CONFIG[status] || STATUS_CONFIG.failed
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.bg}`}>
      <Icon size={10} /> {status}
    </span>
  )
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

// ── Detail drawer ─────────────────────────────────────────────
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
    copyToClipboard(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl h-full bg-background border-l shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-sm">Log Detail</h2>
            {log && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{log.logId}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading log…
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {log && !loading && (
            <>
              {/* Overview grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <InfoCell label="Status">     <StatusBadge status={log.status} /></InfoCell>
                <InfoCell label="Tool">       <code className="bg-muted px-1 py-0.5 rounded">{log.tool}</code></InfoCell>
                <InfoCell label="Project">    {log.projectName || log.projectId || '—'}</InfoCell>
                <InfoCell label="Environment">{log.environment || '—'}</InfoCell>
                <InfoCell label="Caller">     {log.callerEmail || '—'}</InfoCell>
                <InfoCell label="IP">         {log.ip || '—'}</InfoCell>
                <InfoCell label="Duration">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {log.durationMs}ms
                  </span>
                </InfoCell>
                <InfoCell label="Timestamp">  {new Date(log.timestamp).toLocaleString()}</InfoCell>
              </div>

              {/* Token usage */}
              {log.response?.tokenUsage && (
                <Section title="Token Usage">
                  <div className="flex gap-4 text-xs">
                    <Stat label="Prompt"     val={log.response.tokenUsage.promptTokens} />
                    <Stat label="Completion" val={log.response.tokenUsage.completionTokens} />
                    <Stat label="Total"      val={log.response.tokenUsage.totalTokens} />
                    <Stat label="Model"      val={log.response.model || '—'} />
                  </div>
                </Section>
              )}

              {/* Request */}
              <Section
                title="Request Payload"
                action={<CopyBtn label="req" active={copied === 'req'} onClick={() => handleCopy('req', log.request?.input || '')} />}
              >
                <CodeBlock text={prettyJson(log.request?.input)} />
              </Section>

              {/* Response */}
              {log.response?.content && (
                <Section
                  title="AI Response"
                  action={<CopyBtn label="res" active={copied === 'res'} onClick={() => handleCopy('res', log.response.content)} />}
                >
                  <pre className="whitespace-pre-wrap text-xs bg-muted/50 border rounded-md p-3 leading-relaxed max-h-80 overflow-y-auto">
                    {log.response.content}
                  </pre>
                </Section>
              )}

              {/* Error */}
              {log.error && (
                <Section title="Error">
                  <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-700 font-mono">
                    {log.error}
                  </div>
                </Section>
              )}

              {/* User agent */}
              {log.userAgent && (
                <Section title="User Agent">
                  <p className="text-xs text-muted-foreground break-all">{log.userAgent}</p>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small reusable sub-components ─────────────────────────────
function InfoCell({ label, children }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="font-medium text-foreground">{children}</div>
    </div>
  )
}

function Stat({ label, val }) {
  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-semibold">{val}</p>
    </div>
  )
}

function Section({ title, action, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

function CopyBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-primary hover:underline">
      {active ? <Check size={11} /> : <Copy size={11} />} {active ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ text }) {
  return (
    <pre className="whitespace-pre-wrap text-xs bg-muted/50 border rounded-md p-3 font-mono leading-relaxed max-h-52 overflow-y-auto">
      {text || '—'}
    </pre>
  )
}

function prettyJson(str) {
  if (!str) return ''
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}

// ── LogsPage ──────────────────────────────────────────────────
export default function LogsPage() {
  const [logs,      setLogs]      = useState([])
  const [projects,  setProjects]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [selected,  setSelected]  = useState(null)   // logId for detail
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 })

  // Filters
  const [filters, setFilters] = useState({
    projectId: '', tool: '', status: '', from: '', to: '',
    page: 1, limit: 20
  })

  const load = useCallback(() => {
    setLoading(true); setError('')
    const params = {}
    if (filters.projectId) params.projectId = filters.projectId
    if (filters.tool)      params.tool      = filters.tool
    if (filters.status)    params.status    = filters.status
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

  // Load projects for the filter dropdown
  useEffect(() => {
    listProjects()
      .then(({ data }) => setProjects(data.data?.projects || []))
      .catch(() => {})
  }, [])

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val, page: 1 }))
  }

  function setPage(p) {
    setFilters(f => ({ ...f, page: p }))
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ScrollText size={28} className="text-primary" /> Logs
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Full audit trail of every AI tool invocation through MCP
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Project */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Project</label>
              <select
                value={filters.projectId}
                onChange={e => setFilter('projectId', e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All projects</option>
                {projects.map(p => (
                  <option key={p.projectId} value={p.projectId}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Tool */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Tool</label>
              <select
                value={filters.tool}
                onChange={e => setFilter('tool', e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All tools</option>
                <option value="generate_email">generate_email</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
              <select
                value={filters.status}
                onChange={e => setFilter('status', e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All statuses</option>
                <option value="success">success</option>
                <option value="failed">failed</option>
                <option value="rejected">rejected</option>
              </select>
            </div>

            {/* From */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">From</label>
              <input
                type="date"
                value={filters.from}
                onChange={e => setFilter('from', e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* To */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1">To</label>
              <input
                type="date"
                value={filters.to}
                onChange={e => setFilter('to', e.target.value)}
                className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Active filter chips + clear */}
          {(filters.projectId || filters.tool || filters.status || filters.from || filters.to) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Filters:</span>
              {filters.projectId && <Chip label={`project: ${projects.find(p => p.projectId === filters.projectId)?.name || filters.projectId}`} onRemove={() => setFilter('projectId', '')} />}
              {filters.tool      && <Chip label={`tool: ${filters.tool}`}   onRemove={() => setFilter('tool', '')} />}
              {filters.status    && <Chip label={`status: ${filters.status}`} onRemove={() => setFilter('status', '')} />}
              {filters.from      && <Chip label={`from: ${filters.from}`}   onRemove={() => setFilter('from', '')} />}
              {filters.to        && <Chip label={`to: ${filters.to}`}       onRemove={() => setFilter('to', '')} />}
              <button onClick={() => setFilters({ projectId: '', tool: '', status: '', from: '', to: '', page: 1, limit: 20 })} className="text-[10px] text-primary hover:underline ml-1">
                Clear all
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="flex items-center justify-between mb-3 text-sm text-muted-foreground">
        <span>{pagination.total} log{pagination.total !== 1 ? 's' : ''} found</span>
        <span>Page {pagination.page} of {pagination.pages}</span>
      </div>

      {/* Error */}
      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {/* Logs table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading logs…
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ScrollText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No logs yet</p>
          <p className="text-sm mt-1">Logs appear here after AI tools are invoked through MCP.</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tool</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Caller</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Duration</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.logId}
                    onClick={() => setSelected(log.logId)}
                    className={`border-b cursor-pointer transition-colors hover:bg-muted/40 ${i % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                  >
                    <td className="px-4 py-2.5"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-2.5">
                      <code className="bg-muted px-1 py-0.5 rounded">{log.tool}</code>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {log.projectName || <span className="italic opacity-50">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground truncate max-w-32">{log.callerEmail || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`flex items-center gap-1 ${log.durationMs > 3000 ? 'text-yellow-600' : 'text-foreground'}`}>
                        <Clock size={10} /> {log.durationMs}ms
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <Button
                variant="outline" size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}
              >
                <ChevronLeft size={14} /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {pagination.page} / {pagination.pages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPage(pagination.page + 1)}
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Detail drawer */}
      {selected && (
        <LogDetail logId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-destructive"><X size={9} /></button>
    </span>
  )
}
