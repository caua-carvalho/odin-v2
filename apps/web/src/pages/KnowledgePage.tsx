import { useState, useEffect } from 'react'
import { api, type KnowledgeItem } from '../lib/api'
import { cn, formatRelativeTime, truncate } from '../lib/utils'
import { LoadingScreen } from '../components/LoadingScreen'
import {
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  FileText,
  Link,
  Scissors,
  User,
  Tag,
  Loader2,
  ChevronDown,
} from 'lucide-react'

const KNOWLEDGE_TYPES = [
  { value: 'note', label: 'Nota', icon: FileText },
  { value: 'link', label: 'Link', icon: Link },
  { value: 'snippet', label: 'Trecho', icon: Scissors },
  { value: 'personal', label: 'Pessoal', icon: User },
] as const

export function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null)
  const [formData, setFormData] = useState({
    type: 'note',
    title: '',
    content: '',
    url: '',
    tags: '' as string,
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadItems()
  }, [page, search, typeFilter, tagFilter])

  const loadItems = async () => {
    setLoading(true)
    try {
      const data = await api.listKnowledge({
        page,
        page_size: pageSize,
        q: search || undefined,
        type: typeFilter || undefined,
        tags: tagFilter || undefined,
      })
      setItems(data.items)
      setTotal(data.total)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErrors({})

    const errors: Record<string, string> = {}
    if (!formData.title.trim()) errors.title = 'Título é obrigatório'
    if (!formData.content.trim()) errors.content = 'Conteúdo é obrigatório'
    if (formData.type === 'link' && formData.url && !isValidUrl(formData.url)) {
      errors.url = 'URL inválida'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      const data = {
        type: formData.type,
        title: formData.title.trim(),
        content: formData.content.trim(),
        url: formData.type === 'link' && formData.url.trim() ? formData.url.trim() : undefined,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      }

      if (editingItem) {
        await api.updateKnowledge(editingItem.id, data)
      } else {
        await api.createKnowledge(data)
      }

      resetForm()
      loadItems()
    } catch (err: any) {
      setFormErrors({ submit: err.response?.data?.detail || 'Erro ao salvar' })
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({ type: 'note', title: '', content: '', url: '', tags: '' })
    setFormErrors({})
    setEditingItem(null)
    setShowCreate(false)
  }

  const handleEdit = (item: KnowledgeItem) => {
    setEditingItem(item)
    setFormData({
      type: item.type,
      title: item.title,
      content: item.content,
      url: item.url || '',
      tags: item.tags.join(', '),
    })
    setShowCreate(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este item?')) return
    try {
      await api.deleteKnowledge(id)
      loadItems()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao excluir')
    }
  }

  if (loading && items.length === 0) {
    return <LoadingScreen />
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
        <div>
          <h1 className="text-heading font-regular tracking-tight">Biblioteca</h1>
          <p className="text-body text-odin-graphite-400 mt-2">Notas, links, trechos e informações pessoais</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowCreate(true); }}
          className="btn-primary"
        >
          <Plus className="w-5 h-5" />
          <span>Novo item</span>
        </button>
      </div>

      {/* Filters - minimal, no card */}
      <div className="flex flex-col sm:flex-row gap-4 mb-10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-odin-graphite-500" />
          <input
            type="text"
            placeholder="Buscar por título ou conteúdo..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-3">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="input w-40"
          >
            <option value="">Todos os tipos</option>
            {KNOWLEDGE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Tags (separadas por vírgula)"
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
            className="input w-48"
          />
        </div>
      </div>

      {/* Items list - no cards, just list items */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-odin-graphite-500">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <h3 className="text-heading-xs font-regular mb-1">Nenhum item encontrado</h3>
            <p className="text-body">Crie sua primeira nota ou ajuste os filtros</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <KnowledgeItemRow
                key={item.id}
                item={item}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-center gap-2 mt-10">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost"
            >
              <ChevronDown className="w-5 h-5 rotate-180" />
            </button>
            <span className="text-odin-graphite-300 px-4">
              Página {page} de {Math.ceil(total / pageSize)}
            </span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
              disabled={page >= Math.ceil(total / pageSize)}
              className="btn-ghost"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={() => resetForm()}>
          <div className="bg-odin-graphite-950 border border-odin-graphite-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-odin-graphite-800">
              <h2 className="text-heading-xs font-regular">{editingItem ? 'Editar item' : 'Novo item'}</h2>
              <button onClick={resetForm} className="p-1 text-odin-graphite-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="label">Tipo</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="input"
                  disabled={!!editingItem}
                >
                  {KNOWLEDGE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="title" className="label">
                  Título <span className="text-odin-crimson-400">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className={cn('input', formErrors.title && 'input-error')}
                  placeholder="Título do item"
                />
                {formErrors.title && <p className="form-error">{formErrors.title}</p>}
              </div>

              <div>
                <label htmlFor="content" className="label">
                  Conteúdo <span className="text-odin-crimson-400">*</span>
                </label>
                <textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  className={cn('input min-h-[120px]', formErrors.content && 'input-error')}
                  placeholder="Conteúdo do item"
                  rows={5}
                />
                {formErrors.content && <p className="form-error">{formErrors.content}</p>}
              </div>

              {formData.type === 'link' && (
                <div>
                  <label htmlFor="url" className="label">
                    URL
                  </label>
                  <input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    className={cn('input', formErrors.url && 'input-error')}
                    placeholder="https://exemplo.com"
                  />
                  {formErrors.url && <p className="form-error">{formErrors.url}</p>}
                </div>
              )}

              <div>
                <label htmlFor="tags" className="label">
                  Tags (separadas por vírgula)
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-odin-graphite-500" />
                  <input
                    id="tags"
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                    className="input pl-10"
                    placeholder="trabalho, importante, ideia"
                  />
                </div>
              </div>

              {formErrors.submit && (
                <p className="form-error">{formErrors.submit}</p>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-odin-graphite-800">
                <button type="button" onClick={resetForm} className="btn-ghost">
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    editingItem ? 'Atualizar' : 'Criar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function KnowledgeItemRow({ item, onEdit, onDelete }: { item: KnowledgeItem; onEdit: (item: KnowledgeItem) => void; onDelete: (id: string) => void }) {
  const typeInfo = KNOWLEDGE_TYPES.find(t => t.value === item.type) || KNOWLEDGE_TYPES[0]
  const Icon = typeInfo.icon

  return (
    <div className="flex items-start gap-4 p-4 bg-odin-graphite-950/50 rounded-2xl hover:bg-odin-graphite-950 transition-colors group">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-odin-violet-500" />
        <span className="text-nav-label text-odin-violet-400">{typeInfo.label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-white mb-1 truncate">{item.title}</h3>
        <p className="text-body-sm text-odin-graphite-300 line-clamp-2 mb-2">
          {item.content}
        </p>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-odin-violet-400 hover:text-odin-violet-300 mb-2"
          >
            <Link className="w-4 h-4" />
            <span className="truncate">{truncate(item.url, 40)}</span>
          </a>
        )}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {item.tags.slice(0, 4).map(tag => (
            <span key={tag} className="badge-neutral text-xs">{tag}</span>
          ))}
          {item.tags.length > 4 && (
            <span className="badge-neutral text-xs">+{item.tags.length - 4}</span>
          )}
        </div>
        <p className="text-caption text-odin-graphite-500">
          {formatRelativeTime(item.updated_at || item.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded-lg text-odin-graphite-400 hover:text-white hover:bg-odin-graphite-800 transition-colors"
          aria-label="Editar"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-lg text-odin-graphite-400 hover:text-odin-crimson-400 hover:bg-odin-graphite-800 transition-colors"
          aria-label="Excluir"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string)
    return true
  } catch {
    return false
  }
}