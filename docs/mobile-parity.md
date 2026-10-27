# ODIN Mobile — Parity and Scope

ODIN V2 has two clients against the same backend:

- **Web** (`apps/web`) — the complete command surface: a holographic multi-window
  workspace for desktop.
- **Mobile** (`apps/mobile`) — a companion "arm" for quick commands, approvals and
  status checks away from the desk.

Both share the ODIN identity: black/graphite HUD surfaces, holographic orange as
the dominant accent, cyan telemetry, Inter + JetBrains Mono, and an animated
particle core. Mobile does not try to shrink the desktop workspace into a phone;
it reinterprets the same system as a focused, touch-first command center.

## Feature matrix

| Capability | Web | Mobile | Notes |
|------------|:---:|:------:|-------|
| Email/password login | ✅ | ✅ | Same `/api/auth/login` |
| Transparent token refresh | ✅ | ✅ | Web uses HttpOnly cookie; mobile uses SecureStore + `X-Odin-Client: mobile` |
| Logout / logout-all | ✅ | ✅ | Mobile sends the refresh token in the logout body |
| Nexus command center | ✅ | ✅ | Mobile adds a dedicated orb + quick-dispatch screen |
| Quick prompt → new run | ✅ | ✅ | Mobile creates the conversation, then starts the run |
| Conversation list / switch | ✅ | ✅ | Mobile uses a session sheet + `?conversationId=` deep link |
| New / delete conversation | ✅ | ✅ | Delete is confirmed with a native alert |
| Streaming assistant output | ✅ | ✅ | SSE on web, WebSocket on mobile; both replay by `seq` |
| Markdown assistant output | ✅ | ✅ | GFM tables, lists, task items, code fences, links and images |
| Live tool cards | ✅ | ✅ | Same tool payloads |
| Inline approvals (allow/deny) | ✅ | ✅ | Also surfaced globally on Nexus and Atividade |
| Queued messages while a run is active | ✅ | ✅ | |
| Stop / interrupt run | ✅ | ✅ | |
| Knowledge library | ✅ | ✅ | Search, type filter, tags, create, edit, delete |
| Activity history | ✅ | ✅ | Run expansion + approval inbox |
| System telemetry | ✅ | ✅ | Health, subsystems, session and network info |
| Multi-window workspace | ✅ | ❌ | Mobile uses a five-tab dock instead |
| Drag / resize / minimize panels | ✅ | ❌ | Not meaningful on a phone |
| Simultaneous panels | ✅ | ❌ | One screen at a time |
| Window layout presets | ✅ | ❌ | |
| Keyboard shortcuts | ✅ | ❌ | Touch equivalents (`PressableScale`) |
| Desktop notifications | ❌ | ❌ | Planned push notifications |

## Intentional mobile decisions

1. **Five tabs, not floating windows.** Nexus, Chat, Biblioteca, Atividade and
   Telemetria map to the web panels, with a custom floating glass dock instead of
   the stock tab bar.
2. **Nexus is mobile-first.** The orb, quick command, approval count, active runs,
   recent sessions and recent executions give a one-glance command center that has
   no exact web equivalent.
3. **No dense analytics.** Telemetry shows the health and counters needed to know
   whether ODIN is reachable and busy; deeper inspection stays on web.
4. **Native patterns.** Pull-to-refresh, bottom sheets, alerts, haptics and keyboard
   avoidance replace hover states and window chrome.
5. **Same backend, no mobile-only API surface.** The only compatibility addition is
   the optional refresh token in auth responses when `X-Odin-Client: mobile` is sent.

## Shared visual tokens

The palette mirrors the web client in [`apps/mobile/lib/theme.ts`](../apps/mobile/lib/theme.ts):

| Token | Value | Use |
|-------|-------|-----|
| Background | `#050608` | App canvas |
| Surface | `#0A0D12` | Panels |
| Elevated | `#10151E` | Sheets and chips |
| Border | `#1A212B` | Hairlines |
| Primary | `#FF6A00` | Actions, active states, orb core |
| Primary light | `#FF9A3D` | Highlights and labels |
| Cyan | `#67DFFF` | Telemetry and secondary accent |
| Success / warning / danger | `#10B981` / `#F59E0B` / `#EF4444` | Status |

Typography uses Inter for UI and JetBrains Mono for IDs, counters and telemetry.

## API compatibility notes

- All mobile requests send `X-Odin-Client: mobile`.
- `POST /api/auth/login` and `POST /api/auth/refresh` include `refresh_token` in
  the JSON body for that header. Web responses keep it cookie-only.
- `POST /api/auth/logout` accepts the refresh token in the JSON body when there is
  no cookie, validates it, and revokes the matching session.
- Runs stream at `/api/runs/{id}/ws?after=<seq>&token=<access token>`.
- The mobile client resolves the API host from the Expo/Metro `hostUri` when
  `EXPO_PUBLIC_API_URL` is absent or loopback, so Expo Go works on a physical
  device as long as the backend listens on `0.0.0.0:8000`.

## Validation checklist

Run from `apps/mobile`:

```bash
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android
```

Current status: typecheck, lint, Expo Doctor (20/20) and the Android export all
pass on Expo SDK 58.

## Not planned for mobile (for now)

- Offline-first sync and local caching.
- Push notifications for approvals/run completion (listed as a project TODO).
- File/image attachments (not present on web yet either).
- Administrative or destructive bulk operations beyond conversation deletion.
