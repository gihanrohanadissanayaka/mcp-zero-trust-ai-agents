import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, RefreshCw, Search, Pencil, Trash2, KeyRound,
  Copy, Check as CheckIcon, Eye, EyeOff, Zap, Bot,
  ChevronDown, X, ShieldCheck, AlertCircle,
} from 'lucide-react'
import { listAgents, registerAgent, deactivateAgent, listProjects, authenticateAgent } from '../lib/api'

const TOOLS = [
  'search_web', 'read_file', 'write_file', 'execute_code',
  'query_database', 'send_email', 'call_api', 'manage_files',
  'analyze_data', 'generate_report',
]

const AGENT_PRESETS = [
  { label: 'GPT-4o Agent',          value: 'gpt4o-agent',           org: 'OpenAI' },
  { label: 'GPT-4 Turbo Agent',     value: 'gpt4-turbo-agent',      org: 'OpenAI' },
  { label: 'o3 Reasoning Agent',    value: 'o3-reasoning-agent',    org: 'OpenAI' },
  { label: 'Claude 3.5 Sonnet',     value: 'claude-3-5-sonnet',     org: 'Anthropic' },
  { label: 'Claude 3 Opus',         value: 'claude-3-opus',         org: 'Anthropic' },
  { label: 'Gemini 2.0 Flash',      value: 'gemini-2-flash',        org: 'Google' },
  { label: 'Gemini Ultra Agent',    value: 'gemini-ultra-agent',    org: 'Google' },
  { label: 'Llama 3.3 70B',         value: 'llama-3-3-70b',         org: 'Meta' },
  { label: 'Llama 3.1 405B',        value: 'llama-3-1-405b',        org: 'Meta' },
  { label: 'Mistral Large',         value: 'mistral-large',         org: 'Mistral AI' },
  { label: 'Mixtral 8x22B',         value: 'mixtral-8x22b',         org: 'Mistral AI' },
  { label: 'DeepSeek-V3',           value: 'deepseek-v3',           org: 'DeepSeek' },
  { label: 'DeepSeek-R1',           value: 'deepseek-r1',           org: 'DeepSeek' },
  { label: 'Grok 3',                value: 'grok-3',                org: 'xAI' },
  { label: 'Grok 2',                value: 'grok-2',                org: 'xAI' },
  { label: 'Perplexity Sonar',      value: 'perplexity-sonar',      org: 'Perplexity' },
  { label: 'GitHub Copilot Agent',  value: 'github-copilot-agent',  org: 'Microsoft' },
  { label: 'Azure AI Agent',        value: 'azure-ai-agent',        org: 'Microsoft' },
  { label: 'Amazon Bedrock Agent',  value: 'bedrock-agent',         org: 'Amazon' },
  { label: 'Cohere Command R+',     value: 'cohere-command-r-plus', org: 'Cohere' },
  { label: 'AutoGPT',               value: 'autogpt',               org: 'Significant Gravitas' },
  { label: 'LangChain Agent',       value: 'langchain-agent',       org: 'LangChain' },
  { label: 'CrewAI Agent',          value: 'crewai-agent',          org: 'CrewAI' },
  { label: 'BabyAGI',               value: 'babyagi',               org: 'Community' },
  { label: 'AgentGPT',              value: 'agentgpt',              org: 'Reworkd' },
  { label: 'HuggingFace Agent',     value: 'huggingface-agent',     org: 'HuggingFace' },
  { label: 'Ollama Local Agent',    value: 'ollama-local',          org: 'Ollama' },
  { label: 'Qwen2.5 Max',           value: 'qwen2-5-max',           org: 'Alibaba' },
  { label: 'Yi Large',              value: 'yi-large',              org: '01.AI' },
  { label: 'Custom Agent',          value: '__custom__',            org: '' },
]

const ORG_COLORS = {
  'OpenAI':               'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Anthropic':            'bg-orange-50 text-orange-700 border-orange-200',
  'Google':               'bg-blue-50 text-blue-700 border-blue-200',
  'Meta':                 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Mistral AI':           'bg-violet-50 text-violet-700 border-violet-200',
  'DeepSeek':             'bg-cyan-50 text-cyan-700 border-cyan-200',
  'xAI':                  'bg-gray-100 text-gray-700 border-gray-300',
  'Perplexity':           'bg-teal-50 text-teal-700 border-teal-200',
  'Microsoft':            'bg-sky-50 text-sky-700 border-sky-200',
  'Amazon':               'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Cohere':               'bg-pink-50 text-pink-700 border-pink-200',
  'LangChain':            'bg-lime-50 text-lime-700 border-lime-200',
  'CrewAI':               'bg-rose-50 text-rose-700 border-rose-200',
  'HuggingFace':          'bg-amber-50 text-amber-700 border-amber-200',
  'Community':            'bg-slate-50 text-slate-600 border-slate-200',
  'Significant Gravitas': 'bg-purple-50 text-purple-700 border-purple-200',
  'Reworkd':              'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'Ollama':               'bg-stone-50 text-stone-700 border-stone-200',
  'Alibaba':              'bg-red-50 text-red-700 border-red-200',
  '01.AI':                'bg-zinc-50 text-zinc-700 border-zinc-200',
}

function initials(name) {
  if (!name) return '?'
  return name.split(/[\s-_]+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─────────────────────────────────────────────────────────────
// AgentNameDropdown
// ─────────────────────────────────────────────────────────────
function AgentNameDropdown({ value, onChange }) {
  const [open,       setOpen]       = useState(false)
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(null)
  const [customName, setCustomName] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = AGENT_PRESETS.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.org.toLowerCase().includes(search.toLowerCase())
  )

  function pick(preset) {
    setSelected(preset)
    setOpen(false)
    setSearch('')
    if (preset.value === '__custom__') {
      setCustomName('')
      onChange('')
    } else {
      onChange(preset.value)
    }
  }

  const isCustom = selected?.value === '__custom__'

  return (
    <div className="space-y-2" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors">
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? (isCustom ? (customName || 'Enter custom name…') : selected.label) : 'Select an agent…'}
        </span>
        <div className="flex items-center gap-2">
          {selected && !isCustom && selected.org && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${ORG_COLORS[selected.org] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
              {selected.org}
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
        </div>
      </button>

      {isCustom && (
        <input
          autoFocus
          placeholder="Enter custom agent name…"
          value={customName}
          onChange={e => { setCustomName(e.target.value); onChange(e.target.value) }}
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
        />
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input autoFocus
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 rounded-xl outline-none placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-colors"
                placeholder="Search agents or organisations…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">No results</li>
            )}
            {filtered.map(preset => (
              <li key={preset.value}>
                <button type="button" onClick={() => pick(preset)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-indigo-50 transition-colors text-left">
                  <span className={preset.value === '__custom__' ? 'italic text-gray-400' : 'text-gray-700'}>
                    {preset.label}
                  </span>
                  {preset.org && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ml-2 flex-shrink-0 ${ORG_COLORS[preset.org] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {preset.org}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TokenPanel — inline auth + copy
// ─────────────────────────────────────────────────────────────
function TokenPanel({ agentId, onClose }) {
  const [secret,    setSecret]    = useState('')
  const [showSec,   setShowSec]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [token,     setToken]     = useState('')
  const [expiresAt, setExpiresAt] = useState(null)
  const [error,     setError]     = useState('')
  const [copied,    setCopied]    = useState(false)

  async function handleAuth() {
    if (!secret.trim()) { setError('Agent secret is required'); return }
    setLoading(true); setError(''); setToken('')
    try {
      const { data } = await authenticateAgent({ agentId, agentSecret: secret.trim() })
      setToken(data.accessToken)
      setExpiresAt(data.expiresAt)
      setSecret('')
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = token
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3 mx-4 mb-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <KeyRound size={12} className="text-indigo-500"/> Get Access Token
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={13}/>
        </button>
      </div>

      {!token ? (
        <>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Agent Secret</label>
              <div className="relative">
                <input
                  type={showSec ? 'text' : 'password'}
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  placeholder="agtsec_…"
                  className="w-full pr-9 px-3 py-2 text-xs font-mono rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white transition-colors"
                />
                <button type="button" onClick={() => setShowSec(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showSec ? <EyeOff size={13}/> : <Eye size={13}/>}
                </button>
              </div>
            </div>
            <button onClick={handleAuth} disabled={loading}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors shrink-0">
              <Zap size={12}/>
              {loading ? 'Authenticating…' : 'Get Token'}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={11}/> {error}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
              <CheckIcon size={12} className="text-emerald-500"/> Token generated
              {expiresAt && (
                <span className="text-gray-400 font-normal">
                  · expires {new Date(expiresAt).toLocaleTimeString()}
                </span>
              )}
            </p>
            <button onClick={() => { setToken(''); setExpiresAt(null) }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Clear
            </button>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 font-mono text-[11px] break-all text-gray-600 select-all">
              {token}
            </div>
            <button onClick={handleCopy}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                copied ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300'
              }`}>
              {copied ? <><CheckIcon size={11}/> Copied</> : <><Copy size={11}/> Copy</>}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Paste in the sample-project client: <strong className="text-gray-600">Settings → Agent Token</strong>
          </p>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AgentCard
// ─────────────────────────────────────────────────────────────
function AgentCard({ agent, onDelete }) {
  const [showToken, setShowToken] = useState(false)
  const isActive = agent.active === true || agent.status === 'active'

  return (
    <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden">
      <div className="flex">
        {/* Status accent bar */}
        <div className={`w-1 flex-shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-gray-200'}`}/>

        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            {/* Avatar + info */}
            <Link to={`/agents/${agent.agentId}`} className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm shadow-sm">
                {initials(agent.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-gray-900 text-[15px] leading-tight">{agent.name}</h3>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                      : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}/>
                    {isActive ? 'active' : (agent.status || 'inactive')}
                  </span>
                </div>
                <p className="text-xs font-mono text-gray-400 truncate">{agent.agentId}</p>
                {agent.description && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{agent.description}</p>
                )}
              </div>
            </Link>

            {/* Actions — hover reveal */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setShowToken(v => !v)}
                title={showToken ? 'Hide token panel' : 'Get access token'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  showToken
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                }`}>
                <KeyRound size={12}/>
                {showToken ? 'Hide' : 'Get Token'}
              </button>
              <Link to={`/agents/${agent.agentId}`}
                className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Edit">
                <Pencil size={14}/>
              </Link>
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete agent "${agent.name}"?`)) return
                  try {
                    await deactivateAgent(agent.agentId)
                    onDelete()
                  } catch (err) {
                    alert('Error: ' + (err.response?.data?.error || err.message))
                  }
                }}
                className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                <Trash2 size={14}/>
              </button>
            </div>
          </div>

          {/* Tools chips */}
          {(agent.allowedTools || agent.policy?.allowedTools || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-50">
              {(agent.allowedTools || agent.policy?.allowedTools).map(t => (
                <span key={t} className="px-2 py-0.5 rounded-lg bg-gray-50 border border-gray-100 text-gray-500 text-[11px] font-medium">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {showToken && <TokenPanel agentId={agent.agentId} onClose={() => setShowToken(false)}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AgentsPage
// ─────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents,     setAgents]     = useState([])
  const [projects,   setProjects]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [form,       setForm]       = useState({ name: '', description: '', allowedTools: [], allowedProjects: [] })
  const [regResult,  setRegResult]  = useState(null)
  const [regError,   setRegError]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      listAgents().then(({ data }) => data.data?.agents || data.agents || data || []),
      listProjects().then(({ data }) => data.data?.projects || data.projects || []).catch(() => [])
    ])
      .then(([agentsData, projectsData]) => { setAgents(agentsData); setProjects(projectsData) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  function toggleTool(tool) {
    setForm(f => ({
      ...f,
      allowedTools: f.allowedTools.includes(tool)
        ? f.allowedTools.filter(t => t !== tool)
        : [...f.allowedTools, tool],
    }))
  }

  async function handleRegister(e) {
    e.preventDefault()
    setRegError('')
    setSubmitting(true)
    try {
      const { data } = await registerAgent({
        name:            form.name,
        description:     form.description,
        allowedTools:    form.allowedTools,
        allowedProjects: form.allowedProjects,
      })
      setRegResult(data)
      load()
    } catch (err) {
      setRegError(err.response?.data?.error || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() { setShowForm(false); setRegResult(null); setRegError('') }

  function agentIsActive(a) { return a.active === true || a.status === 'active' }

  const counts = {
    all:      agents.length,
    active:   agents.filter(agentIsActive).length,
    inactive: agents.filter(a => !agentIsActive(a)).length,
  }

  const TABS = [
    { key: 'all',      label: 'All',      activeCls: 'bg-gray-900 text-white' },
    { key: 'active',   label: 'Active',   activeCls: 'bg-emerald-500 text-white' },
    { key: 'inactive', label: 'Inactive', activeCls: 'bg-gray-400 text-white' },
  ]

  const displayed = filterStatus === 'all' ? agents : agents.filter(a =>
    filterStatus === 'active' ? agentIsActive(a) : !agentIsActive(a)
  )

  const envColors = {
    development: 'border-sky-300 bg-sky-50 text-sky-700',
    staging:     'border-yellow-300 bg-yellow-50 text-yellow-700',
    production:  'border-green-300 bg-green-50 text-green-700',
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero gradient header ── */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-10 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot size={18} className="text-indigo-300"/>
                <span className="text-indigo-300 text-sm font-medium">MCP Hub</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Agents</h1>
              <p className="text-indigo-300 text-sm mt-1">Manage and authenticate registered MCP agents</p>
            </div>
            <button onClick={() => { setShowForm(true); setRegResult(null) }}
              className="flex items-center gap-2 bg-white text-indigo-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg shadow-indigo-900/20 flex-shrink-0">
              <Plus size={15}/> Register Agent
            </button>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{counts.all}</p>
              <p className="text-xs text-indigo-200 mt-0.5">Total</p>
            </div>
            <div className="bg-emerald-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-emerald-400/30">
              <p className="text-2xl font-bold text-emerald-200 tabular-nums">{counts.active}</p>
              <p className="text-xs text-emerald-300 mt-0.5">Active</p>
            </div>
            <div className="bg-gray-500/20 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-gray-400/30">
              <p className="text-2xl font-bold text-gray-300 tabular-nums">{counts.inactive}</p>
              <p className="text-xs text-gray-400 mt-0.5">Inactive</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content card ── */}
      <div className="max-w-5xl mx-auto px-6 -mt-6">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-1">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setFilterStatus(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterStatus === t.key ? t.activeCls : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}>
                  {t.label}
                  <span className={`tabular-nums ${filterStatus === t.key ? 'opacity-70' : 'opacity-50'}`}>
                    {counts[t.key]}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={load} title="Refresh"
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
            </button>
          </div>

          {/* Agent list */}
          <div className="p-5">
            {loading ? (
              <div className="text-center py-20 text-gray-400">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-indigo-300"/>
                <p className="text-sm">Loading agents…</p>
              </div>
            ) : displayed.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <Bot size={28} className="text-gray-300"/>
                </div>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  {filterStatus === 'all' ? 'No agents registered yet' : `No ${filterStatus} agents`}
                </p>
                <p className="text-xs text-gray-400">
                  {filterStatus === 'all' ? 'Register your first agent to get started.' : 'Switch to "All" to see every agent.'}
                </p>
                {filterStatus === 'all' && (
                  <button onClick={() => setShowForm(true)}
                    className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
                    <Plus size={14}/> Register Agent
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {displayed.map(agent => (
                  <AgentCard key={agent.agentId} agent={agent} onDelete={load}/>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 py-6">
          {agents.length} agent{agents.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {/* ── Register modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-12">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal}/>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-gray-100 z-10 my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <Bot size={16} className="text-white"/>
                <h2 className="text-white font-semibold">Register New Agent</h2>
              </div>
              <button onClick={closeModal} className="text-white/60 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="p-6">
              {regResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                    <CheckIcon size={16} className="text-emerald-500"/> Agent registered successfully!
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-sm space-y-1">
                    <p><span className="text-gray-400 font-sans text-xs font-semibold">Agent ID:</span><br/>
                    <span className="text-gray-800 break-all">{regResult.agentId}</span></p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                      <ShieldCheck size={12}/> Agent Secret — copy now, shown once!
                    </p>
                    <code className="text-sm font-mono break-all select-all bg-amber-100 block rounded-lg px-3 py-2 text-amber-900">
                      {regResult.agentSecret}
                    </code>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => { closeModal(); setForm({ name: '', description: '', allowedTools: [], allowedProjects: [] }) }}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors">
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="space-y-1.5 relative sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Agent Name</label>
                      <AgentNameDropdown value={form.name} onChange={val => setForm(f => ({ ...f, name: val }))}/>
                    </div>
                    {/* Description */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</label>
                      <input placeholder="What does this agent do?"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"/>
                    </div>
                  </div>

                  {/* Tools */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Allowed Tools</label>
                    <div className="flex flex-wrap gap-2">
                      {TOOLS.map(tool => (
                        <button key={tool} type="button" onClick={() => toggleTool(tool)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            form.allowedTools.includes(tool)
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
                          const checked = form.allowedProjects.includes(p.projectId)
                          return (
                            <button key={p.projectId} type="button"
                              onClick={() => setForm(f => ({
                                ...f,
                                allowedProjects: checked
                                  ? f.allowedProjects.filter(id => id !== p.projectId)
                                  : [...f.allowedProjects, p.projectId]
                              }))}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                                checked ? 'border-indigo-500 bg-indigo-600 text-white' : (envColors[p.environment] || 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300')
                              }`}>
                              {checked && <CheckIcon size={10}/>}
                              {p.name}
                              <span className="opacity-60 text-[10px]">{p.environment}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {regError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <AlertCircle size={12}/> {regError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button type="button" onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting || !form.name}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors shadow-sm shadow-indigo-200">
                      {submitting ? <RefreshCw size={14} className="animate-spin"/> : <Plus size={14}/>}
                      {submitting ? 'Registering…' : 'Register Agent'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
