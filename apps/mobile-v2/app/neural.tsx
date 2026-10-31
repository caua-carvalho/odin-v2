/**
 * ODIN V2 — Neural Interface.
 *
 * Em construção: interface de conversação com o agente ODIN.
 * Próximos ciclos: streaming de respostas, entrada de voz, histórico de
 * conversas e aprovações de operações.
 */

import React from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Surface, Card, VStack, TextCenter, SectionLabel, Badge, Panel, EmptyState, PressableScale } from '../src/components/primitives';
import { useOdinStatus } from '../src/stores/OdinStatusContext';

export default function Neural() {
  const router = useRouter();
  const { activeRuns, pendingApprovals } = useOdinStatus();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    // Simula obtenção de dados do backend pelo serviço API.
    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 600);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <Surface style={styles.root}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} style={styles.back} haptic="light">
          <Text style={styles.backText}>Voltar ao hub</Text>
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#F28B32" />
          <TextCenter size="captionSm" color="muted" style={styles.loadingText}>Carregando Neural…</TextCenter>
        </View>
      ) : activeRuns.length === 0 && pendingApprovals.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="Neural Interface"
          description="Interface de conversação com o agente ODIN. Transmita diretrizes e receba respostas em tempo real."
        />
      ) : (
        <VStack style={styles.content}>
          <SectionLabel title="Chat" />
          <Panel style={styles.placeholder}>
            <TextCenter size="bodySm" color="muted">
              Chat e fluxo de streaming em construção.
            </TextCenter>
          </Panel>
          {pendingApprovals.length > 0 ? (
            <SectionLabel title={`Aprovações pendentes (${pendingApprovals.length})`} />
          ) : null}
        </VStack>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090D12' },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  back: { paddingVertical: 6 },
  backText: { fontSize: 13, color: '#F28B32', fontWeight: '600' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8 },
  content: { flex: 1, padding: 16 },
  placeholder: { marginTop: 8 },
});
