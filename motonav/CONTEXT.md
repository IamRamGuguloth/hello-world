# MotoNav — Project Context

Handoff brief for continuing this project in Claude Code. Written to be
self-contained — doesn't assume access to the chat history this came from.

## What this is

A turn-by-turn navigation display for a motorcycle handlebar mount.
Phone does all routing/GPS work; the device is a BLE-connected display
that shows simplified maneuver data. Modeled on how Beeline Moto and
COBI work, not a standalone GPS unit like a Garmin Zumo.

**Long-term goal:** this may become a sellable product eventually, so
decisions have been made with that in mind (chip/display choices with a
production path, not just whatever's fastest to hack together) — but
the **current phase is proof-of-concept only**. No PCB design, no
enclosure, no certifications yet. Just: prove the phone → BLE → device
data pipeline actually works end to end.

## Why phone-tethered, not standalone GPS

Building an offline routing engine + map data + GPS from scratch
(Garmin-style) was explicitly ruled out as a multi-year undertaking not
worth it for this. Mapbox Navigation SDK on the phone does the actual
routing/GPS/rerouting; the device just renders what it's told.

## Architecture

```
Phone: Mapbox Navigation SDK (headless — no map UI needs to be shown)
  → RouteProgressObserver fires ~1x/sec with distance/ETA
  → BannerInstructionsObserver fires once per route step (the actual "turn" event)
  → NavigationManager maps these into a small NavUpdate object
  → BleCentralManager writes it as a text line over BLE GATT
Device (ESP32-C3, NimBLE GATT server)
  → receives, reassembles MTU-chunked writes on '\n', parses
  → (next step: renders on a display — currently just Serial.prints)
```

Key clarification already established: the Mapbox SDK never talks to
BLE directly — it only fires callbacks into app code, and the app code
is what explicitly forwards a subset of that data over BLE. It's not
"the SDK pushes to the device."

**BLE roles are the inverse of the BreatheBird project**: here the
**phone is the GATT central**, the **ESP32 is the peripheral/server**.
(BreatheBird had the ESP32 broadcasting sensor data as peripheral to the
phone as central — same general pattern, opposite data direction.)

## Wire protocol

Plain text line, `\n`-terminated, same style as BreatheBird's serial
line format (`processChunk()` / `lineBuffer` reassembly on the device
side is directly reused):

```
NAV|<maneuverCode>|<distanceMeters>|<streetName>|<etaMinutes>\n
e.g. NAV|TURN_LEFT|150|MG Road|4\n
```

BLE UUIDs (custom, in `BleConstants.kt` / firmware `#define`s):
- Service: `a1b2c3d0-1234-5678-9abc-def012345678`
- Nav data characteristic (phone writes): `a1b2c3d1-...` (WRITE)
- Status characteristic (device notifies, currently stubbed/unused): `a1b2c3d2-...` (NOTIFY)
- Device advertises as `MotoNav_0001` (prefix `MotoNav_`)

## Current repo state (what's real vs. stubbed)

- **Fully working:** `BleCentralManager.kt` (scan/connect/discover/write),
  the entire ESP32 firmware (`moto_nav_receiver.ino` — GATT server, line
  parsing, Serial output, **and GM009605 OLED rendering**). You can flash
  the firmware and test the BLE leg today without touching Mapbox.
- **Stubbed, TODO-gated:** `NavigationManager.kt` — the real Mapbox
  calls are written but commented out, pending a Mapbox access token.
  Structurally correct against the real SDK API (`RouteProgressObserver`,
  `BannerInstructionsObserver`, `MapboxNavigation`), just not compiled/tested.
  `MainActivity` does call `navigationManager.start()` now (was previously
  instantiated but never started — harmless while `start()` is a no-op
  stub, but fixed so it's correct once the real implementation lands).
- **Not built yet, by design (PoC scope):** foreground service, BLE
  auto-reconnect, PHY negotiation, destination search UI, runtime
  permission handling (API 31+ BLUETOOTH_SCAN/CONNECT).

### Build infrastructure (added after the initial handoff)

The zip handoff was missing pieces that would have made the Android app
fail to build: no `res/` directory at all (the manifest referenced
`@style/Theme.MotoNav` and `@mipmap/ic_launcher`, neither of which
existed) and no Gradle wrapper. Both are fixed now:
- `app/src/main/res/values/themes.xml` — minimal platform theme
  (`android:Theme.Material.Light.NoActionBar` parent) since the app is
  pure Compose with no AppCompat/Material Components dependency.
- `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` + two vector
  drawables — adaptive icon, no PNGs needed since minSdk 26 is exactly
  the adaptive-icon floor.
- `gradlew` / `gradlew.bat` / `gradle/wrapper/` — Gradle 8.6 wrapper,
  compatible with AGP 8.3.0 + Kotlin 1.9.22 already pinned in the build
  files.
- `.github/workflows/motonav-android-build.yml` — builds a debug APK on
  push/PR touching `motonav/**`, uploads it as a workflow artifact.
  Not build-verified locally in the environment that added these files
  (its network policy blocks `dl.google.com`, so the Android SDK
  couldn't be fetched there) — first real signal is whatever this
  workflow reports on GitHub.

### GM009605 OLED (interim display, not the production choice)

Added to let the phone -> BLE -> device pipeline be verified visually on
the bench, ahead of the GC9A01/Sharp Memory LCD evaluation described
below (which is still the actual production-path plan, unchanged). It's
a 0.96" I2C SSD1306 module (128x64, monochrome), driven with
Adafruit_SSD1306 + Adafruit_GFX. Pins are `OLED_SDA_PIN` / `OLED_SCL_PIN`
at the top of the `.ino` (defaulted to GPIO8/GPIO9 for an ESP32-C3 Super
Mini — verify against the actual board), I2C address 0x3C (0x3D on some
units). If the display isn't detected at boot, the firmware logs a
warning and keeps running BLE-only — the OLED is not load-bearing for
the BLE leg.

Package: `com.motonav.rider`. Android min SDK 26, compile SDK 34,
Kotlin + Jetpack Compose (same stack as the BreatheBird app).

## Test plan, in order

1. Flash ESP32 firmware (with the GM009605 OLED wired per above),
   confirm it advertises as `MotoNav_0001` (Serial Monitor, 115200 baud,
   and "Advertising..." on the OLED).
2. Build the phone app, connect — confirm `Phone connected` on Serial
   and on the OLED.
3. Manually call `sendNavLine("NAV|TURN_LEFT|150|MG Road|4\n")` from a
   temporary button (before Mapbox is wired in) — proves the BLE leg
   end to end without needing a real route, and confirms the parsed
   fields render correctly on the OLED, not just Serial.
4. Get a Mapbox access token, uncomment `NavigationManager`'s real
   implementation, wire the Maven credentials block into
   `settings.gradle.kts` (per Mapbox's own setup docs — don't commit the
   secret token to git).
5. Real test ride, watch the OLED (and Serial Monitor) track live
   maneuvers.
6. Only after step 5 is solid — move to the actual display candidates.
   Cheap GC9A01 round TFT first (fast to wire, good for indoor dev),
   then a Sharp Memory LCD breakout specifically to test outdoor
   sunlight readability, since that's the single biggest open hardware
   risk. The GM009605 above is a bench-verification stand-in, not one of
   these candidates.

## PoC hardware shopping list (already discussed, off-the-shelf only)

- Reuse an ESP32-C3 Super Mini already on hand from BreatheBird — no new
  MCU needed for the PoC.
- 1.28" round GC9A01 SPI TFT (240×240) — cheap, gauge-like, for desk dev.
- Adafruit Sharp Memory LCD breakout — only if/when testing outdoor
  sunlight-readability specifically; this is the actual production
  display technology being evaluated.
- 3.7V LiPo (500–1000mAh) + TP4056 charger — for portable road testing.
- A couple of tactile buttons, optional, for basic interaction testing.
- Sourcing: Robu.in / Robocraze for fast India shipping on TFT/LiPo/charger.

## Production-path decisions (deferred, but already settled for later)

These aren't being acted on yet — no PCB work is happening right now —
but were deliberately chosen ahead of time so the PoC doesn't paint into
a corner:

- **MCU for a future custom board:** Nordic **nRF54L15** — modern BT5.4
  SoC, Channel Sounding support, meaningfully better power efficiency
  than the older nRF52 generation. **nRF52840** is the fallback if a
  more mature/documented path is preferred.
- **PMIC:** Nordic **nPM1300**, purpose-built to pair with the nRF54/52
  series (battery charging + buck regulation).
- **BLE PHY strategy:** negotiate **Coded PHY (LE Long Range)** for
  range/reliability through a jacket pocket or tank bag; use **2M PHY**
  during normal connected operation for lower latency and less
  radio-on-time (helps power on both ends). This is a firmware-side
  connection parameter, not a hardware choice — same chip supports both.
- **Display for production:** Sharp Memory LCD over OLED — OLED (used in
  the weather station project) washes out in direct sunlight; Sharp's
  reflective tech is near-zero power when static and genuinely
  outdoor-legible.
- **IMU:** planned addition for wake-on-motion (device sleeps fully when
  the bike is parked) and potentially lean-angle/crash-detection later.
- **Antenna:** flagged as an easy-to-miss risk — a metal handlebar clamp
  or aluminum enclosure can shield a PCB trace antenna; needs testing
  with the actual enclosure material, not just a bare dev board.
- **Waterproof USB-C connector** (IP67-rated, e.g. Amphenol/JAE) for
  charging/flashing on the final unit.

## Phone battery optimization notes (for when the service is built)

In order of actual impact:
1. Keep the phone screen off/dim — this is normally the biggest battery
   draw in any nav app, and isn't needed since the device is the display.
2. Foreground service with battery-optimization exemption — without
   this, Android's Doze throttles GPS/BLE within minutes of screen-off,
   which is the real-world #1 failure mode, not raw radio power draw.
3. Widen the BLE connection interval when idle between maneuvers, tighten
   briefly around an upcoming turn — don't slow down GPS itself (1Hz is
   what real turn-by-turn needs).
4. Let Android's Fused Location Provider handle sensor fusion rather
   than polling raw GPS continuously.
5. Pragmatic fallback: most riders already run a USB-powered phone
   mount — design around "assume powered," same conclusion every
   commercial moto-nav product quietly reaches.

## Selling this later — compliance checklist (not urgent, for later reference)

BIS certification (India, mandatory for radio + electronics sale),
FCC/CE if exporting, UN38.3 if shipping with a lithium battery inside,
an actual IP-rating test report (not just an assumption), RoHS
compliance on components.

## Constraints to keep in mind

- No third-party MCP connectors/apps involved in building this — plain
  git, no GitHub connector auth available in the environment this was
  scaffolded in. Repo was git-initialized and committed locally, then
  handed off as a zip for manual push.
- This project deliberately reuses patterns from an earlier project,
  **BreatheBird** (ESP32-C3 + BLE + Kotlin/Compose air quality monitor)
  — same tech stack, same "text line over BLE, reassemble on `\n`"
  wire-protocol idea, same NimBLE-Arduino firmware library choice.
