import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, ChevronRight, ChevronDown, Search, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { listAgents, registerAgent, deactivateAgent, listProjects } from '../lib/api'

const TOOLS = [
  'search_web', 'read_file', 'write_file', 'execute_code',
  'query_database', 'send_email', 'call_api', 'manage_files',
  'analyze_data', 'generate_report',
]

// Real-world AI agents currently in use globally
const AGENT_PRESETS = [
  { label: 'GPT-4o Agent',          value: 'gpt4o-agent',          org: 'OpenAI' },
  { label: 'GPT-4 Turbo Agent',     value: 'gpt4-turbo-agent',     org: 'OpenAI' },
  { label: 'o3 Reasoning Agent',    value: 'o3-reasoning-agent',   org: 'OpenAI' },
  { label: 'Claude 3.5 Sonnet',     value: 'claude-3-5-sonnet',    org: 'Anthropic' },
  { label: 'Claude 3 Opus',         value: 'claude-3-opus',        org: 'Anthropic' },
  { label: 'Gemini 2.0 Flash',      value: 'gemini-2-flash',       org: 'Google' },
  { label: 'Gemini Ultra Agent',    value: 'gemini-ultra-agent',   org: 'Google' },
  { label: 'Llama 3.3 70B',         value: 'llama-3-3-70b',        org: 'Meta' },
  { label: 'Llama 3.1 405B',        value: 'llama-3-1-405b',       org: 'Meta' },
  { label: 'Mistral Large',         value: 'mistral-large',        org: 'Mistral AI' },
  { label: 'Mixtral 8x22B',         value: 'mixtral-8x22b',        org: 'Mistral AI' },
  { label: 'DeepSeek-V3',           value: 'deepseek-v3',          org: 'DeepSeek' },
  { label: 'DeepSeek-R1',           value: 'deepseek-r1',          org: 'DeepSeek' },
  { label: 'Grok 3',                value: 'grok-3',               org: 'xAI' },
  { label: 'Grok 2',                value: 'grok-2',               org: 'xAI' },
  { label: 'Perplexity Sonar',      value: 'perplexity-sonar',     org: 'Perplexity' },
  { label: 'GitHub Copilot Agent',  value: 'github-copilot-agent', org: 'Microsoft' },
  { label: 'Azure AI Agent',        value: 'azure-ai-agent',       org: 'Microsoft' },
  { label: 'Amazon Bedrock Agent',  value: 'bedrock-agent',        org: 'Amazon' },
  { label: 'Cohere Command R+',     value: 'cohere-command-r-plus', org: 'Cohere' },
  { label: 'AutoGPT',               value: 'autogpt',              org: 'Significant Gravitas' },
  { label: 'LangChain Agent',       value: 'langchain-agent',      org: 'LangChain' },
  { label: 'CrewAI Agent',          value: 'crewai-agent',         org: 'CrewAI' },
  { label: 'BabyAGI',               value: 'babyagi',              org: 'Community' },
  { label: 'AgentGPT',              value: 'agentgpt',             org: 'Reworkd' },
  { label: 'HuggingFace Agent',     value: 'huggingface-agent',    org: 'HuggingFace' },
  { label: 'Ollama Local Agent',    value: 'ollama-local',         org: 'Ollama' },
  { label: 'Qwen2.5 Max',          value: 'qwen2-5-max',          org: 'Alibaba' },
  { label: 'Yi Large',              value: 'yi-large',             org: '01.AI' },
  { label: 'Custom Agent',          value: '__custom__',           org: '' },
]

const ORG_COLORS = {
  'OpenAI':               'bg-emerald-50 text-emerald-700',
  'Anthropic':            'bg-orange-50 text-orange-700',
  'Google':               'bg-blue-50 text-blue-700',
  'Meta':                 'bg-indigo-50 text-indigo-700',
  'Mistral AI':           'bg-violet-50 text-violet-700',
  'DeepSeek':             'bg-cyan-50 text-cyan-700',
  'xAI':                  'bg-gray-100 text-gray-700',
  'Perplexity':           'bg-teal-50 text-teal-700',
  'Microsoft':            'bg-sky-50 text-sky-700',
  'Amazon':               'bg-yellow-50 text-yellow-700',
  'Cohere':               'bg-pink-50 text-pink-700',
  'LangChain':            'bg-lime-50 text-lime-700',
  'CrewAI':               'bg-rose-50 text-rose-700',
  'HuggingFace':          'bg-amber-50 text-amber-700',
  'Community':            'bg-slate-50 text-slate-600',
  'Significant Gravitas': 'bg-purple-50 text-purple-700',
  'Reworkd':              'bg-fuchsia-50 text-fuchsia-700',
  'Ollama':               'bg-stone-50 text-stone-700',
  'Alibaba':              'bg-red-50 text-red-700',
  '01.AI':                'bg-zinc-50 text-zinc-700',
}

function AgentNameDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-input bg-background text-sm hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected
            ? isCustom ? (customName || 'Enter custom name…') : selected.label
            : 'Select an agent…'}
        </span>
        <div className="flex items-center gap-2">
          {selected && !isCustom && selected.org && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ORG_COLORS[selected.org] || 'bg-muted text-muted-foreground'}`}>
              {selected.org}
            </span>
          )}
          <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Custom name input */}
      {isCustom && (
        <Input
          placeholder="Enter custom agent name…"
          value={customName}
          onChange={(e) => { setCustomName(e.target.value); onChange(e.target.value) }}
          autoFocus
        />
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-sm bg-background border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                className="w-full pl-7 pr-3 py-1.5 text-sm bg-muted rounded-md outline-none placeholder:text-muted-foreground"
                placeholder="Search agents or organisations…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
            )}
            {filtered.map(preset => (
              <li key={preset.value}>
                <button
                  type="button"
                  onClick={() => pick(preset)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                >
                  <span className={preset.value === '__custom__' ? 'italic text-muted-foreground' : ''}>
                    {preset.label}
                  </span>
                  {preset.org && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${ORG_COLORS[preset.org] || 'bg-muted text-muted-foreground'}`}>
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

export default function AgentsPage() {
  const [agents,   setAgents]   = useState([])
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', allowedTools: [], allowedProjects: [] })
  const [regResult, setRegResult] = useState(null)
  const [regError,  setRegError]  = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      listAgents().then(({ data }) => data.data?.agents || data.agents || data || []),
      listProjects().then(({ data }) => data.data?.projects || data.projects || []).catch(() => [])
    ])
      .then(([agentsData, projectsData]) => {
        setAgents(agentsData)
        setProjects(projectsData)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  function toggleTool(tool) {
    setForm((f) => ({
      ...f,
      allowedTools: f.allowedTools.includes(tool)
        ? f.allowedTools.filter((t) => t !== tool)
        : [...f.allowedTools, tool],
    }))
  }

  async function handleRegister(e) {
    e.preventDefault()
    setRegError('')
    setSubmitting(true)
    try {
      const { data } = await registerAgent({
        name: form.name,
        description: form.description,
        allowedTools: form.allowedTools,
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

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">Manage registered MCP agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setShowForm(!showForm); setRegResult(null) }}>
            <Plus size={14} /> Register Agent
          </Button>
        </div>
      </div>

      {/* Register form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Register New Agent</CardTitle>
          </CardHeader>
          <CardContent>
            {regResult ? (
              <div className="space-y-3">
                <p className="text-green-700 font-medium">Agent registered!</p>
                <div className="rounded-md bg-muted p-3 text-sm font-mono space-y-1">
                  <p><span className="text-muted-foreground">Agent ID:</span> {regResult.agentId}</p>
                </div>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-700 font-medium mb-1">Agent Secret (copy now — shown once!)</p>
                  <code className="text-sm font-mono break-all select-all">{regResult.agentSecret}</code>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setRegResult(null); setForm({ name: '', description: '', allowedTools: [], allowedProjects: [] }) }}>Done</Button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 relative">
                    <Label>Agent Name</Label>
                    <AgentNameDropdown
                      value={form.name}
                      onChange={(val) => setForm({ ...form, name: val })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Allowed Projects</Label>
                    {projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">
                        No projects yet.{' '}
                        <a href="/projects" className="text-primary underline">Create one first.</a>
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2 rounded-md border border-input bg-background p-2 min-h-[38px]">
                        {projects.map(p => {
                          const checked = form.allowedProjects.includes(p.projectId)
                          const envColors = { development: 'border-sky-300 bg-sky-50 text-sky-700', staging: 'border-yellow-300 bg-yellow-50 text-yellow-700', production: 'border-green-300 bg-green-50 text-green-700' }
                          return (
                            <button
                              key={p.projectId}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, allowedProjects: checked ? f.allowedProjects.filter(id => id !== p.projectId) : [...f.allowedProjects, p.projectId] }))}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium transition-colors ${ checked ? 'border-primary bg-primary text-primary-foreground' : (envColors[p.environment] || 'border-border bg-background text-muted-foreground') }`}
                            >
                              {checked && <span className="text-[10px]">✓</span>}
                              {p.name}
                              <span className={`text-[9px] opacity-70`}>{p.environment}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input placeholder="What does this agent do?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Allowed Tools</Label>
                  <div className="flex flex-wrap gap-2">
                    {TOOLS.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => toggleTool(tool)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${form.allowedTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary'}`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
                {regError && <p className="text-sm text-destructive">{regError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? 'Registering…' : 'Register'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Agents list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Agents ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground text-sm p-6">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6">No agents found. Register one above.</p>
          ) : (
            <div className="divide-y">
              {agents.map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between px-6 py-4 hover:bg-muted/40 transition-colors">
                  <Link to={`/agents/${agent.agentId}`} className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{agent.agentId}</p>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{agent.description}</p>
                    )}
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>
                      {agent.status}
                    </Badge>
                    <Link to={`/agents/${agent.agentId}`}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Edit agent">
                      <Pencil size={14} />
                    </Link>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        if (!window.confirm(`Delete agent "${agent.name}"?`)) return
                        try {
                          await deactivateAgent(agent.agentId)
                          load()
                        } catch (err) {
                          alert('Error: ' + (err.response?.data?.error || err.message))
                        }
                      }}
                      className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      title="Delete agent"
                    >
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
