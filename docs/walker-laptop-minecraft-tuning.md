# Walker-Laptop Minecraft Tuning (1.16.5 Fabric)

Kid's low-end laptop. Goal: "buttery smooth" Minecraft.

## Hardware

- CPU: Intel Celeron N4020 @ 1.1 GHz (2c/2t, Gemini Lake)
- iGPU: Intel UHD 600 (Gen9.5, 12 EU) — OpenGL 4.6 capable but weak
- RAM: 3.8 GB total (shared with iGPU)
- Panel: 1366×768

## Install

- Minecraft 1.16.5, Fabric `fabric-loader-0.14.23-1.16.5` (offline-capable)
- Offline player: `MAELTHEMAN` (no Mojang auth needed)
- Launcher: Eclipse Adoptium **JRE 21** (`java.exe` from `runtime` path used by the offline `.bat`)

## Mods (`%APPDATA%\.minecraft\mods\`) — the low-end stack

| Mod | Version | Role |
|-----|---------|------|
| sodium-fabric | 0.2.0+build.4 | GPU rewrite, the big win |
| lithium-fabric | 0.6.6 | server/logic optimization |
| entityculling-fabric | 1.5.2 | skips off-screen entities |
| fabric-api | 0.42.0+1.16 | API |
| ferritecore | 2.1.1 | memory/allocation reduction |

## JVM args (G1GC, RAM-capped for 3.8 GB box)

In `offline-fabric-1.16.5-args.txt` (the offline launch route) and mirrored in `launcher_profiles.json`:

```
-Xms512M -Xmx1792M -XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+ParallelRefProcEnabled
-XX:+UseStringDeduplication -XX:+DisableExplicitGC
```

`-Xmx1792M` leaves ~2 GB for OS + iGPU; `-Xms512M` avoids a long initial heap climb.

## Options (`options.txt`) — light settings

```
renderDistance:6   smoothLighting:false  clouds:false
particles:minimal  entityDistance:0.5    mipmapLevels:0
vsync:true         fbo:false
```

vsync caps to the panel's 60 Hz and smooths frame pacing; render distance 6 is the sweet spot for a weak iGPU.

## How to launch

Two batch files on the **Desktop**:

- **`Play Minecraft (Offline Modded).bat`** → Adoptium JRE 21 → `@offline-fabric-1.16.5-args.txt` (full classpath, natives, Fabric 0.14.23, KnotClient). This is the play button.
- **`FPS Test (Minecraft).bat`** → launches the game, runs **PresentMon 1.10.0** for 25 s, and writes `FPS-Result.txt` to the Desktop with average / min / max FPS and a target check.

> The FPS self-test must be run from an **unlocked** desktop session. It injects into the live game window and captures present timing via ETW — it does not work over SSH / from a locked session.

## Verification status

Verified from the laptop (remote SSH + interactive session):

- [x] All 5 mods load (Fabric mod list in `latest.log`)
- [x] JVM args resolve; classpath = 55 jars, 0 missing
- [x] `natives-1.16.5` present (LWJGL dlls)
- [x] Full boot chain: Mixin → Lithium/Sodium config → "Setting user: MAELTHEMAN" → OpenAL/sound → all texture atlases created → LWJGL backend init
- [x] Game renders at the native 1366×768 panel (screenshot captured from the interactive session)
- [ ] **Live on-screen FPS target** — pending an unlocked-session self-test run (see above). The automated capture is blocked while the laptop is at a locked session.

## FPS targets

- **≥ 60 fps** at small window / low render distance → "buttery"
- **≥ 30 fps** → playable
- If < 30: drop `renderDistance` to 4, set `graphics:fast`, consider `mipmapLevels:0` (already 0) and disabling vsync only if tearing is acceptable.

## Notes / gotchas

- MC 1.16.5 + Sodium 0.2 needs an OpenGL 3.2+ context. The UHD 600 driver provides this; if the launcher ever dies silently at "Backend library: LWJGL" with no crash report, suspect a headless/locked-session launch (not a mod fault).
- Launching over SSH (session 0) fails at GL-window creation — must run in the interactive user session (double-click the `.bat`, or `schtasks /IT` while unlocked).
- Do not raise `-Xmx` above ~1792M on this box; it invites OS/iGPU memory pressure.
