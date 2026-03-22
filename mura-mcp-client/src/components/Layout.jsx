import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Bot, LogOut, ShieldCheck, FolderOpen, ScrollText } from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/projects', icon: FolderOpen,      label: 'Projects' },
  { to: '/agents',   icon: Bot,             label: 'Agents' },
  { to: '/logs',     icon: ScrollText,      label: 'Logs' },
]

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('apiKey')
    localStorage.removeItem('developerName')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r flex flex-col bg-card">
        <div className="flex items-center gap-2 px-5 py-5 border-b">
          <ShieldCheck className="text-primary" size={22} />
          <span className="font-semibold text-lg tracking-tight">MCP Hub</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
