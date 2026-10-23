import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type Conversation, type Message, type Run } from '../lib/api'
import { cn, formatRelativeTime, truncate } from '../lib/utils'
import { LoadingScreen } from '../components/LoadingScreen'
import {
  Send,
  Bot,
  User,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  Terminal,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function ChatPage() {
  const { conversationId: _conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const { user: _user } = useAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [_error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const assistantMessageRef = useRef<string>('')

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation.id)
    }
  }, [currentConversation])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, run?.status])

  const loadConversations = async () => {
    try {
      const data = await api.listConversations({ page_size: 50 })
      setConversations(data.items)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar conversas')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const data = await api.listMessages(conversationId, { page_size: 100 })
      setMessages(data.items)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar mensagens')
    }
  }

  const createConversation = async (initialMessage?: string) => {
    const conv = await api.createConversation({ title: undefined, initial_message: initialMessage })
    setConversations((prev) => [conv, ...prev])
    return conv
  }

  const selectConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      setCurrentConversation(conv)
      navigate(`/chat/${id}`, { replace: true })
    }
  }

  const sendMessage = async (content: string) => {
    if (!content.trim() || sending) return

    let targetConversation = currentConversation

    // Create new conversation if none selected
    if (!targetConversation) {
      targetConversation = await createConversation(content)
      setCurrentConversation(targetConversation)
    }

    if (!targetConversation) return

    setSending(true)
    setError(null)

    try {
      // Add user message optimistically
      const optimisticMessage: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: targetConversation.id,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
        run_id: null,
        tool_calls: undefined,
        tool_results: undefined,
      }
      setMessages((prev) => [...prev, optimisticMessage])

      // Start run with streaming
      const runData = await api.createRun(targetConversation.id, { message: content, stream: true })
      setRun(runData)

      // Connect to SSE
      connectEventSource(runData.id)

    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao enviar mensagem')
      setSending(false)
    }
  }

  const connectEventSource = (runId: string) => {
    const token = api.getToken()
    if (!token) return

    // EventSource doesn't support headers, so we use query param
    const url = `${import.meta.env.VITE_API_URL || '/api'}/runs/${runId}/events?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        handleRunEvent(event.type, data)
      } catch {
        // Ignore parse errors
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
      setSending(false)
    }

    eventSourceRef.current = es
  }

  const handleRunEvent = (eventType: string, data: any) => {
    switch (eventType) {
      case 'token':
        assistantMessageRef.current += data.delta
        updateLastAssistantMessage(assistantMessageRef.current)
        break

      case 'tool_call':
        addToolCallMessage(data)
        break

      case 'tool_result':
        updateToolResultMessage(data.call_id, data)
        break

      case 'approval_requested':
        setRun((prev) => prev ? { ...prev, status: 'waiting_approval' } : null)
        break

      case 'run_completed':
        finalizeRun('completed', data.result)
        break

      case 'run_failed':
        finalizeRun('failed', null, data.error)
        break

      case 'run_cancelled':
        finalizeRun('cancelled')
        break
    }
  }

  const updateLastAssistantMessage = (content: string) => {
    setMessages((prev) => {
      // findLastIndex polyfill for older TS targets
      let lastIdx = -1
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'assistant' && prev[i].id.startsWith('temp_')) {
          lastIdx = i
          break
        }
      }
      if (lastIdx >= 0) {
        const newMessages = [...prev]
        newMessages[lastIdx] = { ...newMessages[lastIdx], content }
        return newMessages
      }
      // Create new assistant message
      return [...prev, {
        id: `temp_assistant_${Date.now()}`,
        conversation_id: currentConversation!.id,
        role: 'assistant' as const,
        content,
        created_at: new Date().toISOString(),
        run_id: run?.id ?? null,
        tool_calls: undefined,
        tool_results: undefined,
      }]
    })
  }

  const addToolCallMessage = (data: any) => {
    const toolMsg: Message = {
      id: `temp_tool_${data.call_id}`,
      conversation_id: currentConversation!.id,
      role: 'tool',
      content: `\`${data.tool}\`(${JSON.stringify(data.args)})`,
      created_at: new Date().toISOString(),
      run_id: run?.id ?? null,
      tool_calls: undefined,
      tool_results: undefined,
    }
    setMessages((prev) => [...prev, toolMsg])
  }

  const updateToolResultMessage = (callId: string, data: any) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id === `temp_tool_${callId}`) {
        return {
          ...m,
          content: m.content + `\n→ ${data.is_error ? '❌ ' : ''}${truncate(String(data.result), 200)}`,
        }
      }
      return m
    }))
  }

  const finalizeRun = (status: Run['status'], result?: string | null, error?: string | null) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setRun((prev) => prev ? { ...prev, status, completed_at: new Date().toISOString(), result_summary: result ?? null, error: error ?? null } : null)
    setSending(false)
    assistantMessageRef.current = ''

    // Reload messages to get persisted versions
    if (currentConversation) {
      loadMessages(currentConversation.id)
    }
  }

  const stopRun = async () => {
    if (!run) return
    try {
      await api.stopRun(run.id)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      setRun((prev) => prev ? { ...prev, status: 'cancelled' } : null)
      setSending(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao parar execução')
    }
  }

  const handleNewChat = () => {
    setCurrentConversation(null)
    setMessages([])
    setRun(null)
    navigate('/chat', { replace: true })
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleNewChat}
            className="btn-secondary"
            aria-label="Nova conversa"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Nova conversa</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {run && run.status === 'running' && (
            <span className="flex items-center gap-2 text-sm text-odin-orange-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Executando...
            </span>
          )}
          {run && run.status === 'waiting_approval' && (
            <span className="flex items-center gap-2 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4" />
              Aguardando aprovação
            </span>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Conversation list (mobile drawer or sidebar) */}
        <div className="lg:hidden mb-4">
          <select
            value={currentConversation?.id || ''}
            onChange={(e) => e.target.value && selectConversation(e.target.value)}
            className="input w-full"
          >
            <option value="">Selecione uma conversa</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || `Conversa ${formatRelativeTime(c.created_at)}`}
              </option>
            ))}
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && !currentConversation && (
            <div className="flex-1 flex flex-col items-center justify-center text-odin-graphite-500">
              <Bot className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Bem-vindo ao ODIN V2</h3>
              <p className="text-sm text-center max-w-xs">
                Selecione uma conversa ao lado ou inicie uma nova para começar.
              </p>
            </div>
          )}

          {messages.length === 0 && currentConversation && (
            <div className="flex-1 flex flex-col items-center justify-center text-odin-graphite-500">
              <Bot className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">Nenhuma mensagem ainda. Envie a primeira!</p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 max-w-[80%]">
                <div className="w-8 h-8 rounded-full bg-odin-orange-500 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="bg-odin-graphite-800 rounded-2xl px-4 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-odin-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-odin-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-odin-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-odin-graphite-800 pt-4">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(inputValue); setInputValue(''); }} className="flex gap-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="input flex-1 min-h-[48px] max-h-48 resize-none"
              rows={1}
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(inputValue)
                  setInputValue('')
                }
              }}
            />
            <button
              type="submit"
              className="btn-primary self-end mb-1 disabled:opacity-50"
              disabled={!inputValue.trim() || sending}
              aria-label="Enviar mensagem"
            >
              <Send className="w-5 h-5" />
            </button>
            {run && run.status === 'running' && (
              <button
                type="button"
                onClick={stopRun}
                className="btn-danger self-end mb-1"
                aria-label="Parar execução"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const isTool = message.role === 'tool'
  const isError = message.tool_results?.some((r: any) => r.is_error)

  if (isTool) {
    return (
      <div className="flex justify-start">
        <div className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2 text-sm font-mono text-xs',
          isError
            ? 'bg-red-500/10 border border-red-500/20 text-red-300'
            : 'bg-odin-graphite-800 text-odin-graphite-300'
        )}>
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4" />
            <span className="font-medium">Ferramenta</span>
          </div>
          <pre className="whitespace-pre-wrap break-words">{message.content}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-odin-orange-500 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5',
        isUser
          ? 'bg-odin-orange-500 text-white rounded-br-md'
          : 'bg-odin-graphite-800 text-white rounded-bl-md'
      )}>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-odin-graphite-700 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
  )
}