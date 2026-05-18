import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Play, RefreshCw, ShieldCheck,
  ShieldX, ChevronDown, ChevronUp, Clock, Layers, X, Check,
  AlertCircle, Zap,
} from 'lucide-react'
import { getAgentPolicy, addPolicyRule, removePolicyRule, simulatePolicy } from '../lib/api'

// ── Constants ─────────────────────────────────────────────────
const TOOLS = [
  'search_web', 'read_file', 'write_file', 'execute_code',
  'query_database', 'send_email', 'call_api', 'manage_files',
  'analyze_data', 'generate_report',
]

const OPS  = ['read', 'write', 'admin']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const BLANK_RULE = {
  toolMode:      'wildcard',
  tool:          '',
  effect:        'allow',
  description:   '',
  projectIds:    '',
  operations:    [],
  useTimeWindow: false,
  startHour:     9,
  endHour:       18,
  daysOfWeek:    [1, 2, 3, 4, 5],
}

function buildResource(rule) {
  if (rule.toolMode === 'wildcard') return 'tool:*'
  if (rule.toolMode === 'prefix')   return `tool:${rule.tool}_*`
  return `tool:${rule.tool}`
}

function buildConditions(rule) {
  const cond = {}
  const ids = rule.projectIds.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length)           cond.projectIds = ids
  if (rule.operations.length) cond.operations = rule.operations
  if (rule.useTimeWindow) {
    cond.timeWindow = {
      startHour:  Number(rule.startHour),
      endHour:    Number(rule.endHour),
      daysOfWeek: rule.daysOfWeek,
    }
  }
  return cond
}

// ── Helpers ───────────────────────────────────────────────────
function EffectBadge({ effect }) {
  return effect === 'allow'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-300 bg-emerald-50 text-emerald-700"><ShieldCheck size={9}/>allow</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-red-300 bg-red-50 text-red-700"><ShieldX size={9}/>deny</span>
}

const inputCls  = 'w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors'
const labelCls  = 'text-[10px] text-gray-500 uppercase tracking-wide font-semibold block mb-1'
const selectCls = 'w-full px-3 py-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors'

// ── RuleCard ──────────────────────────────────────────────────
function RuleCard({ rule, onDelete, index, isCatchAll }) {
  const [open, setOpen] = useState(false)
  const hasConditions = (
    rule.conditions?.projectIds?.length > 0 ||
    rule.conditions?.operations?.length > 0 ||
    rule.conditions?.timeWindow
  )
  const isAllow = rule.effect === 'allow'

  return (
    <div className={`rounded-2xl border text-xs transition-colors ${
      isCatchAll
        ? 'border-dashed border-gray-300 bg-gray-50'
        : isAllow
          ? 'border-emerald-100 bg-white hover:border-emerald-200'
          : 'border-red-100 bg-white hover:border-red-200'
    }`}>
      <div className="flex items-center gap-2.5 px-4 py-3">
        {/* Index bubble */}
        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex-shrink-0">
          {index + 1}
        </span>

        <EffectBadge effect={rule.effect}/>

        <span className={`font-mono text-[11px] px-2 py-0.5 rounded-lg ${isAllow ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {rule.resource}
        </span>

        {rule.description && (
          <span className="text-gray-400 truncate flex-1 text-[11px]">{rule.description}</span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {hasConditions && (
            <button onClick={() => setOpen(o => !o)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5">
              {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
          )}
          {!isCatchAll ? (
            <button onClick={() => onDelete(rule.id)}
              className="text-gray-300 hover:text-red-500 transition-colors p-0.5">
              <Trash2 size={13}/>
            </button>
          ) : (
            <span className="text-[10px] text-gray-400 italic">catch-all · locked</span>
          )}
        </div>
      </div>

      {open && hasConditions && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {rule.conditions?.projectIds?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Projects</p>
              <div className="flex flex-wrap gap-1">
                {rule.conditions.projectIds.map(p => (
                  <span key={p} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg font-mono text-[10px]">{p}</span>
                ))}
              </div>
            </div>
          )}
          {rule.conditions?.operations?.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Operations</p>
              <div className="flex gap-1">
                {rule.conditions.operations.map(op => (
                  <span key={op} className="px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded-lg text-[10px]">{op}</span>
                ))}
              </div>
            </div>
          )}
          {rule.conditions?.timeWindow && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1 flex items-center gap-1"><Clock size={9}/> Time Window (UTC)</p>
              <p className="text-[11px] text-gray-600">{rule.conditions.timeWindow.startHour}:00 – {rule.conditions.timeWindow.endHour}:00</p>
              <p className="text-[11px] text-gray-400">{rule.conditions.timeWindow.daysOfWeek?.map(d => DAYS[d]).join(', ')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Rule Modal ────────────────────────────────────────────
function AddRuleModal({ agentId, onClose, onAdded }) {
  const [form,     setForm]    = useState(BLANK_RULE)
  const [error,    setError]   = useState('')
  const [loading,  setLoading] = useState(false)

  function toggleOp(op) {
    setForm(f => ({
      ...f, operations: f.operations.includes(op)
        ? f.operations.filter(o => o !== op)
        : [...f.operations, op]
    }))
  }
  function toggleDay(d) {
    setForm(f => ({
      ...f, daysOfWeek: f.daysOfWeek.includes(d)
        ? f.daysOfWeek.filter(x => x !== d)
        : [...f.daysOfWeek, d].sort((a, b) => a - b)
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.toolMode !== 'wildcard' && !form.tool.trim()) {
      setError('Tool name is required for specific / prefix mode.')
      return
    }
    setLoading(true)
    try {
      await addPolicyRule(agentId, {
        resource:    buildResource(form),
        effect:      form.effect,
        description: form.description.trim(),
        conditions:  buildConditions(form),
      })
      onAdded()
    } catch (err) {
      setError(err.response?.data?.error || err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] mx-4">

        {/* Modal header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-t-2xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-white"/>
            <h3 className="font-semibold text-white text-sm">Add Policy Rule</h3>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1"><X size={15}/></button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto p-5">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Effect */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Effect</label>
                <div className="flex gap-2">
                  {['allow', 'deny'].map(ef => (
                    <button key={ef} type="button"
                      onClick={() => setForm(f => ({ ...f, effect: ef }))}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${
                        form.effect === ef
                          ? ef === 'allow'
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                            : 'border-red-400 bg-red-50 text-red-700'
                          : 'border-gray-200 bg-white text-gray-400'
                      }`}>
                      {ef === 'allow' ? '✅ allow' : '🚫 deny'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Resource (tool scope)</label>
                <select className={selectCls} value={form.toolMode}
                  onChange={e => setForm(f => ({ ...f, toolMode: e.target.value, tool: '' }))}>
                  <option value="wildcard">tool:* — all tools</option>
                  <option value="specific">tool:name — specific</option>
                  <option value="prefix">tool:name_* — prefix</option>
                </select>
              </div>
            </div>

            {form.toolMode !== 'wildcard' && (
              <div>
                <label className={labelCls}>Tool name</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {TOOLS.map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tool: t }))}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        form.tool === t
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input className={inputCls} placeholder="or type custom tool name…"
                  value={TOOLS.includes(form.tool) ? '' : form.tool}
                  onChange={e => setForm(f => ({ ...f, tool: e.target.value }))}/>
                {form.tool && (
                  <p className="text-[10px] text-indigo-500 font-mono mt-1">resource → {buildResource(form)}</p>
                )}
              </div>
            )}

            <div>
              <label className={labelCls}>Description <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
              <input className={inputCls} placeholder="e.g. Block code execution for this agent"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}/>
            </div>

            {/* Conditions box */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                Conditions <span className="font-normal normal-case text-gray-400">— leave empty to match everything</span>
              </p>

              <div>
                <label className={labelCls}>Project IDs <span className="text-gray-400 font-normal normal-case">(comma-separated)</span></label>
                <input className={inputCls} placeholder="proj_abc123, proj_xyz456"
                  value={form.projectIds} onChange={e => setForm(f => ({ ...f, projectIds: e.target.value }))}/>
              </div>

              <div>
                <label className={labelCls}>Operations <span className="text-gray-400 font-normal normal-case">(empty = any)</span></label>
                <div className="flex gap-2">
                  {OPS.map(op => (
                    <button key={op} type="button" onClick={() => toggleOp(op)}
                      className={`flex-1 py-1.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        form.operations.includes(op)
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-gray-200 bg-white text-gray-400'
                      }`}>
                      {form.operations.includes(op) && <Check size={9} className="inline mr-1"/>}{op}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time window */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="rounded accent-indigo-600"
                    checked={form.useTimeWindow}
                    onChange={e => setForm(f => ({ ...f, useTimeWindow: e.target.checked }))}/>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
                    <Clock size={9}/> Time Window (UTC)
                  </span>
                </label>
                {form.useTimeWindow && (
                  <div className="mt-2 pl-5 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <input type="number" min="0" max="23"
                        className="w-14 px-2 py-1 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 text-center"
                        value={form.startHour}
                        onChange={e => setForm(f => ({ ...f, startHour: e.target.value }))}/>
                      <span className="text-gray-400">:00 to</span>
                      <input type="number" min="0" max="23"
                        className="w-14 px-2 py-1 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 text-center"
                        value={form.endHour}
                        onChange={e => setForm(f => ({ ...f, endHour: e.target.value }))}/>
                      <span className="text-gray-400">:00 UTC</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAYS.map((d, i) => (
                        <button key={d} type="button" onClick={() => toggleDay(i)}
                          className={`w-9 py-1 rounded-xl text-[10px] font-semibold border-2 transition-all ${
                            form.daysOfWeek.includes(i)
                              ? 'border-amber-400 bg-amber-50 text-amber-700'
                              : 'border-gray-200 bg-white text-gray-400'
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertCircle size={12}/> {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors">
                {loading ? <RefreshCw size={12} className="animate-spin"/> : <Plus size={12}/>}
                {loading ? 'Adding…' : 'Add Rule'}
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── PolicyPage ────────────────────────────────────────────────
export default function PolicyPage() {
  const { agentId } = useParams()
  const [policyData, setPolicyData] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [showAdd,    setShowAdd]    = useState(false)
  const [actionMsg,  setActionMsg]  = useState('')
  const [simForm,    setSimForm]    = useState({ tool: '', projectId: '', operation: 'read' })
  const [simResult,  setSimResult]  = useState(null)
  const [simLoading, setSimLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getAgentPolicy(agentId)
      .then(({ data }) => setPolicyData(data.data || data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [agentId])

  useEffect(load, [load])

  async function handleDelete(ruleId) {
    if (!window.confirm('Delete this rule?')) return
    try {
      await removePolicyRule(agentId, ruleId)
      setActionMsg('Rule deleted.')
      load()
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  async function handleSimulate(e) {
    e.preventDefault()
    setSimLoading(true); setSimResult(null)
    try {
      const { data } = await simulatePolicy(agentId, {
        toolName:  simForm.tool,
        projectId: simForm.projectId || null,
        operation: simForm.operation || 'read',
      })
      setSimResult(data.data || data)
    } catch (err) {
      setSimResult({ error: err.response?.data?.error || err.message })
    } finally {
      setSimLoading(false)
    }
  }

  const policies    = policyData?.policies || []
  const catchAllIdx = policies.length - 1
  const allowCount  = policies.filter(r => r.effect === 'allow').length
  const denyCount   = policies.filter(r => r.effect === 'deny').length

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-700 to-purple-800 px-6 pt-10 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <Link to={`/agents/${agentId}`}
                className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-white text-xs font-medium mb-3 transition-colors">
                <ArrowLeft size={13}/> Back to agent
              </Link>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={18} className="text-indigo-300"/>
                <span className="text-indigo-300 text-sm font-medium">Policy Engine</span>
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {policyData?.agentName || 'Policy Rules'}
              </h1>
              <p className="text-indigo-200 text-sm mt-1 font-mono">{agentId}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={load}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-colors border border-white/20">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''}/>
              </button>
              <button onClick={() => { setShowAdd(true); setActionMsg('') }}
                className="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-lg">
                <Plus size={13}/> Add Rule
              </button>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-white tabular-nums">{policies.length}</p>
              <p className="text-xs text-indigo-300 mt-0.5">Total Rules</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-emerald-300 tabular-nums">{allowCount}</p>
              <p className="text-xs text-indigo-300 mt-0.5">Allow Rules</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 text-center border border-white/20">
              <p className="text-2xl font-bold text-red-300 tabular-nums">{denyCount}</p>
              <p className="text-xs text-indigo-300 mt-0.5">Deny Rules</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-5xl mx-auto px-6 -mt-8 pb-12">

        {/* Action message */}
        {actionMsg && (
          <div className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-medium ${
            actionMsg.startsWith('Error')
              ? 'bg-red-50 border border-red-100 text-red-700'
              : 'bg-emerald-50 border border-emerald-100 text-emerald-700'
          }`}>
            {actionMsg.startsWith('Error') ? <AlertCircle size={12}/> : <Check size={12}/>}
            {actionMsg}
          </div>
        )}

        {/* How it works callout */}
        <div className="bg-sky-50 border border-sky-100 rounded-2xl px-5 py-3 mb-4 flex items-start gap-3">
          <AlertCircle size={14} className="text-sky-500 flex-shrink-0 mt-0.5"/>
          <div className="text-xs text-sky-800 space-y-0.5">
            <p className="font-semibold">How policy rules work</p>
            <p>Rules are evaluated <strong>top-down, first-match-wins</strong>. Put DENY rules before ALLOW rules for explicit blocks. Empty conditions match everything. The catch-all DENY at the bottom cannot be removed.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left: Rules list ── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
              {/* Panel header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <ShieldCheck size={14} className="text-indigo-600"/>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Rules</h2>
                    <p className="text-[10px] text-gray-400">Top-down · first match wins · default DENY</p>
                  </div>
                </div>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-semibold">
                  {policies.length} rule{policies.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="p-4 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 text-gray-400 py-12 text-xs">
                    <RefreshCw size={14} className="animate-spin"/> Loading policy…
                  </div>
                ) : policies.length === 0 ? (
                  <div className="text-center py-12">
                    <ShieldX size={28} className="text-gray-200 mx-auto mb-3"/>
                    <p className="text-sm text-gray-500 font-medium">No rules defined</p>
                    <p className="text-xs text-gray-400 mt-1">All tool access is DENIED by default.</p>
                    <button onClick={() => setShowAdd(true)}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                      <Plus size={12}/> Add first rule
                    </button>
                  </div>
                ) : (
                  policies.map((rule, i) => (
                    <RuleCard
                      key={rule.id || i}
                      rule={rule}
                      index={i}
                      isCatchAll={i === catchAllIdx}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Simulator + Templates ── */}
          <div className="space-y-4">

            {/* Policy Simulator */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Play size={13} className="text-violet-600"/>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Simulator</h2>
                  <p className="text-[10px] text-gray-400">Test access without a real call</p>
                </div>
              </div>

              <div className="p-4">
                <form onSubmit={handleSimulate} className="space-y-3">
                  <div>
                    <label className={labelCls}>Tool name</label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {['search_web', 'execute_code', 'query_database'].map(t => (
                        <button key={t} type="button"
                          onClick={() => setSimForm(f => ({ ...f, tool: t }))}
                          className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                            simForm.tool === t
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                          }`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <input className={inputCls} placeholder="search_web" value={simForm.tool}
                      onChange={e => setSimForm(f => ({ ...f, tool: e.target.value }))} required/>
                  </div>
                  <div>
                    <label className={labelCls}>Project ID <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                    <input className={inputCls} placeholder="proj_abc123" value={simForm.projectId}
                      onChange={e => setSimForm(f => ({ ...f, projectId: e.target.value }))}/>
                  </div>
                  <div>
                    <label className={labelCls}>Operation</label>
                    <div className="flex gap-1.5">
                      {OPS.map(op => (
                        <button key={op} type="button"
                          onClick={() => setSimForm(f => ({ ...f, operation: op }))}
                          className={`flex-1 py-1.5 rounded-xl border-2 text-[10px] font-semibold transition-all ${
                            simForm.operation === op
                              ? 'border-violet-400 bg-violet-50 text-violet-700'
                              : 'border-gray-200 bg-white text-gray-400'
                          }`}>
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={simLoading}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-xl transition-colors">
                    {simLoading ? <RefreshCw size={12} className="animate-spin"/> : <Play size={12}/>}
                    {simLoading ? 'Simulating…' : 'Run Simulation'}
                  </button>
                </form>

                {/* Sim result */}
                {simResult && (
                  <div className={`mt-3 rounded-2xl p-4 border ${
                    simResult.error
                      ? 'bg-red-50 border-red-100'
                      : simResult.decision === 'allow'
                        ? 'bg-emerald-50 border-emerald-100'
                        : 'bg-red-50 border-red-100'
                  }`}>
                    {simResult.error ? (
                      <p className="text-xs text-red-600">{simResult.error}</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          {simResult.decision === 'allow'
                            ? <ShieldCheck size={18} className="text-emerald-600"/>
                            : <ShieldX size={18} className="text-red-500"/>}
                          <p className={`font-bold text-base ${simResult.decision === 'allow' ? 'text-emerald-700' : 'text-red-700'}`}>
                            {simResult.decision?.toUpperCase()}
                          </p>
                        </div>
                        {simResult.reason && (
                          <p className="text-[10px] text-gray-500 font-mono">{simResult.reason}</p>
                        )}
                        {simResult.matchedRule && (
                          <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-0.5">
                            <p className="font-semibold text-gray-700 text-[10px] uppercase tracking-wide">Matched rule</p>
                            <p className="font-mono text-[11px] text-gray-700">{simResult.matchedRule.resource}</p>
                            {simResult.matchedRule.description && (
                              <p className="text-[10px] text-gray-400">{simResult.matchedRule.description}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Templates */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Zap size={13} className="text-amber-600"/>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Quick Templates</h2>
                  <p className="text-[10px] text-gray-400">Common rule patterns</p>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {[
                  { label: 'Allow all tools',        resource: 'tool:*',             effect: 'allow', cond: 'no conditions'    },
                  { label: 'Block code execution',   resource: 'tool:execute_code',  effect: 'deny',  cond: 'no conditions'    },
                  { label: 'Read-only DB queries',   resource: 'tool:query_database',effect: 'allow', cond: 'operations: read' },
                  { label: 'Business hours only',    resource: 'tool:*',             effect: 'allow', cond: 'Mon–Fri 09–18 UTC'},
                ].map(t => (
                  <div key={t.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-semibold text-gray-800">{t.label}</p>
                    <p className="text-[10px] font-mono text-indigo-600">{t.effect} {t.resource}</p>
                    <p className="text-[10px] text-gray-400">{t.cond}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      {showAdd && (
        <AddRuleModal
          agentId={agentId}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); setActionMsg('Rule added successfully.'); load() }}
        />
      )}
    </div>
  )
}
