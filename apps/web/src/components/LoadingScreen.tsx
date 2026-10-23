import { cn } from '../lib/utils'

export function LoadingScreen({ className }: { className?: string }) {
  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-odin-black', className)}
      role="status"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-odin-graphite-700 border-t-odin-orange-500 rounded-full animate-spin" />
        <p className="text-odin-graphite-400">Carregando...</p>
      </div>
    </div>
  )
}

export function InlineLoading({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  }
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className={cn(sizes[size], 'border-odin-graphite-700 border-t-odin-orange-500 rounded-full animate-spin')} />
    </div>
  )
}

export function Skeleton({ className, width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={cn('animate-pulse bg-odin-graphite-800 rounded', className)}
      style={{ width, height }}
    />
  )
}