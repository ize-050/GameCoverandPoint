# Pixel Pace — Phase 1 (MVP) Plan

**Goal:** a real Android + iOS app (one KMP codebase) where a person can run outdoors, see themselves on the Leaflet map, earn XP and level up, with Velocity Capping as the only anti-cheat. Backend is minimal.

**Out of scope (later phases):** heart rate / cadence / AI / route analysis (Phase 2), leaderboards, ghost runners, location-quest server logic at scale (Phase 3).

## 1. Architecture

```
pixel-pace/
  app/                      Kotlin Multiplatform
    shared/                 commonMain: pure Kotlin
      domain/               XpEngine, LevelCurve, VelocityGuard, RunSession, QuestEngine
      data/                 RunRepository (SQLDelight), ApiClient (Ktor)
      presentation/         ViewModels + UiState (StateFlow)
      ui/                   Compose Multiplatform screens + pixel design system
    androidApp/             Foreground service, FusedLocation, permissions
    iosApp/                 CoreLocation, background modes, SwiftUI host
  server/                   Node.js (Fastify): REST + later WebSocket
  map/                      Leaflet page bundled as local asset, WebView bridge
```

- The demo's `engine.js` maps almost 1:1 to `shared/domain` (XP, leveling, velocity cap, quests). Port it first; it is the spec.
- Platform code is limited to a `LocationProvider` interface (`expect/actual`) emitting `GpsFix(lat, lng, accuracy, speed, timestamp)`.
- Leaflet runs in a WebView (Android `WebView`, iOS `WKWebView`) with a small JS bridge: `setPlayer`, `addTrail`, `addCheckpoint`. Tiles: OSM for dev; plan a tile cache + own tile server/provider before beta (OSM usage policy forbids heavy production use).

## 2. Work breakdown (≈ 8 weeks, 1–2 devs)

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| M1 | Project setup (wk 1) | KMP + Compose MP skeleton, CI, lint, design tokens, Press Start 2P font | Hello screen on both platforms |
| M2 | Pixel design system (wk 1–2) | Buttons, bars, cards, nav, sprite renderer from demo CSS/art | Gallery screen matches demo |
| M3 | Location + map (wk 2–3) | `LocationProvider`, permissions flow, Leaflet WebView, live trail | Walk outside, trail draws, battery < 8%/h |
| M4 | Run engine (wk 3–4) | `RunSession` (start/pause/finish), GPS filtering, distance/pace, foreground service / background location | 5 km run recorded with screen locked |
| M5 | XP + leveling (wk 4–5) | `XpEngine`, level curve, level-up UI, profile + gear persistence (SQLDelight) | Matches demo numbers in unit tests |
| M6 | Velocity Capping (wk 5) | `VelocityGuard`: > 20 km/h for 30 s → "Vehicular", suspend XP, banner | Car ride test flags; sprint does not |
| M7 | Backend + sync (wk 5–6) | Fastify + Postgres: auth (anonymous device token → account later), `POST /runs`, server re-validates speed | Run uploads; server rejects impossible runs |
| M8 | Basic quests (wk 6–7) | Daily bounties + 3 checkpoints in Lumphini, server-defined JSON | Checkpoint clears at < 45 m |
| M9 | Hardening + TestFlight/internal track (wk 7–8) | Crash reporting, analytics, privacy policy, store listings | 20 internal testers complete runs |

## 3. Key technical decisions

1. **GPS quality:** discard fixes with accuracy > 30 m or implied speed > 12 m/s jump; smooth with simple Kalman/moving average; ignore first 10 s warm-up.
2. **Velocity Capping:** operate on smoothed speed over a 30 s window, not single fixes, to avoid false flags from GPS spikes. Sticky per session; user can appeal (flag for review) rather than hard ban.
3. **Server is the authority:** client XP is provisional; server recomputes from the uploaded track and wins on mismatch.
4. **Offline-first:** runs stored locally, synced when online.
5. **Privacy:** location stored only for run history; blur start/end 200 m on any shared view; PDPA (Thailand) consent screen before first run.
6. **Battery:** adaptive GPS interval (1 s when moving, 5 s when stopped); Leaflet only renders while the screen is on.

## 4. Testing

- Unit: `XpEngine`, `LevelCurve`, `VelocityGuard` (table-driven, reuse demo scenarios: run / sprint / e-bike / car).
- Replay tests: recorded GPX files (walk, jog, bus ride) fed through `LocationProvider` fake.
- Field test: 3 real runs at Lumphini + 1 bus ride per platform before M9.

## 5. Risks

| Risk | Mitigation |
|---|---|
| iOS/Android background location kills | Foreground service + `allowsBackgroundLocationUpdates`; test on low-end Android (Xiaomi/Oppo battery savers common in TH) |
| WebView map jank | Cap redraws to 2 Hz, move the marker with CSS transforms |
| OSM tile policy | Self-host or switch to a low-cost tile provider before beta |
| Compose Multiplatform iOS maturity | Keep the map + platform bits native-hosted; spike M1 on a real iPhone |
| False "Vehicular" flags (BTS skytrain nearby, GPS bounce) | 30 s smoothing window, server re-check, appeal flow |

## 6. Exit criteria for Phase 1

- A new user can install, grant permission, run 3 km, gain XP, level up, and see the run synced.
- Velocity Capping flags a bus ride and not a sprint, in field tests.
- Crash-free sessions ≥ 99%; battery ≤ 8%/h during a run.
- Ready to add wearable data (Phase 2) without reworking `RunSession` — it already exposes a `SensorSample` stream, just empty.
