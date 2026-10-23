import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import {
  Library,
  Activity,
  Settings,
  LogOut,
  Bot,
  Menu,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

const navigation = [
  { name: 'Chat', href: '/chat', icon: Bot },
  { name: 'Biblioteca', href: '/knowledge', icon: Library },
  { name: 'Atividade', href: '/activity', icon: Activity },
  { name: 'Sistema', href: '/system', icon: Settings },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex bg-odin-black">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - minimal, no card appearance */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-odin-black border-r border-odin-graphite-800 flex flex-col transition-transform duration-300 ease-out-expo',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Navegação principal"
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-odin-graphite-800">
          <h1 className="text-heading-sm text-odin-violet-500 font-regular tracking-tight">ODIN V2</h1>
          <button
            className="lg:hidden p-2 rounded-lg text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-900 transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto" role="navigation">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'text-odin-violet-400 bg-odin-graphite-900'
                    : 'text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-900'
                )}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                {item.name}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-4 border-t border-odin-graphite-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="avatar-md">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-odin-graphite-400">Usuário</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-odin-graphite-300 hover:text-odin-crimson-400 hover:bg-odin-graphite-900 transition-colors"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Mobile header */}
        <header className="lg:hidden h-16 bg-odin-black border-b border-odin-graphite-800 flex items-center justify-between px-4">
          <h1 className="text-heading-sm text-odin-violet-500 font-regular tracking-tight">ODIN V2</h1>
          <button
            className="p-2 rounded-lg text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-900 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}