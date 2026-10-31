/** ODIN V2 — Odin status context.

 * Responsabilidade: manter o estado operacional consolidado do sistema
 * (aprovações pendentes, execuções ativas, total de conversas, tempo
 * da última sincronização) e expor um fluxo de *refresh* reutilizável.
 *
 * A atualização usna polling REST (20s) como padrão, conforme o mobile
 * referência. O streaming SSE/WebSocket é um próximo ciclo (Fase 6).
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, type Approval, type Run } from '../services/api';

const ACTIVE_STATUSES: Run['status'][] = ['queued', 'running', 'waiting_approval'];

interface OdinStatusContextValue {
  pendingApprovals: Approval[];
  activeRuns: Run[];
  conversationTotal: number;
  lastUpdated: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const OdinStatusContext = createContext<OdinStatusContextValue | null>(null);

export function OdinStatusProvider({ children }: { children: React.ReactNode }) {
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  const [activeRuns, setActiveRuns] = useState<Run[]>([]);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const task = (async () => {
      setRefreshing(true);
      const [approvalsResult, runsResult, conversationsResult] = await Promise.allSettled([
        api.listApprovals(),
        api.listRuns({ page_size: 30 }),
        api.listConversations({ page_size: 1 }),
      ]);

      if (approvalsResult.status === 'fulfilled') {
        setPendingApprovals(approvalsResult.value.items);
      }
      if (runsResult.status === 'fulfilled') {
        setActiveRuns(runsResult.value.items.filter((run) => ACTIVE_STATUSES.includes(run.status)));
      }
      if (conversationsResult.status === 'fulfilled') {
        setConversationTotal(conversationsResult.value.total);
      }
      setLastUpdated(new Date().toISOString());
      setRefreshing(false);
    })();

    inFlight.current = task.finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, []);

  // Inicializa o refresh imediatamente; o interceptor do api client
  // trata 401s com refresh automático dos tokens persistidos.
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    void refresh();

    timer = setInterval(() => {
      void refresh();
    }, 20_000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  return (
    <OdinStatusContext.Provider
      value={{
        pendingApprovals,
        activeRuns,
        conversationTotal,
        lastUpdated,
        refreshing,
        refresh,
      }}
    >
      {children}
    </OdinStatusContext.Provider>
  );
}

export function useOdinStatus(): OdinStatusContextValue {
  const ctx = useContext(OdinStatusContext);
  if (!ctx) throw new Error('useOdinStatus must be used within an OdinStatusProvider');
  return ctx;
}
