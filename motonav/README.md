# MotoNav (PoC)

Phone-tethered turn-by-turn nav for a motorcycle-mounted display.
Phone does routing (Mapbox Navigation SDK) and pushes simplified maneuver
data to a BLE-connected display device. No custom PCB yet — this is the
software proof of concept, running on off-the-shelf dev hardware.

## Architecture

```
[Phone: Mapbox Navigation SDK]
        |  (headless, no map UI shown)
        v
[NavigationManager] -- RouteProgress / BannerInstructions callbacks
        v
[NavUpdate] -- simplified maneuver + distance + street + eta
        v
[BleCentralManager] -- writes wire-line to device over BLE GATT
        v
[ESP32-C3 GATT server] -- parses line, prints to Serial and to display
        v
[GM009605 OLED (SSD1306, 128x64, I2C)] -- interim display for bench
verification; production display choice (Sharp Memory LCD vs. cheap
GC9A01 TFT) is still evaluated separately, see CONTEXT.md
```

Phone is the BLE **central**, the ESP32 is the **peripheral** — opposite
direction from BreatheBird, where the ESP32 was the one broadcasting
sensor data. Here the phone has the data and pushes it down.

## Repo structure

```
moto-nav/
├── app/          Android app (Kotlin, Jetpack Compose)
└── firmware/      ESP32-C3 receiver sketch (NimBLE-Arduino)
```

## Status: barebones skeleton

This is **not wired to real Mapbox routing yet** — `NavigationManager.kt`
has the Mapbox integration points commented out with TODOs, because that
requires your own Mapbox access token (see below). Everything else — BLE
scan/connect/write on the phone side, BLE GATT server + line parsing on
the device side, and OLED rendering of received nav data — is real,
working code, and the Android app now builds a debug APK via GitHub
Actions (`.github/workflows/motonav-android-build.yml`).

## Setup

### Phone app
1. Open `moto-nav/` in Android Studio (Jellyfish or newer).
2. Get a Mapbox access token: https://account.mapbox.com/access-tokens/
3. Add the Mapbox Maven repo + your **secret** download token to
   `settings.gradle.kts` (Mapbox's setup docs cover this — it's a
   `dependencyResolutionManagement` credentials block, not something to
   commit to git).
4. Uncomment the Mapbox dependency in `app/build.gradle.kts`.
5. Uncomment the real implementation in `NavigationManager.kt` and wire
   `registerRouteProgressObserver` / `registerBannerInstructionsObserver`.

### Firmware
1. Board: ESP32-C3 (same family as BreatheBird).
2. Libraries (Arduino Library Manager):
   - `NimBLE-Arduino` (delete the stock `ESP32_BLE_Arduino` lib if
     present — same lesson learned from BreatheBird).
   - `Adafruit SSD1306` + `Adafruit GFX Library` (OLED driver).
3. Wire the GM009605 0.96" I2C OLED (SSD1306, 128x64, monochrome):
   VCC -> 3.3V, GND -> GND, SDA/SCL -> the pins set by `OLED_SDA_PIN` /
   `OLED_SCL_PIN` at the top of the sketch (defaults to GPIO8/GPIO9 for
   an ESP32-C3 Super Mini — confirm against your specific board). I2C
   address is 0x3C on most of these modules; try 0x3D if `display.begin()`
   fails.
4. Flash `firmware/moto_nav_receiver/moto_nav_receiver.ino`.
5. Open Serial Monitor at 115200 baud — you should see
   `[MotoNav] Advertising, waiting for phone...`, and the same status on
   the OLED. If the OLED isn't detected, the firmware logs a warning and
   carries on Serial-only (BLE still works without it).

## Testing the PoC, in order

1. Flash the ESP32, confirm it's advertising as `MotoNav_0001`.
2. Build + run the phone app, tap "Connect to MotoNav device" — confirm
   it finds and connects to the ESP32 (Serial Monitor should print
   `Phone connected`).
3. Temporarily call `bleManager.sendNavLine("NAV|TURN_LEFT|150|MG Road|4\n")`
   manually from a button tap (before Mapbox is wired in) — confirm the
   ESP32 parses it, prints it to Serial, **and renders it on the OLED**.
   This proves the full phone -> BLE -> device -> display leg end to end
   without needing a real route yet.
4. Wire in real Mapbox routing (see Setup above), take it for an actual
   test ride, watch the OLED (and Serial Monitor) track real maneuvers.
5. The GM009605 OLED here is an interim bench-verification display, not
   the production choice — once the BLE + data pipeline is proven, move
   on to the cheap GC9A01 round TFT, then a Sharp Memory LCD breakout for
   the outdoor sunlight-readability test (see CONTEXT.md).

## Known gaps (by design, for a PoC)

- No foreground service — app will lose GPS/BLE if backgrounded.
- No BLE auto-reconnect — a dropped connection needs a manual re-tap.
- No PHY negotiation (2M/Coded) yet — added once basic flow is proven.
- No destination search UI — `requestRoute()` takes hardcoded coords.
- No runtime permission handling (BLUETOOTH_SCAN/CONNECT on API 31+).

None of these block proving the core concept. All are noted with `TODO`
in the relevant files.

## CI: building the APK

`.github/workflows/motonav-android-build.yml` builds a debug APK on every
push/PR that touches `motonav/**` (and on manual dispatch), using the
Gradle wrapper checked into `motonav/`. The unsigned debug APK is
uploaded as a workflow artifact (`motonav-debug-apk`) — download it from
the Actions run summary to install directly on a phone for testing
(`adb install` or just transfer the file).

## Continuing in Claude Code

Once pushed (or just working from the downloaded folder), `cd` into it
and run `claude` to start a Claude Code session with the full project
in context — that's a better environment than this chat for the
back-and-forth of actually wiring up Mapbox and iterating on the BLE
reconnect logic.
