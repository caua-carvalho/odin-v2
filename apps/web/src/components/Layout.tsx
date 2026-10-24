import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import {
  Compass,
  Bot,
  Library,
  Activity,
  Cpu,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { BackgroundParticles } from './react-bits/BackgroundParticles'
import { DecryptedText } from './react-bits/DecryptedText'

const navigation = [
  { name: 'Command Center', href: '/', icon: Compass },
  { name: 'Neural Chat', href: '/chat', icon: Bot },
  { name: 'Biblioteca', href: '/knowledge', icon: Library },
  { name: 'Atividade', href: '/activity', icon: Activity },
  { name: 'Telemetria', href: '/system', icon: Cpu },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hermesOnline, setHermesOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    const checkStatus = async () => {
      try {
        const res = await api.getSystemStatus()
        if (mounted) {
          setHermesOnline(res?.hermes_connected ?? true)
        }
      } catch {
        if (mounted) {
          setHermesOnline(false)
        }
      }
    }
    checkStatus()
    const interval = setInterval(checkStatus, 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-odin-black text-odin-graphite-50 relative overflow-hidden">
      {/* Background Cinematic Particles */}
      <BackgroundParticles particleCount={30} particleColor="#FF6A00" accentColor="#67DFFF" />

      {/* Top HUD Status Bar */}
      <header className="h-14 border-b border-odin-graphite-800/80 bg-odin-surface/80 backdrop-blur-md z-30 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-1.5 rounded-lg text-odin-graphite-400 hover:text-odin-graphite-50 hover:bg-odin-graphite-900 focus:outline-none"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu de navegação"
          >
            <Menu className="w-5 h-5" />
          </button>

          <NavLink to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-odin-orange-500/15 border border-odin-orange-500/40 flex items-center justify-center shadow-hud-glow-orange group-hover:border-odin-orange-400 transition-colors">
              <span className="font-mono font-bold text-xs text-odin-orange-400">Ω</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-xs font-bold tracking-widest text-odin-graphite-100 uppercase">
                <DecryptedText text="ODIN V2" speed={25} />
              </span>
              <span className="font-mono text-[9px] tracking-wider text-odin-orange-400/90 uppercase -mt-0.5">
                Neural Command
              </span>
            </div>
          </NavLink>
        </div>

        {/* System Telemetry Badges */}
        <div className="hidden sm:flex items-center gap-3 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-odin-surface-elevated/70 border border-odin-graphite-800 text-odin-graphite-300">
            {hermesOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-odin-emerald-400" />
                <span>HERMES LINK:</span>
                <span className="text-odin-emerald-400 font-semibold">ONLINE</span>
              </>
            ) : hermesOnline === false ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-odin-crimson-400" />
                <span>HERMES LINK:</span>
                <span className="text-odin-crimson-400 font-semibold">OFFLINE</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-odin-amber-400 animate-pulse" />
                <span>HERMES LINK:</span>
                <span className="text-odin-amber-400 font-semibold">SYNC</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-odin-surface-elevated/70 border border-odin-graphite-800 text-odin-graphite-300">
            <span className="w-1.5 h-1.5 rounded-full bg-odin-cyan-300 animate-pulse" />
            <span>NODE:</span>
            <span className="text-odin-cyan-300 font-semibold">JARVIS-CORE</span>
          </div>
        </div>

        {/* User profile & quick exit */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-odin-surface-elevated/40 border border-odin-graphite-800/60">
            <div className="w-5 h-5 rounded-full bg-odin-orange-500/20 text-odin-orange-400 flex items-center justify-center font-mono text-xs font-semibold">
              {user?.email?.[0].toUpperCase() || 'U'}
            </div>
            <span className="hidden md:inline font-mono text-xs text-odin-graphite-300 truncate max-w-[130px]">
              {user?.email || 'operador'}
            </span>
          </div>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-odin-graphite-400 hover:text-odin-crimson-400 hover:bg-odin-crimson-500/10 border border-transparent hover:border-odin-crimson-500/20 transition-colors"
            title="Encerrar sessão"
            aria-label="Encerrar sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Navigation */}
        <aside
          className={cn(
            'fixed lg:static inset-y-14 left-0 z-40 w-60 bg-odin-surface/90 lg:bg-odin-surface/40 backdrop-blur-md border-r border-odin-graphite-800/80 flex flex-col transition-transform duration-300 ease-out-expo',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
          aria-label="Navegação neural"
        >
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-odin-graphite-800">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-odin-graphite-300">
              Navegação
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded text-odin-graphite-400 hover:text-odin-graphite-50"
              aria-label="Fechar navegação"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto" role="navigation">
            <div className="px-3 pt-2 pb-1 text-[10px] font-mono tracking-widest text-odin-graphite-500 uppercase">
              Interfaces Operacionais
            </div>

            {navigation.map((item) => {
              const Icon = item.icon
              const isActive =
                item.href === '/'
                  ? location.pathname === '/'
                  : location.pathname === item.href || location.pathname.startsWith(item.href + '/')

              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-xs tracking-wide transition-all duration-150',
                    isActive
                      ? 'bg-odin-orange-500/15 text-odin-orange-400 border border-odin-orange-500/40 shadow-hud-glow-orange font-semibold'
                      : 'text-odin-graphite-400 hover:text-odin-graphite-100 hover:bg-odin-surface-elevated/70 border border-transparent'
                  )}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-odin-orange-400' : 'text-odin-graphite-400')} />
                  <span>{item.name}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-odin-orange-400 animate-pulse" />
                  )}
                </NavLink>
              )
            })}
          </nav>

          {/* Sidebar Footer Telemetry */}
          <div className="p-3 border-t border-odin-graphite-800/80 font-mono text-[10px] text-odin-graphite-500">
            <div className="flex items-center justify-between">
              <span>SYS_REV:</span>
              <span className="text-odin-graphite-300">2.4.0-NC</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span>SECURITY:</span>
              <span className="text-odin-emerald-400">ENCRYPTED</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}