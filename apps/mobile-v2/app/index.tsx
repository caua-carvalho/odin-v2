/** ODIN V2 — Command Center (hub).

 * Ponto de entrada principal do app. Mostra o núcleo central com o estado
 * operacional do agente (provido pelo backend) e o arco de navegação
 * radial dos seis módulos.
 *
 * Estados de carregamento:
 *  - Loading: telemetry não foi consultada ainda
 *  - Error: não foi possível ler a telemetria
 *  - Empty: o backend não retornou dados
 *  - Success: hub completo com status real
 */

import React from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CentralCore, type CoreState } from '../src/components/core/CentralCore';
import { ArcNavigation } from '../src/components/navigation/ArcNavigation';
import { MODULES } from '../src/constants/modules';
import { Surface, Card, VStack, TextCenter, SectionLabel, StatTile, Panel, PressableScale, EmptyState } from '../src/components/primitives';
import { useOdinStatus } from '../src/stores/OdinStatusContext';
import { api, type SystemStatusResponse } from '../src/services/api';

export default function Index() {
  const { pendingApprovals, activeRuns, conversationTotal, refreshing } = useOdinStatus();
  const router = useRouter();

  const [systemStatus, setSystemStatus] = React.useState<SystemStatusResponse | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    api.getSystemStatus()
      .then((data) => {
        if (mounted) {
          setSystemStatus(data);
          setStatusError(null);
        }
      })
      .catch(() => {
        if (mounted) setStatusError('Não foi possível consultar a telemetria do nó.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Estado operacional derivado dos dados reais do backend.
  const state: CoreState = pendingApprovals.length > 0
    ? 'waiting_approval'
    : activeRuns.some((r) => r.status === 'running')
      ? 'executing'
      : systemStatus?.hermes_connected === true
        ? 'idle'
        : 'offline';

  const metrics = {
    agentName: 'ODIN',
    model: systemStatus?.version ?? '0.1.0',
    connectivity: systemStatus?.hermes_connected === true ? 'Gateway ativo' : 'Offline',
    task: activeRuns[0]?.result_summary ?? undefined,
  };

  return (
    <Surface style={styles.root}>
      <View style={styles.top}>
        <ArcNavigation
          modules={MODULES}
          activeModuleId="command"
          onSelect={(moduleId) => router.push({ pathname: `/${moduleId}` })}
        >
          <CentralCore state={state} metrics={metrics} />
        </ArcNavigation>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#F28B32" />
          <TextCenter size="captionSm" color="muted" style={styles.loadingText}>Carregando telemetria…</TextCenter>
        </View>
      ) : statusError ? (
        <Panel glow="orange" style={styles.errorPanel}>
          <TextCenter size="body" fontWeight="semibold" color="text">Falha na consulta</TextCenter>
          <TextCenter size="bodySm" color="muted" style={styles.errorText}>{statusError}</TextCenter>
          <PressableScale onPress={() => void refreshing} style={styles.retryButton} haptic="medium">
            <TextCenter size="captionSm" fontWeight="semibold" color="primary">Rever</TextCenter>
          </PressableScale>
        </Panel>
      ) : systemStatus ? (
        <VStack style={styles.bottom}>
          <Panel glow={systemStatus.overall === 'ok' ? 'cyan' : 'orange'}>
            <VStack gap={12} style={styles.statusGrid}>
              <StatusRow label="Gateway" value={systemStatus.hermes_connected ? 'ON' : 'OFF'} ok={systemStatus.hermes_connected} />
              <StatusRow label="Banco" value={systemStatus.database_connected ? 'ON' : 'FAIL'} ok={systemStatus.database_connected} />
              <StatusRow label="Saúde" value={systemStatus.overall.toUpperCase()} ok={systemStatus.overall === 'ok'} />
              <StatusRow label="Versão" value={`v${systemStatus.version}`} ok />
            </VStack>
          </Panel>

          <VStack gap={12}>
            <SectionLabel title="Visão rápida" />
            <Card style={styles.stats}>
              <StatTile label="Sessões" value={conversationTotal} tone="primary" />
              <StatTile
                label="Execuções"
                value={activeRuns.length}
                tone={activeRuns.length > 0 ? 'warning' : 'neutral'}
              />
              <StatTile
                label="Aprovados"
                value={pendingApprovals.length}
                tone={pendingApprovals.length > 0 ? 'warning' : 'neutral'}
              />
            </Card>
          </VStack>
        </VStack>
      ) : (
        <EmptyState
          icon="pulse-outline"
          title="Sem dados"
          description="Nenhum dado do backend disponível ainda."
        />
      )}
    </Surface>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.statusRow}>
      <TextCenter size="captionSm" fontWeight="medium" color="muted" style={styles.statusLabel}>{label}</TextCenter>
      <TextCenter size="bodySm" fontWeight="black" color="success" style={styles.statusValue}>{value}</TextCenter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090D12',
  },
  top: {
    height: 220,
    alignItems: 'center',
  },
  bottom: {
    flex: 1,
    padding: 16,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
  },
  errorPanel: {
    margin: 16,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 12,
  },
  statusGrid: {
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusLabel: {
    width: 80,
  },
  statusValue: {
    width: 60,
  },
  stats: {
    gap: 12,
  },
});
