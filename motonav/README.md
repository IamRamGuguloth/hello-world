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
[ESP32-C3 GATT server] -- parses line, currently Serial.prints it
        v
(display wiring is the next step, not part of this PoC)
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

This compiles conceptually but is **not wired to real Mapbox routing
yet** — `NavigationManager.kt` has the Mapbox integration points
commented out with TODOs, because that requires your own Mapbox access
token (see below). Everything else — BLE scan/connect/write on the phone
side, and BLE GATT server + line parsing on the device side — is real,
working code.

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
2. Library: NimBLE-Arduino (delete the stock `ESP32_BLE_Arduino` lib if
   present — same lesson learned from BreatheBird).
3. Flash `firmware/moto_nav_receiver/moto_nav_receiver.ino`.
4. Open Serial Monitor at 115200 baud — you should see
   `[MotoNav] Advertising, waiting for phone...`

## Testing the PoC, in order

1. Flash the ESP32, confirm it's advertising as `MotoNav_0001`.
2. Build + run the phone app, tap "Connect to MotoNav device" — confirm
   it finds and connects to the ESP32 (Serial Monitor should print
   `Phone connected`).
3. Temporarily call `bleManager.sendNavLine("NAV|TURN_LEFT|150|MG Road|4\n")`
   manually from a button tap (before Mapbox is wired in) — confirm the
   ESP32 parses and prints it correctly. This proves the BLE leg end to
   end without needing a real route yet.
4. Wire in real Mapbox routing (see Setup above), take it for an actual
   test ride, watch the Serial Monitor track real maneuvers.
5. Only after step 4 works reliably — bring in the display (cheap GC9A01
   TFT first, then Sharp Memory LCD for the sunlight-readability test).

## Known gaps (by design, for a PoC)

- No foreground service — app will lose GPS/BLE if backgrounded.
- No BLE auto-reconnect — a dropped connection needs a manual re-tap.
- No PHY negotiation (2M/Coded) yet — added once basic flow is proven.
- No destination search UI — `requestRoute()` takes hardcoded coords.
- No runtime permission handling (BLUETOOTH_SCAN/CONNECT on API 31+).

None of these block proving the core concept. All are noted with `TODO`
in the relevant files.

## Pushing this to GitHub

This repo is git-initialized locally with an initial commit, but I don't
have your GitHub credentials, so I can't create the remote repo myself.
From your machine, after downloading this project:

```bash
gh repo create moto-nav --private --source=. --remote=origin --push
```

(or, without the `gh` CLI: create an empty repo on github.com, then
`git remote add origin <url>` and `git push -u origin main`)

## Continuing in Claude Code

Once pushed (or just working from the downloaded folder), `cd` into it
and run `claude` to start a Claude Code session with the full project
in context — that's a better environment than this chat for the
back-and-forth of actually wiring up Mapbox and iterating on the BLE
reconnect logic.
