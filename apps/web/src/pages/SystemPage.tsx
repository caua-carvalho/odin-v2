import { useState, useEffect } from 'react'
import { api, type SystemStatus } from '../lib/api'
import { cn, formatRelativeTime } from '../lib/utils'
import { LoadingScreen } from '../components/LoadingScreen'
import {
  Server,
  Database,
  Cpu,
  HardDrive,
  MemoryStick,
  Wifi,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Terminal,
  Info,
} from 'lucide-react'

const COMPONENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  gateway: Server,
  dashboard: Terminal,
  storage: Database,
  platforms: Wifi,
  memory: MemoryStick,
  disk: HardDrive,
  cpu: Cpu,
}

export function SystemPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadStatus = async () => {
    try {
      const data = await api.getSystemStatus()
      setStatus(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    loadStatus()
  }

  if (loading && !status) {
    return <LoadingScreen />
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
        <div>
          <h1 className="text-heading font-regular tracking-tight">Sistema</h1>
          <p className="text-body text-odin-graphite-400 mt-2">Status dos componentes e saúde do sistema</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-ghost"
        >
          <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Overall Status - minimal, no card */}
      <div className="p-6 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50 mb-10">
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center',
            status?.overall === 'ok' ? 'bg-odin-emerald-500/20' : 'bg-odin-amber-500/20'
          )}>
            {status?.overall === 'ok' ? (
              <CheckCircle className="w-7 h-7 text-odin-emerald-400" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-odin-amber-400" />
            )}
          </div>
          <div>
            <h2 className="text-heading-xs font-regular">
              Status Geral: <span className={cn(status?.overall === 'ok' ? 'text-odin-emerald-400' : 'text-odin-amber-400')}>
                {status?.overall === 'ok' ? 'Saudável' : 'Degradado'}
              </span>
            </h2>
            <p className="text-body-sm text-odin-graphite-400 mt-1">
              Última verificação: {status?.timestamp ? formatRelativeTime(status.timestamp) : 'Desconhecido'}
              {refreshing && <span className="ml-2 text-odin-violet-500">(atualizando...)</span>}
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', status?.hermes_connected ? 'bg-odin-emerald-400' : 'bg-odin-crimson-400')} />
              <span className="text-odin-graphite-300">Hermes</span>
              <span className="text-white font-medium">{status?.hermes_connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', status?.database_connected ? 'bg-odin-emerald-400' : 'bg-odin-crimson-400')} />
              <span className="text-odin-graphite-300">Banco</span>
              <span className="text-white font-medium">{status?.database_connected ? 'Conectado' : 'Desconectado'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-odin-graphite-300">Versão</span>
              <span className="text-white font-mono">{status?.version || '0.1.0'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Components Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
        {status?.components && Object.entries(status.components).map(([key, component]) => (
          <ComponentCard
            key={key}
            name={key}
            component={component}
            icon={COMPONENT_ICONS[key] || Info}
          />
        ))}

        {/* Additional static info - minimal panels */}
        <SystemInfoCard title="Backend" items={[
          { label: 'API', value: 'FastAPI 0.115+' },
          { label: 'Python', value: '3.12+' },
          { label: 'Database', value: 'SQLite (aiosqlite)' },
          { label: 'Auth', value: 'JWT (HS256)' },
        ]} />

        <SystemInfoCard title="Hermes Agent" items={[
          { label: 'Versão', value: '0.22.2' },
          { label: 'Protocolo', value: 'WebSocket (/api/pty)' },
          { label: 'Toolsets', value: 'terminal, file, web, browser, vision, skills, todo, cronjob, memory' },
          { label: 'Personalidade', value: 'JARVIS (pt-BR)' },
        ]} />

        <SystemInfoCard title="Frontend" items={[
          { label: 'Framework', value: 'React 18 + TypeScript' },
          { label: 'Build', value: 'Vite 5' },
          { label: 'Styling', value: 'Tailwind CSS' },
          { label: 'State', value: 'React Context + Hooks' },
        ]} />
      </div>

      {/* Logs section */}
      <div>
        <h3 className="text-heading-xs font-regular mb-4">Logs Recentes</h3>
        <div className="p-4 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50 font-mono text-code-sm max-h-96 overflow-auto">
          <p className="text-odin-graphite-500">Logs disponíveis via API: <code className="text-odin-graphite-300">GET /api/logs?file=agent&lines=100</code></p>
          <p className="text-odin-graphite-500 mt-2">Arquivos: agent, error, access, gateway</p>
        </div>
      </div>
    </div>
  )
}

function ComponentCard({ name, component, icon: Icon }: {
  name: string
  component: { status: string; details?: Record<string, any> }
  icon: React.ComponentType<{ className?: string }>
}) {
  const isOk = component.status === 'ok'

  return (
    <div className="p-4 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50">
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isOk ? 'bg-odin-emerald-500/20' : 'bg-odin-crimson-500/20')}>
          <Icon className={cn('w-5 h-5', isOk ? 'text-odin-emerald-400' : 'text-odin-crimson-400')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium capitalize text-white">{name}</h4>
            <span className={cn(
              'px-2 py-0.5 rounded-full text-nav-label',
              isOk ? 'bg-odin-emerald-500/20 text-odin-emerald-400' : 'bg-odin-crimson-500/20 text-odin-crimson-400'
            )}>
              {component.status}
            </span>
          </div>
          {component.details && (
            <div className="mt-2 text-caption text-odin-graphite-400 space-y-1">
              {Object.entries(component.details).slice(0, 4).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k.replace(/_/g, ' ')}:</span>
                  <span className="text-odin-graphite-300 font-mono">{typeof v === 'object' ? JSON.stringify(v) : v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SystemInfoCard({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <div className="p-4 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50">
      <h4 className="font-medium text-white mb-3 flex items-center gap-2">
        <Info className="w-5 h-5 text-odin-violet-500" />
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-odin-graphite-400">{item.label}</span>
            <span className="text-white font-mono">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}