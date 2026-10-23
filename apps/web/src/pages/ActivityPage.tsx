import { useState, useEffect } from 'react'
import { api, type Run, type Approval, type RunEvent } from '../lib/api'
import { cn, formatDate } from '../lib/utils'
import { LoadingScreen } from '../components/LoadingScreen'
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Terminal,
  FileText,
  Check,
  X,
  ChevronDown,
  Zap,
  Shield,
  MessageSquare,
} from 'lucide-react'

const RUN_STATUS_CONFIG = {
  queued: { label: 'Na fila', color: 'text-odin-graphite-400', bg: 'bg-odin-graphite-700', icon: Clock },
  running: { label: 'Executando', color: 'text-odin-violet-400', bg: 'bg-odin-violet-500/20 border-odin-violet-500/30', icon: Loader2 },
  waiting_approval: { label: 'Aguardando aprovação', color: 'text-odin-amber-400', bg: 'bg-odin-amber-500/20 border-odin-amber-500/30', icon: AlertTriangle },
  completed: { label: 'Concluído', color: 'text-odin-emerald-400', bg: 'bg-odin-emerald-500/20 border-odin-emerald-500/30', icon: CheckCircle },
  failed: { label: 'Falhou', color: 'text-odin-crimson-400', bg: 'bg-odin-crimson-500/20 border-odin-crimson-500/30', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'text-odin-graphite-400', bg: 'bg-odin-graphite-700', icon: XCircle },
  interrupted: { label: 'Interrompido', color: 'text-odin-graphite-400', bg: 'bg-odin-graphite-700', icon: Zap },
} as const

const APPROVAL_STATUS_CONFIG = {
  pending: { label: 'Pendente', color: 'text-odin-amber-400', bg: 'bg-odin-amber-500/20 border-odin-amber-500/30', icon: Clock },
  approved: { label: 'Aprovado', color: 'text-odin-emerald-400', bg: 'bg-odin-emerald-500/20 border-odin-emerald-500/30', icon: CheckCircle },
  denied: { label: 'Negado', color: 'text-odin-crimson-400', bg: 'bg-odin-crimson-500/20 border-odin-crimson-500/30', icon: XCircle },
  expired: { label: 'Expirado', color: 'text-odin-graphite-400', bg: 'bg-odin-graphite-700', icon: Clock },
} as const

function getStatusConfig(status: Run['status']) {
  return RUN_STATUS_CONFIG[status] || RUN_STATUS_CONFIG.queued
}

function getApprovalStatusConfig(status: Approval['status']) {
  return APPROVAL_STATUS_CONFIG[status] || APPROVAL_STATUS_CONFIG.pending
}

export function ActivityPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'runs' | 'approvals'>('runs')
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [runsData, approvalsData] = await Promise.all([
        api.listRuns({ page_size: 50 }).catch(() => []),
        api.listApprovals().catch(() => ({ items: [] })),
      ])
      setRuns(runsData || [])
      setApprovals(approvalsData.items || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (approvalId: string) => {
    try {
      await api.approve(approvalId)
      setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'approved' as const } : a))
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao aprovar')
    }
  }

  const handleDeny = async (approvalId: string) => {
    try {
      await api.deny(approvalId)
      setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status: 'denied' as const } : a))
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao negar')
    }
  }

  const toggleRunExpand = (runId: string) => {
    setExpandedRun(prev => prev === runId ? null : runId)
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-heading font-regular tracking-tight">Atividade</h1>
        <p className="text-body text-odin-graphite-400 mt-2">Execuções do agente e aprovações pendentes</p>
      </div>

      {/* Tabs - ghost style */}
      <div className="flex gap-2 mb-10">
        <button
          onClick={() => setActiveTab('runs')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors text-nav-label',
            activeTab === 'runs'
              ? 'text-white bg-odin-violet-500'
              : 'text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-900'
          )}
        >
          Execuções
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors text-nav-label relative',
            activeTab === 'approvals'
              ? 'text-white bg-odin-violet-500'
              : 'text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-900'
          )}
        >
          Aprovações
          {approvals.filter(a => a.status === 'pending').length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-odin-crimson-500 text-white text-xs rounded-full flex items-center justify-center">
              {approvals.filter(a => a.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'runs' && (
        <RunsList
          runs={runs}
          expandedRun={expandedRun}
          onToggleExpand={toggleRunExpand}
        />
      )}

      {activeTab === 'approvals' && (
        <ApprovalsList
          approvals={approvals}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}
    </div>
  )
}

function RunsList({ runs, expandedRun, onToggleExpand }: {
  runs: Run[]
  expandedRun: string | null
  onToggleExpand: (runId: string) => void
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-odin-graphite-500">
        <Terminal className="w-12 h-12 mb-3 opacity-30" />
        <h3 className="text-heading-xs font-regular mb-1">Nenhuma execução ainda</h3>
        <p className="text-body">Inicie uma conversa no Chat para ver execuções aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {runs.map(run => {
        const statusConfig = getStatusConfig(run.status)
        const StatusIcon = statusConfig.icon
        const isExpanded = expandedRun === run.id
        const events = run.events || []

        return (
          <div key={run.id} className="group">
            <button
              onClick={() => onToggleExpand(run.id)}
              className="w-full flex items-center gap-4 p-4 bg-odin-graphite-950/50 rounded-2xl hover:bg-odin-graphite-950 transition-colors text-left"
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', statusConfig.bg)}>
                <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-odin-graphite-300 truncate">
                    {run.conversation_id.slice(0, 8)}...
                  </span>
                  <span className={cn('px-2 py-0.5 rounded-full text-nav-label', statusConfig.bg, statusConfig.color)}>
                    {statusConfig.label}
                  </span>
                </div>
                <p className="text-body-sm text-odin-graphite-400 truncate mt-1">
                  Iniciado em {formatDate(run.started_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-odin-graphite-400">
                {run.completed_at && (
                  <span className="text-sm font-mono">
                    {run.started_at && run.completed_at && (
                      <>
                        {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
                      </>
                    )}
                  </span>
                )}
                <ChevronDown className={cn('w-5 h-5 transition-transform', isExpanded && 'rotate-180')} />
              </div>
            </button>

            {isExpanded && (
              <div className="mt-3 p-4 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50 animate-slide-down">
                {run.result_summary && (
                  <div className="mb-4 p-4 bg-odin-black rounded-xl">
                    <p className="text-code-sm text-odin-graphite-300 font-mono whitespace-pre-wrap">
                      {run.result_summary}
                    </p>
                  </div>
                )}
                {run.error && (
                  <div className="mb-4 p-4 bg-odin-crimson-500/10 border border-odin-crimson-500/20 rounded-xl">
                    <p className="text-code-sm text-odin-crimson-300 font-mono whitespace-pre-wrap">
                      {run.error}
                    </p>
                  </div>
                )}
                {events.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-nav-label text-odin-graphite-300 mb-2">Eventos</h4>
                    {events.map((event, idx) => (
                      <EventRow key={idx} event={event} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EventRow({ event }: { event: RunEvent }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    token: MessageSquare,
    tool_call: Terminal,
    tool_result: FileText,
    approval_requested: Shield,
    run_completed: CheckCircle,
    run_failed: XCircle,
    run_cancelled: XCircle,
  }
  const Icon = icons[event.type] || MessageSquare

  return (
    <div className="flex items-start gap-3 text-code-sm text-odin-graphite-300 font-mono p-3 bg-odin-black rounded-xl">
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-odin-violet-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-odin-graphite-500">{formatDate(event.timestamp)}</span>
          <span className="w-1 h-1 rounded-full bg-odin-graphite-600" />
          <span className="text-odin-violet-400">{event.type}</span>
        </div>
        <pre className="text-odin-graphite-400 whitespace-pre-wrap break-all text-[11px]">
          {JSON.stringify(event.data, null, 2).slice(0, 300)}
        </pre>
      </div>
    </div>
  )
}

function ApprovalsList({ approvals, onApprove, onDeny }: {
  approvals: Approval[]
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}) {
  const pendingApprovals = approvals.filter(a => a.status === 'pending')
  const resolvedApprovals = approvals.filter(a => a.status !== 'pending')

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-odin-graphite-500">
        <Shield className="w-12 h-12 mb-3 opacity-30" />
        <h3 className="text-heading-xs font-regular mb-1">Nenhuma aprovação</h3>
        <p className="text-body">Operações que exigem sua aprovação aparecerão aqui</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {pendingApprovals.length > 0 && (
        <section>
          <h3 className="text-nav-label text-odin-graphite-300 mb-4">Pendentes ({pendingApprovals.length})</h3>
          <div className="space-y-3">
            {pendingApprovals.map(approval => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={onApprove}
                onDeny={onDeny}
              />
            ))}
          </div>
        </section>
      )}

      {resolvedApprovals.length > 0 && (
        <section>
          <h3 className="text-nav-label text-odin-graphite-300 mb-4">Resolvidas</h3>
          <div className="space-y-2">
            {resolvedApprovals.slice(0, 10).map(approval => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={onApprove}
                onDeny={onDeny}
                readonly
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ApprovalCard({ approval, onApprove, onDeny, readonly = false }: {
  approval: Approval
  onApprove: (id: string) => void
  onDeny: (id: string) => void
  readonly?: boolean
}) {
  const statusConfig = getApprovalStatusConfig(approval.status)
  const StatusIcon = statusConfig.icon

  return (
    <div className="p-4 bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50">
      <div className="flex items-start gap-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', statusConfig.bg)}>
          <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-odin-graphite-300">{approval.operation}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-nav-label', statusConfig.bg, statusConfig.color)}>
              {statusConfig.label}
            </span>
          </div>
          <p className="text-body-sm text-odin-graphite-400 mt-1 font-mono">
            {JSON.stringify(approval.details).slice(0, 100)}
          </p>
          <p className="text-caption text-odin-graphite-500 mt-2">
            Criado em {formatDate(approval.created_at)}
            {approval.expires_at && ` • Expira em ${formatDate(approval.expires_at)}`}
          </p>
        </div>
        {!readonly && approval.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => onDeny(approval.id)}
              className="btn-danger text-sm"
            >
              <X className="w-4 h-4" />
              Negar
            </button>
            <button
              onClick={() => onApprove(approval.id)}
              className="btn-primary text-sm"
            >
              <Check className="w-4 h-4" />
              Aprovar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}