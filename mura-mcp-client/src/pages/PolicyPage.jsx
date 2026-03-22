import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Play, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { getAgentPolicy, addPolicyRule, removePolicyRule, simulatePolicy } from '../lib/api'

const EFFECTS = ['allow', 'deny']
const TOOLS = [
  '*', 'search_web', 'read_file', 'write_file', 'execute_code',
  'query_database', 'send_email', 'call_api', 'manage_files',
  'analyze_data', 'generate_report',
]

export default function PolicyPage() {
  const { agentId } = useParams()
  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newRule, setNewRule] = useState({ effect: 'allow', tool: '*', project: '*', operation: '*', priority: 100 })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [simForm, setSimForm] = useState({ tool: '', project: '', operation: '' })
  const [simResult, setSimResult] = useState(null)
  const [simLoading, setSimLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    getAgentPolicy(agentId)
      .then(({ data }) => setPolicy(data.policy || data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [agentId])

  useEffect(load, [load])

  async function handleAddRule(e) {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)
    try {
      await addPolicyRule(agentId, {
        effect: newRule.effect,
        tool: newRule.tool,
        project: newRule.project || '*',
        operation: newRule.operation || '*',
        priority: Number(newRule.priority),
      })
      setShowAdd(false)
      setNewRule({ effect: 'allow', tool: '*', project: '*', operation: '*', priority: 100 })
      load()
      setActionMsg('Rule added.')
    } catch (err) {
      setAddError(err.response?.data?.error || err.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleDeleteRule(ruleId) {
    if (!window.confirm('Delete this rule?')) return
    try {
      await removePolicyRule(agentId, ruleId)
      load()
      setActionMsg('Rule deleted.')
    } catch (err) {
      setActionMsg('Error: ' + (err.response?.data?.error || err.message))
    }
  }

  async function handleSimulate(e) {
    e.preventDefault()
    setSimLoading(true)
    setSimResult(null)
    try {
      const { data } = await simulatePolicy(agentId, {
        tool: simForm.tool,
        projectId: simForm.project,
        operation: simForm.operation,
      })
      setSimResult(data)
    } catch (err) {
      setSimResult({ error: err.response?.data?.error || err.message })
    } finally {
      setSimLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading policy…</div>

  const rules = policy?.rules || []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/agents/${agentId}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Policy Editor</h1>
          <p className="text-xs font-mono text-muted-foreground">{agentId}</p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" onClick={() => { setShowAdd(!showAdd); setActionMsg('') }}>
          <Plus size={14} /> Add Rule
        </Button>
      </div>

      {actionMsg && (
        <div className="mb-4 px-4 py-2 rounded-md bg-muted text-sm">{actionMsg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Add rule form */}
          {showAdd && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New Rule</CardTitle>
                <CardDescription>Rules are evaluated top-down by priority (lower = higher priority)</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddRule} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Effect</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newRule.effect}
                        onChange={(e) => setNewRule({ ...newRule, effect: e.target.value })}
                      >
                        {EFFECTS.map((e) => <option key={e}>{e}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Input type="number" value={newRule.priority}
                        onChange={(e) => setNewRule({ ...newRule, priority: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tool (* = all)</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newRule.tool}
                        onChange={(e) => setNewRule({ ...newRule, tool: e.target.value })}
                      >
                        {TOOLS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Project (* = all)</Label>
                      <Input placeholder="* or proj-123" value={newRule.project}
                        onChange={(e) => setNewRule({ ...newRule, project: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Operation (* = all)</Label>
                      <Input placeholder="* or read / write" value={newRule.operation}
                        onChange={(e) => setNewRule({ ...newRule, operation: e.target.value })} />
                    </div>
                  </div>
                  {addError && <p className="text-sm text-destructive">{addError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={addLoading}>
                      {addLoading ? 'Adding…' : 'Add Rule'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Rules table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rules ({rules.length})</CardTitle>
              <CardDescription>Default policy when no rule matches: DENY</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rules.length === 0 ? (
                <p className="text-muted-foreground text-sm p-6">No rules defined. All access is DENIED by default.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Priority</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Effect</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Tool</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Project</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Operation</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...rules].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100)).map((rule) => (
                      <tr key={rule.ruleId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{rule.priority ?? 100}</td>
                        <td className="px-4 py-3">
                          <Badge variant={rule.effect === 'allow' ? 'success' : 'destructive'}>
                            {rule.effect}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{rule.tool || '*'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{rule.project || '*'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{rule.operation || '*'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDeleteRule(rule.ruleId)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Simulator */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Policy Simulator</CardTitle>
              <CardDescription>Test access without calling the real API</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSimulate} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tool</Label>
                  <Input placeholder="search_web" value={simForm.tool}
                    onChange={(e) => setSimForm({ ...simForm, tool: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Project ID</Label>
                  <Input placeholder="proj-123" value={simForm.project}
                    onChange={(e) => setSimForm({ ...simForm, project: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Operation</Label>
                  <Input placeholder="read" value={simForm.operation}
                    onChange={(e) => setSimForm({ ...simForm, operation: e.target.value })} />
                </div>
                <Button type="submit" size="sm" className="w-full" disabled={simLoading}>
                  <Play size={14} /> {simLoading ? 'Simulating…' : 'Simulate'}
                </Button>
              </form>

              {simResult && (
                <div className={`mt-4 rounded-md p-3 ${simResult.error ? 'bg-destructive/10' : simResult.decision === 'allow' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {simResult.error ? (
                    <p className="text-sm text-destructive">{simResult.error}</p>
                  ) : (
                    <>
                      <p className={`font-bold text-lg ${simResult.decision === 'allow' ? 'text-green-700' : 'text-red-700'}`}>
                        {simResult.decision?.toUpperCase()}
                      </p>
                      {simResult.reason && (
                        <p className="text-xs text-muted-foreground mt-1">{simResult.reason}</p>
                      )}
                      {simResult.matchedRule && (
                        <p className="text-xs font-mono mt-1">Rule: {simResult.matchedRule.ruleId}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
