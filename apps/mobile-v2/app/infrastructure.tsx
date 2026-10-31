/**
 * ODIN V2 — Infrastructure.
 *
 * Em construção: monitoramento e controle da infraestrutura.
 * Próximos ciclos: servidor, gateway, backend, banco, Tailscale e métricas.
 */

import React from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Surface, Card, VStack, TextCenter, SectionLabel, Badge, Panel, EmptyState, PressableScale } from '../src/components/primitives';
import { useOdinStatus } from '../src/stores/OdinStatusContext';

export default function Infrastructure() {
  const router = useRouter();
  const { activeRuns } = useOdinStatus();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
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
          <TextCenter size="captionSm" color="muted" style={styles.loadingText}>Carregando Infrastructure…</TextCenter>
        </View>
      ) : (
        <VStack style={styles.content}>
          <SectionLabel title="Infraestrutura" />
          <Panel style={styles.placeholder}>
            <TextCenter size="bodySm" color="muted">
              Servidor, gateway Hermes, banco, Tailscale e serviços ativos.
            </TextCenter>
          </Panel>
          <SectionLabel title="Métricas" />
          <Panel style={styles.placeholder}>
            <TextCenter size="bodySm" color="muted">
              CPU, RAM, armazenamento e disponibilidade.
            </TextCenter>
          </Panel>
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
