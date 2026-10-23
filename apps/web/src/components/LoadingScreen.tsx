import { cn } from '../lib/utils'

export function LoadingScreen({ className }: { className?: string }) {
  return (
    <div
      className={cn('fixed inset-0 z-50 flex items-center justify-center bg-odin-black', className)}
      role="status"
      aria-label="Carregando"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-3 border-odin-graphite-700 border-t-odin-violet-500 rounded-full animate-spin" />
        <p className="text-body text-odin-graphite-400">Carregando...</p>
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
      <div className={cn(sizes[size], 'border-odin-graphite-700 border-t-odin-violet-500 rounded-full animate-spin')} />
    </div>
  )
}

export function Skeleton({ className, width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={cn('animate-pulse bg-odin-graphite-800 rounded-lg', className)}
      style={{ width, height }}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-odin-graphite-800 rounded animate-pulse" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-odin-graphite-950/50 rounded-2xl border border-odin-graphite-800/50 p-4 animate-pulse space-y-3', className)}>
      <div className="h-6 bg-odin-graphite-800 rounded w-3/4" />
      <div className="h-4 bg-odin-graphite-800 rounded w-full" />
      <div className="h-4 bg-odin-graphite-800 rounded w-5/6" />
      <div className="h-4 bg-odin-graphite-800 rounded w-1/2" />
    </div>
  )
}