import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { cn } from '../lib/utils'
import { api, type Conversation, type Message, type Run } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#181818' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#ff6b00' },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#181818', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  newChatBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  messagesContainer: { flex: 1 },
  messagesList: { padding: 16, paddingBottom: 100 },
  messageBubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginVertical: 4 },
  userBubble: { backgroundColor: '#ff6b00', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#181818', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#282828' },
  toolBubble: { backgroundColor: '#282828', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#ff6b00' },
  messageText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  toolText: { color: '#a8a8a8', fontSize: 13, fontFamily: 'monospace' },
  inputContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, paddingBottom: 20, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#181818' },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: '#181818', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: '#282828' },
  textInput: { flex: 1, color: '#fff', fontSize: 16, maxHeight: 120 },
  sendBtn: { backgroundColor: '#ff6b00', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  stopBtn: { backgroundColor: '#e05600', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { color: '#686868', fontSize: 14, textAlign: 'center' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  typingIndicator: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingVertical: 8 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff6b00' },
  runStatusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#181818', borderBottomWidth: 1, borderBottomColor: '#282828' },
  runStatusText: { color: '#ff6b00', fontSize: 13, fontWeight: '500' },
  approvalBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#ff6b00', borderBottomWidth: 1, borderBottomColor: '#282828' },
  approvalText: { color: '#fff', fontSize: 13, fontWeight: '500', flex: 1 },
  approvalBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  approvalBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
})

export default function ChatScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ conversationId?: string }>()
  const { user } = useAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [showConversationPicker, setShowConversationPicker] = useState(false)

  const messagesEndRef = useRef<View>(null)
  const flatListRef = useRef<FlatList<Message>>(null)

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (params.conversationId) {
      const conv = conversations.find(c => c.id === params.conversationId)
      if (conv) {
        selectConversation(conv)
      } else {
        loadConversation(params.conversationId)
      }
    }
  }, [params.conversationId, conversations.length])

  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages, run?.status])

  const loadConversations = async () => {
    try {
      const data = await api.listConversations({ page_size: 50 })
      setConversations(data.items)
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao carregar conversas')
    } finally {
      setLoading(false)
    }
  }

  const loadConversation = async (id: string) => {
    try {
      const conv = await api.getConversation(id)
      setCurrentConversation(conv)
      loadMessages(id)
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao carregar conversa')
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const data = await api.listMessages(conversationId, { page_size: 100 })
      setMessages(data.items)
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao carregar mensagens')
    }
  }

  const selectConversation = (conv: Conversation) => {
    setCurrentConversation(conv)
    loadMessages(conv.id)
    router.push(`/chat?conversationId=${conv.id}`)
    setShowConversationPicker(false)
  }

  const handleNewChat = () => {
    setShowConversationPicker(true)
  }

  const sendMessage = async (content: string) => {
    if (!content.trim() || sending) return

    let targetConversation = currentConversation

    if (!targetConversation) {
      try {
        targetConversation = await api.createConversation({ initial_message: content })
        setConversations(prev => [targetConversation!, ...prev])
        setCurrentConversation(targetConversation)
      } catch (err: any) {
        Alert.alert('Erro', err.response?.data?.detail || 'Erro ao criar conversa')
        return
      }
    }

    setSending(true)

    try {
      const optimisticMessage: Message = {
        id: `temp_${Date.now()}`,
        conversation_id: targetConversation.id,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
        run_id: null,
      }
      setMessages(prev => [...prev, optimisticMessage])

      const runData = await api.createRun(targetConversation.id, { message: content, stream: true })
      setRun(runData)

    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao enviar mensagem')
      setSending(false)
    }
  }

  const handleStopRun = async () => {
    if (!run) return
    try {
      await api.stopRun(run.id)
      setRun(prev => prev ? { ...prev, status: 'cancelled' } : null)
      setSending(false)
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.detail || 'Erro ao parar execução')
    }
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user'
    const isTool = item.role === 'tool'

    if (isTool) {
      return (
        <View style={[styles.messageBubble, styles.toolBubble]}>
          <Text style={styles.toolText}>{item.content}</Text>
        </View>
      )
    }

    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.messageText}>{item.content}</Text>
      </View>
    )
  }

  if (loading && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ff6b00" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ODIN V2</Text>
        <TouchableOpacity onPress={handleNewChat} style={styles.newChatBtn}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newChatBtnText}>Nova</Text>
        </TouchableOpacity>
      </View>

      {run && run.status === 'running' && (
        <View style={styles.runStatusBar}>
          <Ionicons name="refresh" size={16} color="#ff6b00" />
          <Text style={styles.runStatusText}>Executando agente...</Text>
          <TouchableOpacity onPress={handleStopRun} style={styles.stopBtn}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {run && run.status === 'waiting_approval' && (
        <View style={styles.approvalBar}>
          <Ionicons name="shield" size={16} color="#fff" />
          <Text style={styles.approvalText}>Aguardando aprovação</Text>
        </View>
      )}

      <ScrollView
        ref={flatListRef}
        style={styles.messagesContainer}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !currentConversation && (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color="#282828" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>Bem-vindo ao ODIN V2</Text>
            <Text style={styles.emptySubtitle}>
              Selecione uma conversa ou inicie uma nova para começar
            </Text>
          </View>
        )}

        {messages.length === 0 && currentConversation && (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#282828" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>Nenhuma mensagem</Text>
            <Text style={styles.emptySubtitle}>Envie a primeira mensagem para começar</Text>
          </View>
        )}

        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          ListEmptyComponent={() => null}
        />

        {sending && (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} style={{ animationDelay: '150ms' }} />
            <View style={styles.typingDot} style={{ animationDelay: '300ms' }} />
          </View>
        )}

        <View ref={messagesEndRef} />
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Digite sua mensagem..."
            multiline
            maxLength={4000}
            onSubmitEditing={() => sendMessage(inputValue)}
            disabled={sending}
          />
          {sending ? (
            <TouchableOpacity onPress={handleStopRun} style={styles.stopBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => sendMessage(inputValue)}
              style={styles.sendBtn}
              disabled={!inputValue.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {showConversationPicker && (
        <View style={StyleSheet.absoluteFill}>
          <TouchableOpacity onPress={() => setShowConversationPicker(false)} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0a0a0a', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 400 }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#282828', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>Conversas</Text>
              <TouchableOpacity onPress={() => setShowConversationPicker(false)}>
                <Ionicons name="close" size={24} color="#686868" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={conversations}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => selectConversation(item)}
                  style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#181818' }}
                >
                  <Text style={{ color: '#fff', fontSize: 16 }}>{item.title || `Conversa ${item.id.slice(0, 8)}`}</Text>
                  <Text style={{ color: '#686868', fontSize: 12, marginTop: 4 }}>{item.message_count} mensagens</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}