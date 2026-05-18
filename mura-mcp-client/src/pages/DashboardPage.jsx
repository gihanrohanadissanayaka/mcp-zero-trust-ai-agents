import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot, ShieldCheck, FolderOpen, ShieldOff, ArrowRight,
  RefreshCw, Clock, AlertTriangle, CheckCircle2, Zap,
  Activity, Globe, XCircle, BarChart2,
} from 'lucide-react'
import { listAgents, listProjects, listLogs, getLogStats, getSessionsSummary } from '../lib/api'

// ─── Helpers ──────────────────────────────────────────────────
function agentIsActive(a) {
  return a.active === true || a.status === 'active'
}

const ENV_COLORS = {
  production:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  staging:     'bg-amber-50 text-amber-700 border-amber-200',
  development: 'bg-sky-50 text-sky-700 border-sky-200',
}

const METHOD_COLORS = {
  GET:    'bg-sky-50 text-sky-700',
  POST:   'bg-emerald-50 text-emerald-700',
  PUT:    'bg-amber-50 text-amber-700',
  PATCH:  'bg-orange-50 text-orange-700',
  DELETE: 'bg-red-50 text-red-700',
}

// ─── Sub-components ───────────────────────────────────────────
function PanelHeader({ icon: Icon, iconBg, iconColor, title, subtitle, linkTo, linkLabel, linkColor = 'text-indigo-600 hover:text-indigo-800' }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={15} className={iconColor}/>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-[10px] text-gray-400">{subtitle}</p>
        </div>
      </div>
      {linkTo && (
        <Link to={linkTo} className={`flex items-center gap-1 text-xs font-medium transition-colors ${linkColor}`}>
          {linkLabel} <ArrowRight size={11}/>
        </Link>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, message, iconClass = 'text-gray-200' }) {
  return (
    <div className="text-center py-10">
      <Icon size={26} className={`mx-auto mb-2 ${iconClass}`}/>
      <p className="text-xs text-gray-400">{message}</p>
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
      <RefreshCw size={14} className="animate-spin"/> Loading…
    </div>
  )
}

// ─── Active Agents Panel ──────────────────────────────────────
function AgentsPanel({ agents, sessions, loading }) {
  const active = agents.filter(agentIsActive)

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col">
      <PanelHeader
        icon={Bot}
        iconBg="bg-indigo-100"
        iconColor="text-indigo-600"
        title="Active Agents"
        subtitle={`${active.length} of ${agents.length} active`}
        linkTo="/agents"
        linkLabel="All agents"
        linkColor="text-indigo-600 hover:text-indigo-800"
      />

      <div className="divide-y divide-gray-50 overflow-y-auto" style={{ maxHeight: 420 }}>
        {loading ? <LoadingRow/> : active.length === 0
          ? <EmptyState icon={Bot} message="No active agents"/>
          : active.slice(0, 10).map(agent => {
              const sessionCount = sessions[agent.agentId] ?? 0
              return (
                <div key={agent.agentId}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-indigo-50/40 transition-colors group">
                  {/* Avatar + online dot */}
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-xs">
                      {agent.name?.slice(0,2).toUpperCase() || 'AG'}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"/>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 truncate">{agent.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate">{agent.agentId}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {/* Active sessions badge */}
                      <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold border ${sessionCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        <Activity size={8}/> {sessionCount} session{sessionCount !== 1 ? 's' : ''}
                      </span>
                      {/* Allowed projects */}
                      {agent.policy?.allowedProjects?.slice(0,2).map(p => (
                        <span key={p} className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded-full truncate max-w-[90px]">{p}</span>
                      ))}
                      {(agent.policy?.allowedProjects?.length ?? 0) > 2 && (
                        <span className="text-[9px] text-gray-400">+{agent.policy.allowedProjects.length - 2}</span>
                      )}
                    </div>
                  </div>

                  {/* Hover link */}
                  <Link to={`/agents/${agent.agentId}`}
                    className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium transition-opacity flex-shrink-0">
                    View →
                  </Link>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Projects Panel ───────────────────────────────────────────
function ProjectsPanel({ projects, loading }) {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
      <PanelHeader
        icon={FolderOpen}
        iconBg="bg-violet-100"
        iconColor="text-violet-600"
        title="Projects"
        subtitle={`${projects.length} registered`}
        linkTo="/projects"
        linkLabel="All projects"
        linkColor="text-violet-600 hover:text-violet-800"
      />
      <div className="divide-y divide-gray-50">
        {loading ? <LoadingRow/> : projects.length === 0
          ? <EmptyState icon={FolderOpen} message="No projects yet"/>
          : projects.slice(0, 5).map(proj => (
              <div key={proj.projectId} className="flex items-center gap-3 px-5 py-3 hover:bg-violet-50/30 transition-colors group">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0">
                  {proj.name?.slice(0,2).toUpperCase() || 'PR'}
                </div>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-900 truncate">{proj.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{proj.description || 'No description'}</p>
                </div>
                {/* Env badge */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${ENV_COLORS[proj.environment] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {proj.environment || 'dev'}
                </span>
              </div>
            ))
        }
      </div>
    </div>
  )
}

// ─── Blocked Logs Panel ───────────────────────────────────────
function BlockedPanel({ logs, loading }) {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col">
      <PanelHeader
        icon={ShieldOff}
        iconBg="bg-red-100"
        iconColor="text-red-500"
        title="Blocked Access"
        subtitle="Recent denied requests"
        linkTo="/logs"
        linkLabel="View all logs"
        linkColor="text-red-500 hover:text-red-700"
      />
      <div className="divide-y divide-gray-50">
        {loading ? <LoadingRow/> : logs.length === 0
          ? (
            <div className="text-center py-10">
              <CheckCircle2 size={26} className="mx-auto mb-2 text-emerald-300"/>
              <p className="text-xs text-gray-400">No blocked requests — all clear</p>
            </div>
          )
          : logs.slice(0, 8).map(log => {
              const isTool = log.source === 'tool_invoke'
              return (
                <div key={log.logId} className="flex items-start gap-3 px-5 py-3 hover:bg-red-50/30 transition-colors">
                  {/* Icon */}
                  <ShieldOff size={13} className="text-red-400 flex-shrink-0 mt-0.5"/>

                  {/* Content */}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isTool ? (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md font-mono font-semibold">
                          {log.tool || 'tool'}
                        </span>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-semibold ${METHOD_COLORS[log.method?.toUpperCase()] || 'bg-gray-100 text-gray-600'}`}>
                          {log.method || '—'}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-600 font-mono truncate max-w-[150px]">
                        {isTool ? (log.callerEmail || log.callerName || '—') : (log.path || '—')}
                      </span>
                    </div>
                    {/* Deny reason / project */}
                    {log.denyReason
                      ? <p className="text-[10px] text-red-500 font-mono">{log.denyReason}</p>
                      : <p className="text-[10px] text-gray-400">{log.projectName || log.projectId || 'unknown project'}</p>
                    }
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ─── Stats row ────────────────────────────────────────────────
function StatChip({ value, label, color = 'text-white', loading }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{loading ? '…' : value}</p>
      <p className="text-xs text-indigo-300 mt-0.5">{label}</p>
    </div>
  )
}

// ─── DashboardPage ────────────────────────────────────────────
export default function DashboardPage() {
  const [agents,   setAgents]   = useState([])
  const [projects, setProjects] = useState([])
  const [blocked,  setBlocked]  = useState([])
  const [sessions, setSessions] = useState({})   // { agentId: activeCount }
  const [logStats, setLogStats] = useState(null)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      listAgents().then(r => r.data?.data?.agents || r.data?.agents || []).catch(() => []),
      listProjects().then(r => r.data?.data?.projects || r.data?.projects || []).catch(() => []),
      listLogs({ allowed: 'false', limit: 20 }).then(r => r.data?.data?.logs || []).catch(() => []),
      getSessionsSummary().then(r => r.data?.data?.summary || {}).catch(() => ({})),
      getLogStats().then(r => r.data?.data || null).catch(() => null),
    ]).then(([a, p, b, s, stats]) => {
      setAgents(a)
      setProjects(p)
      setBlocked(b)
      setSessions(s)
      setLogStats(stats)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const activeAgents = agents.filter(agentIsActive)
  const totalSessions = Object.values(sessions).reduce((s, n) => s + n, 0)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-700 to-purple-800 px-6 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={18} className="text-indigo-300"/>
                <span className="text-indigo-300 text-sm font-medium">MCP Hub</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
              <p className="text-indigo-200 text-sm mt-1">Zero Trust Control Center — live overview of your agents and access</p>
            </div>
            <button onClick={load}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors border border-white/20 flex-shrink-0">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatChip value={agents.length}       label="Total Agents"    loading={loading}/>
            <StatChip value={activeAgents.length} label="Active Agents"   color="text-emerald-300" loading={loading}/>
            <StatChip value={totalSessions}       label="Live Sessions"   color="text-violet-200"  loading={loading}/>
            <StatChip value={projects.length}     label="Projects"        loading={loading}/>
            <StatChip value={blocked.length}      label="Blocked (recent)" color={blocked.length > 0 ? 'text-red-300' : 'text-white'} loading={loading}/>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-6 -mt-8 pb-12">

        {/* Tool activity bar — from log stats */}
        {logStats && logStats.byTool?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 px-5 py-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={14} className="text-indigo-500"/>
              <p className="text-xs font-semibold text-gray-700">Tool Invocations</p>
              <span className="text-[10px] text-gray-400">— {logStats.total} total logs</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {logStats.byTool
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
                .map(t => (
                  <div key={t.tool} className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5">
                    <Zap size={10} className="text-indigo-400"/>
                    <span className="text-[11px] font-mono font-semibold text-indigo-700">{t.tool || 'unknown'}</span>
                    <span className="text-[10px] text-indigo-400">{t.count}×</span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Clock size={8}/>{t.avgDurationMs}ms</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Three panel grid */}
        <div className="grid grid-cols-12 gap-4">

          {/* Active Agents — spans 5 cols */}
          <div className="col-span-12 lg:col-span-5">
            <AgentsPanel agents={agents} sessions={sessions} loading={loading}/>
          </div>

          {/* Right column — Projects + Blocked stacked */}
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            <ProjectsPanel projects={projects} loading={loading}/>
            <BlockedPanel  logs={blocked}      loading={loading}/>
          </div>

        </div>
      </div>
    </div>
  )
}
