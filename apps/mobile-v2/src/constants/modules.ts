/** ODIN V2 — Palette de módulos (design system seção 3.1 e 4.1).

 * Distribuição do arco radial: 6 módulos de navegação.
 * Os ícones usam nomes confirmados em apps/mobile (Ionicons).
 */

import { Ionicons } from '@expo/vector-icons';

export interface Module {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
}

/** Módulos disponíveis no arco de navegação. Ordem = posição angular. */
export const MODULES: Module[] = [
  {
    id: 'command',
    label: 'Command Center',
    icon: 'pulse-outline',
    hint: 'Visão consolidada do ODIN',
  },
  {
    id: 'neural',
    label: 'Neural Interface',
    icon: 'chatbubble-outline',
    hint: 'Conversa e controle da IA',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: 'folder-outline',
    hint: 'Projetos e MVPs hospedados',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: 'cube-outline',
    hint: 'Memória persistente do ODIN',
  },
  {
    id: 'automations',
    label: 'Automations',
    icon: 'time-outline',
    hint: 'Tarefas autônomas',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    icon: 'server-outline',
    hint: 'Monitoramento e controle',
  },
];
