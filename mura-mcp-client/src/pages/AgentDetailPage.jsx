import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, RotateCcw, ShieldOff, Trash2, ShieldCheck, Pencil, X, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input, Label } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { getAgent, updateAgent, deactivateAgent, rotateAgentSecret, listAgentSessions, revokeAgentSessions, listProjects } from '../lib/api'

const TOOLS = [
  'search_web','read_file','write_file','execute_code',
  'query_database','send_email','call_api','manage_files',
  'analyze_data','generate_report',
]

function fmt(date) {
  if (!date) return '--'
  return new Date(date).toLocaleString()
}

export default function AgentDetailPage() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [agent,    setAgent]    = useState(null)
  const [projects, setProjects] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [actionMsg, setActionMsg] = useState('')
  const [secretResult, setSecretResult] = useState(null)
  const [editing,  setEditing]  = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving,   setSaving]   = useState(false)

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
          name:            a.name        || '',
          description:     a.description || '',
          allowedTools:    a.policy?.allowedTools    || a.allowedTools    || [],
          allowedProjects: a.policy?.allowedProjects || a.allowedProjects || [],
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
        : [...f.allowedTools, tool]
    }))
  }

  function toggleEditProject(pid) {
    setEditForm(f => ({
      ...f,
      allowedProjects: f.allowedProjects.includes(pid)
        ? f.allowedProjects.filter(p => p !== pid)
        : [...f.allowedProjects, pid]
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

  if (loading) return <div className="p-8 text-muted-foreground">Loading agent...</div>
  if (!agent)  return <div className="p-8 text-muted-foreground">Agent not found.</div>

  const envColors = {
    development: 'border-sky-300 bg-sky-50 text-sky-700',
    staging:     'border-yellow-300 bg-yellow-50 text-yellow-700',
    production:  'border-green-300 bg-green-50 text-green-700'
  }

  const isActive = agent.status === 'active' || agent.active

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/agents" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{agent.name}</h1>
          <p className="text-xs font-mono text-muted-foreground">{agentId}</p>
        </div>
        <Badge variant={isActive ? 'success' : 'secondary'} className="text-sm px-3 py-1">
          {isActive ? 'active' : 'inactive'}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => { setEditing(e => !e); setActionMsg('') }}>
          {editing ? <><X size={13} /> Cancel</> : <><Pencil size={13} /> Edit</>}
        </Button>
        <Button size="sm" variant="destructive" onClick={handleDelete}>
          <Trash2 size={13} /> Delete
        </Button>
      </div>

      {actionMsg && (
        <div className={`mb-4 px-4 py-2 rounded-md text-sm ${actionMsg.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
          {actionMsg}
        </div>
      )}

      {secretResult && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700 font-medium mb-1">New Agent Secret (copy now — shown once!)</p>
          <code className="text-sm font-mono break-all select-all">{secretResult}</code>
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Pencil size={15} /> Edit Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Allowed Tools</Label>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map(tool => (
                  <button key={tool} type="button" onClick={() => toggleEditTool(tool)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${editForm.allowedTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary'}`}>
                    {tool}
                  </button>
                ))}
              </div>
            </div>
            {projects.length > 0 && (
              <div className="space-y-2">
                <Label>Allowed Projects</Label>
                <div className="flex flex-wrap gap-2 rounded-md border border-input bg-background p-2 min-h-[38px]">
                  {projects.map(p => {
                    const checked = editForm.allowedProjects.includes(p.projectId)
                    return (
                      <button key={p.projectId} type="button" onClick={() => toggleEditProject(p.projectId)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium transition-colors ${checked ? 'border-primary bg-primary text-primary-foreground' : (envColors[p.environment] || 'border-border bg-background text-muted-foreground')}`}>
                        {checked && <span className="text-[10px]">v</span>}
                        {p.name}
                        <span className="text-[9px] opacity-70">{p.environment}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving...' : <><Check size={13} /> Save Changes</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                <X size={13} /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agent Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {agent.description && (
                <div><span className="text-muted-foreground">Description: </span>{agent.description}</div>
              )}
              <div><span className="text-muted-foreground">Created: </span>{fmt(agent.createdAt)}</div>
              <div><span className="text-muted-foreground">Last Auth: </span>{fmt(agent.lastAuthAt)}</div>
              <div><span className="text-muted-foreground">Auth Count: </span>{agent.authCount ?? agent.stats?.totalAuths ?? 0}</div>
              {(agent.policy?.allowedTools || agent.allowedTools)?.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1.5">Allowed Tools:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(agent.policy?.allowedTools || agent.allowedTools).map(t => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(agent.policy?.allowedProjects || agent.allowedProjects)?.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1.5">Allowed Projects:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(agent.policy?.allowedProjects || agent.allowedProjects).map(p => (
                      <Badge key={p} variant="outline">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Active Sessions ({sessions.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={load}><RefreshCw size={12} /> Refresh</Button>
            </CardHeader>
            <CardContent className="p-0">
              {sessions.length === 0 ? (
                <p className="text-muted-foreground text-sm p-6">No active sessions.</p>
              ) : (
                <div className="divide-y text-sm">
                  {sessions.map(s => (
                    <div key={s.sessionId || s._id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="font-mono text-xs">{s.sessionId || s._id}</p>
                        <p className="text-xs text-muted-foreground">Created: {fmt(s.createdAt)} · Expires: {fmt(s.expiresAt)}</p>
                      </div>
                      <Badge variant={s.revoked ? 'destructive' : 'success'}>
                        {s.revoked ? 'revoked' : 'active'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start gap-2"
                onClick={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <Pencil size={14} /> Edit Agent
              </Button>
              <Link to={`/agents/${agentId}/policy`}>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <ShieldCheck size={14} /> Policy Editor
                </Button>
              </Link>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleRotate}>
                <RotateCcw size={14} /> Rotate Secret
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleRevokeSessions}
                disabled={sessions.length === 0}>
                <Trash2 size={14} /> Revoke All Sessions
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                onClick={handleDeactivate} disabled={!isActive}>
                <ShieldOff size={14} /> Deactivate Agent
              </Button>
              <Button variant="destructive" size="sm" className="w-full justify-start gap-2" onClick={handleDelete}>
                <Trash2 size={14} /> Delete Agent
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
