import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bot, ShieldCheck, Activity, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { listAgents } from '../lib/api'

export default function DashboardPage() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listAgents()
      .then(({ data }) => setAgents(data.data?.agents || data.agents || data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const active = agents.filter((a) => a.status === 'active').length
  const inactive = agents.filter((a) => a.status !== 'active').length
  const totalSessions = agents.reduce((sum, a) => sum + (a.activeSessions || 0), 0)

  const stats = [
    { label: 'Total Agents', value: agents.length, icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Agents', value: active, icon: ShieldCheck, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Inactive Agents', value: inactive, icon: Activity, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'Active Sessions', value: totalSessions, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">MCP Hub Zero Trust Management</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{label}</p>
                  <p className="text-3xl font-bold mt-1">
                    {loading ? '…' : value}
                  </p>
                </div>
                <div className={`${bg} ${color} p-3 rounded-full`}>
                  <Icon size={20} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent agents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Agents</CardTitle>
          <Link to="/agents" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No agents registered yet.</p>
          ) : (
            <div className="divide-y">
              {agents.slice(0, 5).map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{agent.agentId}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>
                      {agent.status}
                    </Badge>
                    <Link
                      to={`/agents/${agent.agentId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
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
