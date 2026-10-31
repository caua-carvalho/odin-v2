/** ODIN V2 — Root layout (escopo global).

 * Responsabilidade: fornecer os contextos de estado globais e o navegador
 * de pilhas que sustenta o núcleo (hub) e os módulos.
 *
 * Flow de autenticação: se não houver usuário logado, o app redireciona para o
 * login (a tela de login é criada na próxima iteração). Enquanto isso, o root
 * renderiza o hub (command center) como ponto de entrada por padrão.
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router/stack';
import { AuthProvider } from '../src/stores/AuthContext';
import { OdinStatusProvider } from '../src/stores/OdinStatusContext';
import { colors } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <OdinStatusProvider>
          <>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" options={{ title: 'ODIN' }} />
              <Stack.Screen name="neural" options={{ title: 'Neural' }} />
              <Stack.Screen name="projects" options={{ title: 'Projects' }} />
              <Stack.Screen name="memory" options={{ title: 'Memory' }} />
              <Stack.Screen name="automations" options={{ title: 'Automations' }} />
              <Stack.Screen name="infrastructure" options={{ title: 'Infrastructure' }} />
            </Stack>
          </>
        </OdinStatusProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
