import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  api,
  type Approval,
  type Conversation,
  type Message,
  type Run,
  type RunEvent,
} from '../lib/api'
import { cn, formatRelativeTime } from '../lib/utils'
import { LoadingScreen } from '../components/LoadingScreen'
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Terminal,
  User,
  Wrench,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

type ToolActivity = {
  call_id: string
  tool: string
  args?: unknown
  context?: string | null
  result?: string
  is_error?: boolean
  error?: string | null
  duration_s?: number | null
  status: 'running' | 'done'
}

type ApprovalCard = {
  approval_id: string
  request_id?: string
  operation: string
  command?: string
  description?: string
  choices: string[]
  details?: Record<string, any>
}

type LiveState = {
  runId: string | null
  text: string
  reasoning: string
  tools: ToolActivity[]
  statusText: string | null
  error: string | null
  phase: 'idle' | 'connecting' | 'streaming' | 'waiting_approval' | 'stopping' | 'queued' | 'done' | 'error'
  startedAt: number | null
  model?: string
  usage?: Record<string, any> | null
}

type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting'

function emptyLive(): LiveState {
  return {
    runId: null,
    text: '',
    reasoning: '',
    tools: [],
    statusText: null,
    error: null,
    phase: 'idle',
    startedAt: null,
  }
}

const RUN_EVENT_TYPES = [
  'run_queued',
  'run_started',
  'session_started',
  'message_start',
  'token',
  'reasoning',
  'status',
  'session_info',
  'title',
  'tool_call',
  'tool_result',
  'approval_requested',
  'approval_resolved',
  'approval_cancelled',
  'run_stopping',
  'run_completed',
  'run_failed',
  'run_cancelled',
  'run_snapshot',
  'error',
]

const TERMINAL_STATUSES: Run['status'][] = ['completed', 'failed', 'cancelled', 'interrupted']

function isActiveStatus(status: Run['status'] | string | null | undefined) {
  return status === 'queued' || status === 'running' || status === 'waiting_approval'
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function clampText(value: unknown, limit = 4000): string {
  const text = pretty(value)
  return text.length > limit ? `${text.slice(0, limit)}\n… (truncado)` : text
}

function approvalFromEvent(data: Record<string, any>): ApprovalCard {
  return {
    approval_id: String(data.approval_id || ''),
    request_id: data.request_id ? String(data.request_id) : undefined,
    operation: String(data.operation || data.details?.tool_name || 'ação'),
    command: data.command || data.details?.command || '',
    description: data.description || data.details?.description || '',
    choices: Array.isArray(data.choices) ? data.choices.map(String) : ['once', 'deny'],
    details: data.details,
  }
}

function approvalFromRecord(record: Approval): ApprovalCard {
  const details = (record.details || {}) as Record<string, any>
  return {
    approval_id: record.id,
    request_id: record.hermes_approval_id || undefined,
    operation: record.operation || 'ação',
    command: details.command || '',
    description: details.description || '',
    choices: Array.isArray(details.choices) && details.choices.length > 0 ? details.choices.map(String) : ['once', 'deny'],
    details,
  }
}

function choiceLabel(choice: string): string {
  switch (choice) {
    case 'once':
      return 'Permitir uma vez'
    case 'session':
      return 'Permitir nesta sessão'
    case 'always':
      return 'Permitir sempre'
    case 'deny':
      return 'Negar'
    default:
      return choice
  }
}

function upsertTool(tools: ToolActivity[], data: Record<string, any>): ToolActivity[] {
  const callId = String(data.call_id || data.tool || `tool-${tools.length}`)
  const next: ToolActivity = {
    call_id: callId,
    tool: String(data.tool || data.name || 'ferramenta'),
    args: data.args,
    context: data.context || null,
    status: 'running',
  }
  const index = tools.findIndex((tool) => tool.call_id === callId)
  if (index === -1) return [...tools, next]
  const copy = [...tools]
  copy[index] = { ...copy[index], ...next, status: copy[index].status }
  return copy
}

function completeTool(tools: ToolActivity[], data: Record<string, any>): ToolActivity[] {
  const callId = String(data.call_id || data.tool || '')
  const index = tools.findIndex((tool) => tool.call_id === callId)
  const completed: ToolActivity = {
    call_id: callId,
    tool: String(data.tool || (index >= 0 ? tools[index].tool : 'ferramenta')),
    args: index >= 0 ? tools[index].args : undefined,
    context: index >= 0 ? tools[index].context : null,
    result: typeof data.result === 'string' ? data.result : pretty(data.result),
    is_error: Boolean(data.is_error),
    error: data.error || null,
    duration_s: data.duration_s ?? null,
    status: 'done',
  }
  if (index === -1) return [...tools, completed]
  const copy = [...tools]
  copy[index] = { ...copy[index], ...completed }
  return copy
}

function mergePersistedTools(calls?: any[] | null, results?: any[] | null): ToolActivity[] {
  const byId = new Map<string, ToolActivity>()
  for (const call of calls || []) {
    const id = String(call?.call_id || '')
    if (!id) continue
    byId.set(id, {
      call_id: id,
      tool: String(call.tool || 'ferramenta'),
      args: call.args,
      context: call.context || null,
      status: 'done',
    })
  }
  for (const result of results || []) {
    const id = String(result?.call_id || '')
    if (!id) continue
    const previous = byId.get(id)
    byId.set(id, {
      call_id: id,
      tool: String(result.tool || previous?.tool || 'ferramenta'),
      args: previous?.args,
      context: previous?.context || null,
      result: typeof result.result === 'string' ? result.result : pretty(result.result),
      is_error: Boolean(result.is_error),
      error: result.error || null,
      duration_s: result.duration_s ?? null,
      status: 'done',
    })
  }
  return Array.from(byId.values())
}

function statusLabel(run: Run | null, live: LiveState, connection: ConnectionState): string {
  if (run && isActiveStatus(run.status)) {
    if (live.phase === 'stopping' || live.phase === 'waiting_approval' || live.phase === 'queued') {
      return live.statusText || 'Aguardando…'
    }
    if (live.statusText) return live.statusText
    if (connection === 'reconnecting') return 'Reconectando…'
    if (run.status === 'waiting_approval') return 'Aguardando aprovação'
    if (run.status === 'queued') return `Na fila${run.queue_position ? ` (${run.queue_position}º)` : ''}`
    return 'Executando…'
  }
  if (run?.status === 'failed') return 'A execução falhou'
  if (run?.status === 'cancelled' || run?.status === 'interrupted') return 'Execução interrompida'
  if (run?.status === 'completed') return 'Concluída'
  return 'Pronto para conversar'
}

function connectionDotClass(connection: ConnectionState, runActive: boolean): string {
  if (!runActive) return 'status-dot-idle'
  if (connection === 'live') return 'status-dot-success'
  if (connection === 'reconnecting') return 'status-dot-waiting'
  return 'status-dot-running'
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${rest.toString().padStart(2, '0')}s`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [run, setRun] = useState<Run | null>(null)
  const [live, setLive] = useState<LiveState>(emptyLive)
  const [approval, setApproval] = useState<ApprovalCard | null>(null)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [queuedRuns, setQueuedRuns] = useState<Run[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [conversationsLoaded, setConversationsLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [showJump, setShowJump] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pinnedRef = useRef(true)
  const mountedRef = useRef(true)
  const loadedConversationRef = useRef<string | null>(null)
  const conversationsRef = useRef<Conversation[]>([])
  const currentConversationRef = useRef<Conversation | null>(null)
  const runRef = useRef<Run | null>(null)
  const finishTokenRef = useRef(0)
  const handleEventRef = useRef<(event: RunEvent) => void>(() => {})
  const openStreamRef = useRef<() => void>(() => {})

  const streamRef = useRef<{
    es: EventSource | null
    runId: string | null
    conversationId: string | null
    lastSeq: number
    terminated: boolean
    retries: number
    timer: number | null
  }>({
    es: null,
    runId: null,
    conversationId: null,
    lastSeq: 0,
    terminated: false,
    retries: 0,
    timer: null,
  })

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    currentConversationRef.current = currentConversation
  }, [currentConversation])

  useEffect(() => {
    runRef.current = run
  }, [run])

  const runActive = Boolean(run && isActiveStatus(run.status))
  const queuedIds = new Set(queuedRuns.map((item) => item.id))

  const closeStream = useCallback(() => {
    const stream = streamRef.current
    stream.terminated = true
    stream.runId = null
    stream.lastSeq = 0
    stream.retries = 0
    if (stream.timer !== null) {
      window.clearTimeout(stream.timer)
      stream.timer = null
    }
    if (stream.es) {
      stream.es.close()
      stream.es = null
    }
    if (mountedRef.current) setConnection('idle')
  }, [])

  const loadPendingApproval = useCallback(async (runId: string) => {
    try {
      const data = await api.listApprovals('pending', runId)
      const record = data?.items?.[0] as Approval | undefined
      if (record) setApproval(approvalFromRecord(record))
    } catch {
      // The live `approval_requested` event is the primary path.
    }
  }, [])

  const openStream = useCallback(() => {
    const stream = streamRef.current
    if (!stream.runId || stream.terminated) return

    setConnection(stream.retries > 0 ? 'reconnecting' : 'connecting')
    const es = api.createEventSource(stream.runId, stream.lastSeq)
    stream.es = es

    es.onopen = () => {
      if (streamRef.current.es !== es) return
      stream.retries = 0
      setConnection('live')
    }

    es.onerror = () => {
      if (streamRef.current.es !== es || stream.terminated) return
      es.close()
      stream.es = null
      if (stream.retries >= 6) {
        setConnection('idle')
        setNotice('Não foi possível restabelecer a conexão com o servidor. Recarregue a página.')
        return
      }
      stream.retries += 1
      setConnection('reconnecting')
      const wait = Math.min(1000 * 2 ** (stream.retries - 1), 8000)
      stream.timer = window.setTimeout(() => {
        stream.timer = null
        openStreamRef.current()
      }, wait)
    }

    for (const type of RUN_EVENT_TYPES) {
      es.addEventListener(type, (rawEvent) => {
        if (streamRef.current.es !== es) return
        const payload = (rawEvent as MessageEvent).data
        if (typeof payload !== 'string') return
        try {
          const event = JSON.parse(payload) as RunEvent
          stream.lastSeq = Math.max(stream.lastSeq, Number(event.seq) || 0)
          handleEventRef.current(event)
        } catch {
          // Ignore malformed frames; the stream will replay on reconnect.
        }
      })
    }
  }, [])

  useEffect(() => {
    openStreamRef.current = openStream
  }, [openStream])

  const refreshQueue = useCallback(async (conversationIdToUse: string) => {
    try {
      const queued = (await api.listRuns({
        conversation_id: conversationIdToUse,
        status: 'queued',
        page_size: 50,
      })) as Run[]
      setQueuedRuns([...queued].reverse())
    } catch {
      // Queue display is best-effort.
    }
  }, [])

  const attachRun = useCallback(
    (nextRun: Run) => {
      const stream = streamRef.current
      if (stream.runId === nextRun.id && stream.es) return

      closeStream()
      setRun(nextRun)
      runRef.current = nextRun
      setApproval(null)
      setApprovalError(null)
      setQueuedRuns((previous) => previous.filter((item) => item.id !== nextRun.id))
      setLive({
        ...emptyLive(),
        runId: nextRun.id,
        phase: isActiveStatus(nextRun.status) ? 'connecting' : 'done',
        startedAt: Date.now(),
      })

      if (!isActiveStatus(nextRun.status)) return

      const next = streamRef.current
      next.conversationId = nextRun.conversation_id
      next.runId = nextRun.id
      next.lastSeq = 0
      next.terminated = false
      next.retries = 0
      openStream()

      if (nextRun.status === 'waiting_approval') {
        void loadPendingApproval(nextRun.id)
      }
    },
    [closeStream, loadPendingApproval, openStream],
  )

  const finishRun = useCallback(
    async (
      runId: string,
      status: Run['status'],
      result?: string | null,
      error?: string | null,
      usage?: Record<string, any> | null,
    ) => {
      const stream = streamRef.current
      if (stream.terminated) return
      if (stream.runId && runId && stream.runId !== runId) return

      stream.terminated = true
      if (stream.timer !== null) {
        window.clearTimeout(stream.timer)
        stream.timer = null
      }
      if (stream.es) {
        stream.es.close()
        stream.es = null
      }
      stream.runId = null
      setConnection('idle')

      setRun((previous) =>
        previous && previous.id === runId
          ? {
              ...previous,
              status,
              completed_at: new Date().toISOString(),
              result_summary: result ?? previous.result_summary,
              error: error ?? null,
            }
          : previous,
      )
      setLive((previous) => ({
        ...previous,
        phase: status === 'failed' ? 'error' : 'done',
        error: error ?? null,
        statusText: null,
        usage,
      } as LiveState))
      // Terminal runs expire their approvals server-side; drop any card that
      // was still on screen (e.g. a run stopped while waiting for consent).
      setApproval(null)
      setApprovalError(null)

      const conversationIdToUse = stream.conversationId
      if (!conversationIdToUse) return

      const token = ++finishTokenRef.current
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await delay(attempt === 0 ? 120 : 250)
        if (!mountedRef.current || finishTokenRef.current !== token) return
        try {
          const [messageData, activeRun] = await Promise.all([
            api.listMessages(conversationIdToUse, { page_size: 200 }),
            api.getActiveRun(conversationIdToUse),
          ])
          if (!mountedRef.current || finishTokenRef.current !== token) return

          if (activeRun && activeRun.id !== runId) {
            setMessages(messageData.items as Message[])
            setLive(emptyLive())
            attachRun(activeRun as Run)
            void refreshQueue(conversationIdToUse)
            return
          }
          if (!activeRun) {
            setMessages(messageData.items as Message[])
            setLive(emptyLive())
            void refreshQueue(conversationIdToUse)
            return
          }
          // Retry briefly in case another connection is still seeing the
          // previous status while the terminal commit propagates.
        } catch {
          // Retry until the fallback below.
        }
      }

      if (!mountedRef.current || finishTokenRef.current !== token) return
      try {
        const messageData = await api.listMessages(conversationIdToUse, { page_size: 200 })
        if (mountedRef.current && finishTokenRef.current === token) {
          setMessages(messageData.items as Message[])
          setLive(emptyLive())
        }
      } catch {
        // Keep the live text if the reload fails.
      }
    },
    [attachRun, refreshQueue],
  )

  const handleEvent = (event: RunEvent) => {
    const data = (event.data || {}) as Record<string, any>
    const eventRunId = event.run_id || streamRef.current.runId

    switch (event.type) {
      case 'run_queued': {
        const position = Number(data.position) || 0
        setRun((previous) =>
          previous ? { ...previous, status: 'queued', queue_position: position } : previous,
        )
        setLive((previous) => ({
          ...previous,
          phase: 'queued',
          statusText: position > 0 ? `Na fila (${position}º)` : 'Na fila',
        }))
        break
      }

      case 'run_started':
        setRun((previous) => (previous ? { ...previous, status: 'running' } : previous))
        setLive((previous) => ({
          ...previous,
          phase: 'streaming',
          statusText: 'Conectando ao agente…',
          startedAt: previous.startedAt ?? Date.now(),
        }))
        break

      case 'session_started':
        setLive((previous) => ({ ...previous, statusText: 'Sessão iniciada' }))
        break

      case 'message_start':
        setLive((previous) => ({ ...previous, phase: 'streaming', statusText: null }))
        break

      case 'token': {
        const delta = typeof data.delta === 'string' ? data.delta : ''
        if (!delta) break
        setLive((previous) => ({
          ...previous,
          text: previous.text + delta,
          phase: 'streaming',
          statusText: null,
          error: null,
        }))
        break
      }

      case 'reasoning': {
        const delta = typeof data.delta === 'string' ? data.delta : ''
        if (!delta) break
        setLive((previous) => ({ ...previous, reasoning: previous.reasoning + delta }))
        break
      }

      case 'status':
        if (typeof data.text === 'string' && data.text) {
          setLive((previous) => ({ ...previous, statusText: data.text }))
        }
        break

      case 'session_info':
        if (typeof data.model === 'string') {
          setLive((previous) => ({ ...previous, model: data.model }))
        }
        break

      case 'title': {
        const title = typeof data.title === 'string' ? data.title : ''
        if (!title) break
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === (data.conversation_id || streamRef.current.conversationId)
              ? { ...conversation, title }
              : conversation,
          ),
        )
        setCurrentConversation((previous) => (previous ? { ...previous, title } : previous))
        break
      }

      case 'tool_call':
        setLive((previous) => ({
          ...previous,
          statusText: `Executando ${String(data.tool || 'ferramenta')}…`,
          tools: upsertTool(previous.tools, data),
        }))
        break

      case 'tool_result':
        setLive((previous) => ({
          ...previous,
          statusText: null,
          tools: completeTool(previous.tools, data),
        }))
        break

      case 'approval_requested': {
        const card = approvalFromEvent(data)
        if (!card.approval_id) break
        setApproval(card)
        setApprovalError(null)
        setRun((previous) => (previous ? { ...previous, status: 'waiting_approval' } : previous))
        setLive((previous) => ({
          ...previous,
          phase: 'waiting_approval',
          statusText: 'Aguardando sua aprovação',
        }))
        pinnedRef.current = true
        window.setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        }, 60)
        break
      }

      case 'approval_resolved':
        setApproval((previous) =>
          !data.approval_id || previous?.approval_id === data.approval_id ? null : previous,
        )
        setRun((previous) => (previous ? { ...previous, status: 'running' } : previous))
        setLive((previous) => ({
          ...previous,
          phase: 'streaming',
          statusText: 'Aprovação enviada',
        }))
        break

      case 'approval_cancelled':
        setApproval(null)
        setRun((previous) => (previous ? { ...previous, status: 'running' } : previous))
        setLive((previous) => ({ ...previous, statusText: 'Aprovação cancelada' }))
        break

      case 'run_stopping':
        setLive((previous) => ({
          ...previous,
          phase: 'stopping',
          statusText: typeof data.reason === 'string' ? data.reason : 'Interrompendo…',
        }))
        break

      case 'run_completed':
        void finishRun(
          eventRunId || '',
          'completed',
          typeof data.result === 'string' ? data.result : null,
          null,
          data.usage,
        )
        break

      case 'run_failed':
        void finishRun(
          eventRunId || '',
          'failed',
          typeof data.result === 'string' ? data.result : null,
          typeof data.error === 'string' ? data.error : 'A execução falhou.',
        )
        break

      case 'run_cancelled':
        void finishRun(
          eventRunId || '',
          'cancelled',
          typeof data.result === 'string' ? data.result : null,
          typeof data.reason === 'string' ? data.reason : null,
        )
        break

      case 'run_snapshot': {
        const snapshotStatus = String(data.status || '') as Run['status']
        if (!data.active || TERMINAL_STATUSES.includes(snapshotStatus)) {
          void finishRun(
            eventRunId || '',
            TERMINAL_STATUSES.includes(snapshotStatus) ? snapshotStatus : 'failed',
            typeof data.result_summary === 'string' ? data.result_summary : null,
            typeof data.error === 'string' ? data.error : null,
          )
        }
        break
      }

      case 'error':
        if (typeof data.error === 'string') {
          setLive((previous) => ({ ...previous, error: data.error, statusText: null }))
        }
        break
    }
  }

  useEffect(() => {
    handleEventRef.current = handleEvent
  })

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.listConversations({ page_size: 100 })
      if (!mountedRef.current) return
      setConversations(data.items as Conversation[])
    } catch (error: any) {
      if (!mountedRef.current) return
      setNotice(error?.response?.data?.detail || 'Erro ao carregar conversas.')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setConversationsLoaded(true)
      }
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  const resetConversationState = useCallback(() => {
    ++finishTokenRef.current
    closeStream()
    setCurrentConversation(null)
    currentConversationRef.current = null
    setMessages([])
    setRun(null)
    runRef.current = null
    setLive(emptyLive())
    setApproval(null)
    setApprovalError(null)
    setQueuedRuns([])
    setNotice(null)
    setElapsed(0)
  }, [closeStream])

  const openConversation = useCallback(
    async (conversationIdToOpen: string) => {
      resetConversationState()
      try {
        let conversation = conversationsRef.current.find((item) => item.id === conversationIdToOpen)
        if (!conversation) {
          conversation = (await api.getConversation(conversationIdToOpen)) as Conversation
          setConversations((previous) =>
            previous.some((item) => item.id === conversation!.id)
              ? previous
              : [conversation!, ...previous],
          )
        }
        if (!mountedRef.current) return
        setCurrentConversation(conversation)
        currentConversationRef.current = conversation

        const [messageData, activeRun, queued] = await Promise.all([
          api.listMessages(conversationIdToOpen, { page_size: 200 }),
          api.getActiveRun(conversationIdToOpen),
          api.listRuns({ conversation_id: conversationIdToOpen, status: 'queued', page_size: 50 }),
        ])
        if (!mountedRef.current) return

        setMessages(messageData.items as Message[])
        setQueuedRuns([...(queued as Run[])].reverse())
        if (activeRun) {
          attachRun(activeRun as Run)
        } else {
          setRun(null)
          setLive(emptyLive())
          const items = messageData.items as Message[]
          const last = items[items.length - 1]
          if (last?.role === 'assistant' && !last.content.trim()) {
            // A run may have finished between the two requests; give the
            // terminal commit a beat and refresh once.
            window.setTimeout(async () => {
              if (!mountedRef.current || loadedConversationRef.current !== conversationIdToOpen) return
              try {
                const retry = await api.listMessages(conversationIdToOpen, { page_size: 200 })
                if (mountedRef.current && loadedConversationRef.current === conversationIdToOpen) {
                  setMessages(retry.items as Message[])
                }
              } catch {
                // Ignore; the empty placeholder stays hidden.
              }
            }, 600)
          }
        }
      } catch (error: any) {
        if (!mountedRef.current) return
        if (error?.response?.status === 404) {
          setNotice('Conversa não encontrada.')
          navigate('/chat', { replace: true })
          return
        }
        setNotice(error?.response?.data?.detail || 'Erro ao carregar a conversa.')
      }
    },
    [attachRun, navigate, resetConversationState],
  )

  useEffect(() => {
    if (!conversationsLoaded) return
    if (!conversationId) {
      if (loadedConversationRef.current !== null) {
        loadedConversationRef.current = null
        resetConversationState()
      }
      return
    }
    if (loadedConversationRef.current === conversationId) return
    loadedConversationRef.current = conversationId
    void openConversation(conversationId)
  }, [conversationId, conversationsLoaded, openConversation, resetConversationState])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      closeStream()
    }
  }, [closeStream])

  // Keep the elapsed timer live without causing a render per token.
  useEffect(() => {
    if (!runActive || !live.startedAt) {
      setElapsed(0)
      return
    }
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - live.startedAt!) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [runActive, live.startedAt])

  // Auto-scroll only while the user is pinned to the bottom.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (pinnedRef.current) {
      container.scrollTop = container.scrollHeight
      setShowJump(false)
    } else if (runActive) {
      setShowJump(true)
    }
  }, [messages, live, approval, runActive])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`
  }, [inputValue])

  const handleScroll = () => {
    const container = scrollRef.current
    if (!container) return
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    pinnedRef.current = distance < 120
    if (pinnedRef.current) setShowJump(false)
  }

  const selectConversation = (id: string) => {
    if (id === currentConversation?.id) return
    ++finishTokenRef.current
    closeStream()
    const conversation = conversations.find((item) => item.id === id) || null
    setCurrentConversation(conversation)
    currentConversationRef.current = conversation
    setMessages([])
    setRun(null)
    setLive(emptyLive())
    setApproval(null)
    setQueuedRuns([])
    navigate(`/chat/${id}`)
  }

  const handleNewChat = () => {
    loadedConversationRef.current = null
    resetConversationState()
    setInputValue('')
    navigate('/chat')
  }

  const sendMessage = async (content: string) => {
    const text = content.trim()
    if (!text || sending) return

    setSending(true)
    setNotice(null)
    setApprovalError(null)

    let conversation = currentConversationRef.current
    const wasActive = Boolean(runRef.current && isActiveStatus(runRef.current.status))
    const tempId = `temp_${Date.now()}_${Math.random().toString(16).slice(2)}`

    try {
      if (!conversation) {
        const created = (await api.createConversation({})) as Conversation
        conversation = { ...created, message_count: 0 }
        setConversations((previous) => [conversation!, ...previous])
        setCurrentConversation(conversation)
        currentConversationRef.current = conversation
        loadedConversationRef.current = conversation.id
        navigate(`/chat/${conversation.id}`, { replace: true })
      }

      setMessages((previous) => [
        ...previous,
        {
          id: tempId,
          conversation_id: conversation!.id,
          role: 'user',
          content: text,
          created_at: new Date().toISOString(),
          run_id: null,
          tool_calls: undefined,
          tool_results: undefined,
        } as Message,
      ])
      setInputValue('')
      pinnedRef.current = true

      if (!conversation.title) {
        const title = text.slice(0, 80)
        conversation = { ...conversation, title }
        setCurrentConversation(conversation)
        currentConversationRef.current = conversation
        setConversations((previous) =>
          previous.map((item) => (item.id === conversation!.id ? { ...item, title } : item)),
        )
      }

      const newRun = (await api.createRun(conversation.id, { message: text })) as Run

      if (wasActive) {
        setQueuedRuns((previous) =>
          previous.some((item) => item.id === newRun.id) ? previous : [...previous, newRun],
        )
        setNotice(
          newRun.queue_position
            ? `Mensagem na fila (${newRun.queue_position}º). O agente responde em seguida.`
            : 'Mensagem na fila. O agente responde em seguida.',
        )
      } else {
        attachRun(newRun)
      }

      const messageData = await api.listMessages(conversation.id, { page_size: 200 })
      if (mountedRef.current) setMessages(messageData.items as Message[])
    } catch (error: any) {
      if (mountedRef.current) {
        setMessages((previous) => previous.filter((message) => message.id !== tempId))
        setNotice(error?.response?.data?.detail || 'Erro ao enviar a mensagem. Tente novamente.')
      }
    } finally {
      if (mountedRef.current) setSending(false)
    }
  }

  const stopRun = async () => {
    if (!run || !isActiveStatus(run.status)) return
    setLive((previous) => ({ ...previous, phase: 'stopping', statusText: 'Interrompendo o agente…' }))
    try {
      await api.stopRun(run.id)
    } catch (error: any) {
      setNotice(error?.response?.data?.detail || 'Não foi possível interromper a execução.')
      setLive((previous) => ({ ...previous, phase: 'streaming', statusText: null }))
    }
  }

  const resolveApproval = async (choice: string) => {
    if (!approval || approvalBusy) return
    setApprovalBusy(true)
    setApprovalError(null)
    try {
      if (choice === 'deny') {
        await api.deny(approval.approval_id, choice)
      } else {
        await api.approve(approval.approval_id, choice)
      }
      setApproval(null)
      setRun((previous) => (previous ? { ...previous, status: 'running' } : previous))
      setLive((previous) => ({ ...previous, phase: 'streaming', statusText: 'Aprovação enviada' }))
    } catch (error: any) {
      setApprovalError(error?.response?.data?.detail || 'Falha ao enviar a decisão ao Hermes.')
    } finally {
      if (mountedRef.current) setApprovalBusy(false)
    }
  }

  const lastUserMessage = (() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === 'user') return messages[index].content
    }
    return null
  })()

  const retryLast = () => {
    if (lastUserMessage) void sendMessage(lastUserMessage)
  }

  if (loading) return <LoadingScreen />

  const placeholder =
    runActive
      ? 'Enviar outra mensagem — ela entra na fila do agente…'
      : 'Pergunte algo, peça uma tarefa ou descreva um problema…'

  return (
    <div className="h-full min-h-0 flex gap-6">
      {/* Conversation history — desktop */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col min-h-0 border-r border-odin-graphite-800 pr-4">
        <div className="flex items-center justify-between pb-4">
          <h2 className="text-nav-label text-odin-graphite-400">Conversas</h2>
          <button
            type="button"
            onClick={handleNewChat}
            className="btn-ghost p-2 -mr-2"
            aria-label="Nova conversa"
            title="Nova conversa"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
          {conversations.length === 0 && (
            <p className="text-caption text-odin-graphite-500 px-3 py-4">
              Nenhuma conversa ainda. Envie a primeira mensagem.
            </p>
          )}
          {conversations.map((conversation) => {
            const selected = currentConversation?.id === conversation.id
            const streamingHere = selected && runActive
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                  selected
                    ? 'bg-odin-graphite-900 text-white'
                    : 'text-odin-graphite-300 hover:bg-odin-graphite-900/60 hover:text-white',
                )}
                aria-current={selected ? 'page' : undefined}
              >
                <div className="flex items-center gap-2">
                  {streamingHere && <span className="status-dot-running flex-shrink-0" />}
                  <span className="truncate text-sm font-medium">
                    {conversation.title || 'Nova conversa'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-caption text-odin-graphite-500">
                  <span>{formatRelativeTime(conversation.updated_at)}</span>
                  {conversation.message_count > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{conversation.message_count} msg</span>
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="pt-4 text-caption text-odin-graphite-600">
          Hermes · streaming de tokens, ferramentas e aprovações em tempo real
        </p>
      </aside>

      {/* Chat column */}
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        <header className="flex items-center justify-between gap-3 pb-4 border-b border-odin-graphite-800">
          <div className="min-w-0">
            <h1 className="text-heading-2xs text-white truncate">
              {currentConversation?.title || 'Nova conversa'}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-caption text-odin-graphite-400">
              <span className={connectionDotClass(connection, runActive)} aria-hidden="true" />
              <span className="truncate">{statusLabel(run, live, connection)}</span>
              {live.model && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate text-odin-graphite-500">{live.model}</span>
                </>
              )}
              {runActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-odin-graphite-500">
                    <Clock className="w-3 h-3" />
                    {formatElapsed(elapsed)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {queuedRuns.length > 0 && (
              <span className="badge-accent" title="Mensagens aguardando o turno atual">
                Fila: {queuedRuns.length}
              </span>
            )}
            <button
              type="button"
              onClick={handleNewChat}
              className="btn-ghost lg:hidden"
              aria-label="Nova conversa"
            >
              <Plus className="w-4 h-4" />
              <span>Nova</span>
            </button>
          </div>
        </header>

        {/* Conversation picker — mobile */}
        <div className="lg:hidden py-3">
          <select
            value={currentConversation?.id || ''}
            onChange={(event) => event.target.value && selectConversation(event.target.value)}
            className="input input-sm"
            aria-label="Selecionar conversa"
          >
            <option value="">Selecione uma conversa</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title || `Conversa ${formatRelativeTime(conversation.created_at)}`}
              </option>
            ))}
          </select>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto py-6 space-y-6"
        >
          {messages.length === 0 && !currentConversation && (
            <div className="empty-state">
              <Bot className="empty-state-icon" />
              <h3 className="empty-state-title">Bem-vindo ao ODIN V2</h3>
              <p className="empty-state-description">
                Converse com o Hermes em tempo real. Ferramentas e aprovações aparecem aqui, no
                fluxo da conversa.
              </p>
            </div>
          )}

          {messages.length === 0 && currentConversation && !runActive && (
            <div className="empty-state">
              <Bot className="w-12 h-12 text-odin-graphite-600 mb-3" />
              <p className="text-body-sm text-odin-graphite-400">
                Nenhuma mensagem ainda. Envie a primeira.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const assistantOfLiveRun =
              message.role === 'assistant' && run?.id === message.run_id && runActive
            if (assistantOfLiveRun) {
              return (
                <LiveAssistant
                  key={message.id}
                  live={live}
                  approval={approval}
                  approvalBusy={approvalBusy}
                  approvalError={approvalError}
                  onResolve={resolveApproval}
                  onRetry={retryLast}
                  canRetry={Boolean(lastUserMessage) && !sending}
                  elapsed={elapsed}
                />
              )
            }

            const isPendingAssistant =
              message.role === 'assistant' &&
              !message.content.trim() &&
              (message.tool_calls?.length ?? 0) === 0
            if (isPendingAssistant) {
              if (message.run_id && queuedIds.has(message.run_id)) {
                const position = queuedRuns.findIndex((item) => item.id === message.run_id) + 1
                return <QueuedBubble key={message.id} position={position || undefined} />
              }
              return null
            }

            return <MessageBubble key={message.id} message={message} />
          })}

          {live.runId &&
            runActive &&
            !messages.some(
              (message) => message.role === 'assistant' && message.run_id === live.runId,
            ) && (
              <LiveAssistant
                live={live}
                approval={approval}
                approvalBusy={approvalBusy}
                approvalError={approvalError}
                onResolve={resolveApproval}
                onRetry={retryLast}
                canRetry={Boolean(lastUserMessage) && !sending}
                elapsed={elapsed}
              />
            )}

          <div className="h-1" />
        </div>

        {showJump && (
          <div className="flex justify-center -mt-4 mb-2">
            <button
              type="button"
              onClick={() => {
                pinnedRef.current = true
                scrollRef.current?.scrollTo({
                  top: scrollRef.current.scrollHeight,
                  behavior: 'smooth',
                })
                setShowJump(false)
              }}
              className="badge-neutral hover:bg-odin-graphite-700 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Ir para o fim
            </button>
          </div>
        )}

        {!runActive && !live.error && run?.status === 'failed' && run.error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-odin-crimson-500/30 bg-odin-crimson-500/10 px-3 py-2 text-sm text-odin-crimson-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p>{run.error}</p>
              {lastUserMessage && !sending && (
                <button
                  type="button"
                  onClick={retryLast}
                  className="mt-1 inline-flex items-center gap-1.5 text-caption font-medium text-odin-crimson-200 hover:text-white"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reenviar a última mensagem
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setRun(null)}
              className="text-odin-crimson-400 hover:text-white"
              aria-label="Fechar erro"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-odin-crimson-500/30 bg-odin-crimson-500/10 px-3 py-2 text-sm text-odin-crimson-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-odin-crimson-400 hover:text-white"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="border-t border-odin-graphite-800 pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage(inputValue)
            }}
            className="flex items-end gap-3"
          >
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={placeholder}
              className="input flex-1 min-h-[48px] max-h-48 resize-none py-3"
              rows={1}
              disabled={sending}
              aria-label="Mensagem para o Hermes"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendMessage(inputValue)
                }
              }}
            />

            {runActive && (
              <button
                type="button"
                onClick={() => void stopRun()}
                className="btn-danger h-12 w-12 p-0 flex-shrink-0"
                disabled={live.phase === 'stopping'}
                aria-label="Parar execução"
                title="Parar execução"
              >
                <Square className="w-4 h-4" />
              </button>
            )}

            <button
              type="submit"
              className="btn-primary h-12 w-12 p-0 flex-shrink-0"
              disabled={!inputValue.trim() || sending}
              aria-label="Enviar mensagem"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-caption text-odin-graphite-600">
            <span>
              Enter envia · Shift+Enter quebra linha
              {runActive ? ' · você pode enfileirar novas mensagens' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              Hermes JSON-RPC
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function LiveAssistant({
  live,
  approval,
  approvalBusy,
  approvalError,
  onResolve,
  onRetry,
  canRetry,
  elapsed,
}: {
  live: LiveState
  approval: ApprovalCard | null
  approvalBusy: boolean
  approvalError: string | null
  onResolve: (choice: string) => void
  onRetry: () => void
  canRetry: boolean
  elapsed: number
}) {
  const waiting = live.phase === 'connecting' || (live.phase === 'streaming' && !live.text && live.tools.length === 0)
  const active = live.phase !== 'done' && live.phase !== 'error'

  return (
    <div className="flex gap-3 justify-start animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-odin-violet-500 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-5 h-5 text-white" />
      </div>

      <div className="min-w-0 max-w-[85%] flex-1 space-y-3">
        {live.tools.length > 0 && (
          <div className="space-y-2">
            {live.tools.map((tool) => (
              <ToolCard key={tool.call_id} tool={tool} />
            ))}
          </div>
        )}

        {live.reasoning && (
          <details className="group rounded-xl border border-odin-graphite-800/70 bg-odin-graphite-950/40 px-3 py-2">
            <summary className="cursor-pointer select-none text-caption text-odin-graphite-500 hover:text-odin-graphite-300">
              Raciocínio do agente
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-caption leading-relaxed text-odin-graphite-400">
              {live.reasoning}
            </div>
          </details>
        )}

        {(live.text || waiting) && (
          <div className="rounded-2xl rounded-bl-md bg-odin-graphite-950 px-4 py-3 text-white">
            {waiting ? (
              <div className="flex items-center gap-3 text-odin-graphite-400">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-odin-violet-500 animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-odin-violet-500 animate-bounce"
                    style={{ animationDelay: '120ms' }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-odin-violet-500 animate-bounce"
                    style={{ animationDelay: '240ms' }}
                  />
                </span>
                <span className="text-sm">{live.statusText || 'Pensando…'}</span>
                {elapsed > 0 && <span className="text-caption text-odin-graphite-500">{formatElapsed(elapsed)}</span>}
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words text-body">
                {live.text}
                {active && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-odin-violet-400" />
                )}
              </div>
            )}
          </div>
        )}

        {!live.text && !waiting && live.statusText && active && (
          <p className="text-caption text-odin-graphite-500">{live.statusText}</p>
        )}

        {live.error && (
          <div className="rounded-xl border border-odin-crimson-500/30 bg-odin-crimson-500/10 px-3 py-2 text-sm text-odin-crimson-300">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{live.error}</span>
            </div>
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 text-caption font-medium text-odin-crimson-200 hover:text-white"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reenviar a última mensagem
              </button>
            )}
          </div>
        )}

        {approval && (
          <ApprovalCardView
            approval={approval}
            busy={approvalBusy}
            error={approvalError}
            onResolve={onResolve}
          />
        )}
      </div>
    </div>
  )
}

function ApprovalCardView({
  approval,
  busy,
  error,
  onResolve,
}: {
  approval: ApprovalCard
  busy: boolean
  error: string | null
  onResolve: (choice: string) => void
}) {
  return (
    <div className="rounded-2xl border border-odin-amber-500/40 bg-odin-amber-500/10 p-4 animate-slide-up">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-odin-amber-400" />
        <span className="text-sm font-semibold text-odin-amber-200">Aprovação necessária</span>
        <span className="badge-accent ml-auto">{approval.operation}</span>
      </div>

      {approval.description && (
        <p className="mt-2 text-sm text-odin-graphite-200">{approval.description}</p>
      )}

      {approval.command && (
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-odin-black/60 p-3 font-mono text-code-sm text-odin-graphite-200">
          {approval.command}
        </pre>
      )}

      {error && <p className="mt-2 text-sm text-odin-crimson-300">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {approval.choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onResolve(choice)}
            disabled={busy}
            className={cn(
              choice === 'deny' ? 'btn-danger btn-sm' : 'btn-primary btn-sm',
              busy && 'opacity-60',
            )}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : choice === 'deny' ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            {choiceLabel(choice)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolActivity }) {
  const [open, setOpen] = useState(false)
  const hasDetails = Boolean(tool.args) || Boolean(tool.result)
  const duration = typeof tool.duration_s === 'number' ? `${tool.duration_s.toFixed(1)}s` : null

  return (
    <div
      className={cn(
        'rounded-xl border bg-odin-graphite-950/70 overflow-hidden',
        tool.is_error ? 'border-odin-crimson-500/40' : 'border-odin-graphite-800',
      )}
    >
      <button
        type="button"
        onClick={() => hasDetails && setOpen((value) => !value)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left',
          hasDetails && 'hover:bg-odin-graphite-900/60 transition-colors',
        )}
        aria-expanded={hasDetails ? open : undefined}
      >
        {tool.status === 'running' ? (
          <Loader2 className="w-3.5 h-3.5 text-odin-violet-400 animate-spin flex-shrink-0" />
        ) : tool.is_error ? (
          <X className="w-3.5 h-3.5 text-odin-crimson-400 flex-shrink-0" />
        ) : (
          <Check className="w-3.5 h-3.5 text-odin-emerald-400 flex-shrink-0" />
        )}
        <Terminal className="w-3.5 h-3.5 text-odin-graphite-500 flex-shrink-0" />
        <span className="font-mono text-code-sm text-odin-graphite-200 truncate">{tool.tool}</span>
        {tool.context && (
          <span className="hidden sm:block truncate text-caption text-odin-graphite-500">{tool.context}</span>
        )}
        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          {duration && <span className="text-caption text-odin-graphite-500">{duration}</span>}
          {hasDetails && (open ? <ChevronUp className="w-3.5 h-3.5 text-odin-graphite-500" /> : <ChevronDown className="w-3.5 h-3.5 text-odin-graphite-500" />)}
        </span>
      </button>

      {open && hasDetails && (
        <div className="border-t border-odin-graphite-800/80 px-3 py-2 space-y-2">
          {tool.args !== undefined && tool.args !== null && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-odin-black/60 p-2 font-mono text-caption text-odin-graphite-300">
              {clampText(tool.args, 2000)}
            </pre>
          )}
          {tool.result && (
            <pre
              className={cn(
                'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-odin-black/60 p-2 font-mono text-caption',
                tool.is_error ? 'text-odin-crimson-300' : 'text-odin-graphite-300',
              )}
            >
              {clampText(tool.result)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function QueuedBubble({ position }: { position?: number }) {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="flex items-center gap-2 rounded-full border border-odin-graphite-800 bg-odin-graphite-950/60 px-3 py-1.5 text-caption text-odin-graphite-400">
        <Clock className="w-3.5 h-3.5 text-odin-amber-400" />
        {position ? `Aguardando na fila · ${position}º` : 'Aguardando na fila'}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const tools = mergePersistedTools(message.tool_calls, message.tool_results)

  if (message.role === 'tool') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border border-odin-graphite-800 bg-odin-graphite-950 px-4 py-3">
          <div className="flex items-center gap-2 mb-2 text-caption text-odin-graphite-400">
            <Terminal className="w-3.5 h-3.5 text-odin-violet-400" />
            Ferramenta
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-code-sm text-odin-graphite-300">
            {message.content}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3 animate-fade-in', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-odin-violet-500 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}

      <div className={cn('min-w-0 max-w-[85%] space-y-2', isUser && 'flex flex-col items-end')}>
        {!isUser && tools.length > 0 && (
          <div className="w-full space-y-2">
            {tools.map((tool) => (
              <ToolCard key={tool.call_id} tool={tool} />
            ))}
          </div>
        )}

        {message.content && (
          <div
            className={cn(
              'rounded-2xl px-4 py-3 text-body whitespace-pre-wrap break-words',
              isUser
                ? 'bg-odin-violet-500 text-white rounded-br-md'
                : 'bg-odin-graphite-950 text-white rounded-bl-md',
            )}
          >
            {message.content}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-odin-graphite-800 flex items-center justify-center flex-shrink-0 mt-1">
          <User className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  )
}
