/*
 * MotoNav PoC receiver — ESP32-C3
 *
 * Bare GATT server: advertises as "MotoNav_0001", exposes one WRITE
 * characteristic that the phone app writes nav wire-lines to. Renders
 * parsed nav data on a GM009605 0.96" I2C OLED (SSD1306, 128x64,
 * monochrome) so the phone -> BLE -> device leg can be verified visually
 * on the bench, plus mirrors everything to Serial for debugging.
 *
 * Same reassembly idea as BreatheBird's processChunk()/lineBuffer: BLE
 * writes may be MTU-chunked, so we buffer until we see '\n'.
 *
 * Libraries:
 *  - NimBLE-Arduino (lighter + more reliable than the stock ESP32 BLE
 *    stack — same choice made for BreatheBird's firmware)
 *  - Adafruit SSD1306 + Adafruit GFX Library (OLED driver, Arduino
 *    Library Manager)
 *
 * Wiring (GM009605 OLED, I2C):
 *  - VCC -> 3.3V, GND -> GND
 *  - SDA -> OLED_SDA_PIN, SCL -> OLED_SCL_PIN (below) — confirm against
 *    your specific ESP32-C3 Super Mini pinout before flashing, dev
 *    boards vary.
 *  - I2C address is 0x3C on most GM009605 boards; a few ship as 0x3D —
 *    check yours if display.begin() fails.
 */

#include <NimBLEDevice.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SERVICE_UUID        "a1b2c3d0-1234-5678-9abc-def012345678"
#define NAV_DATA_CHAR_UUID  "a1b2c3d1-1234-5678-9abc-def012345678"
#define STATUS_CHAR_UUID    "a1b2c3d2-1234-5678-9abc-def012345678"

// ESP32-C3 Super Mini default Wire pins — verify against your board.
#define OLED_SDA_PIN  8
#define OLED_SCL_PIN  9

#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1    // no dedicated reset line on the 4-pin I2C module
#define SCREEN_ADDRESS 0x3C  // try 0x3D if begin() fails

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool displayReady = false;

NimBLECharacteristic* statusChar;
String lineBuffer = "";

struct NavUpdate {
  String maneuver;
  int distanceMeters;
  String streetName;
  int etaMinutes;
};

NavUpdate parseLine(const String& line) {
  // "NAV|TURN_LEFT|150|MG Road|4"
  NavUpdate update;
  int idx[4];
  int count = 0;
  for (int i = 0; i < (int)line.length() && count < 4; i++) {
    if (line.charAt(i) == '|') idx[count++] = i;
  }
  if (count < 4) {
    update.maneuver = "PARSE_ERROR";
    update.distanceMeters = 0;
    update.etaMinutes = 0;
    return update;
  }
  update.maneuver       = line.substring(idx[0] + 1, idx[1]);
  update.distanceMeters = line.substring(idx[1] + 1, idx[2]).toInt();
  update.streetName     = line.substring(idx[2] + 1, idx[3]);
  update.etaMinutes      = line.substring(idx[3] + 1).toInt();
  return update;
}

// Single free-text status line (e.g. "Advertising...", "Phone connected").
void showStatus(const String& status) {
  if (!displayReady) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("MotoNav");
  display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(status);
  display.display();
}

// Renders a parsed NavUpdate so the BLE data pipeline can be verified
// visually, not just via Serial Monitor.
void showNavUpdate(const NavUpdate& update) {
  if (!displayReady) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("MotoNav");
  display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SSD1306_WHITE);

  display.setCursor(0, 16);
  display.println(update.maneuver);

  display.setCursor(0, 28);
  display.printf("%d m  ETA %d min", update.distanceMeters, update.etaMinutes);

  display.setCursor(0, 44);
  // 128px wide / 6px per glyph at text size 1 = 21 chars per line
  display.println(update.streetName.substring(0, 21));

  display.display();
}

class NavWriteCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& connInfo) override {
    std::string chunk = characteristic->getValue();
    for (char c : chunk) {
      if (c == '\n') {
        NavUpdate update = parseLine(lineBuffer);
        Serial.printf("[MotoNav] %s | %dm | %s | ETA %dmin\n",
                      update.maneuver.c_str(), update.distanceMeters,
                      update.streetName.c_str(), update.etaMinutes);
        showNavUpdate(update);
        lineBuffer = "";
      } else {
        lineBuffer += c;
      }
    }
  }
};

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* server, NimBLEConnInfo& connInfo) override {
    Serial.println("[MotoNav] Phone connected");
    showStatus("Phone connected\nWaiting for nav data...");
  }
  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
    Serial.println("[MotoNav] Phone disconnected, re-advertising");
    showStatus("Phone disconnected\nRe-advertising...");
    NimBLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);

  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  displayReady = display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  if (!displayReady) {
    Serial.println("[MotoNav] SSD1306 OLED not found — check wiring/address, continuing without display");
  }

  String deviceName = "MotoNav_0001"; // TODO: derive suffix from chip ID, like BreatheBird did
  NimBLEDevice::init(deviceName.c_str());

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  NimBLEService* service = server->createService(SERVICE_UUID);

  NimBLECharacteristic* navDataChar = service->createCharacteristic(
      NAV_DATA_CHAR_UUID,
      NIMBLE_PROPERTY::WRITE
  );
  navDataChar->setCallbacks(new NavWriteCallbacks());

  statusChar = service->createCharacteristic(
      STATUS_CHAR_UUID,
      NIMBLE_PROPERTY::NOTIFY
  );
  // TODO: use statusChar to report device battery / button presses back
  // to the phone once that's needed

  service->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();

  Serial.println("[MotoNav] Advertising, waiting for phone...");
  showStatus("Advertising...\nWaiting for phone");
}

void loop() {
  delay(1000);
}
