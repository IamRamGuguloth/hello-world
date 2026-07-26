/*
 * MotoNav PoC receiver — ESP32-C3
 *
 * Bare GATT server: advertises as "MotoNav_0001", exposes one WRITE
 * characteristic that the phone app writes nav wire-lines to. No display
 * wiring yet — this parses and Serial.prints, so you can validate the
 * phone -> BLE -> device leg on the bench before touching a TFT.
 *
 * Same reassembly idea as BreatheBird's processChunk()/lineBuffer: BLE
 * writes may be MTU-chunked, so we buffer until we see '\n'.
 *
 * Library: NimBLE-Arduino (lighter + more reliable than the stock ESP32
 * BLE stack — same choice made for BreatheBird's firmware).
 */

#include <NimBLEDevice.h>

#define SERVICE_UUID        "a1b2c3d0-1234-5678-9abc-def012345678"
#define NAV_DATA_CHAR_UUID  "a1b2c3d1-1234-5678-9abc-def012345678"
#define STATUS_CHAR_UUID    "a1b2c3d2-1234-5678-9abc-def012345678"

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

class NavWriteCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo& connInfo) override {
    std::string chunk = characteristic->getValue();
    for (char c : chunk) {
      if (c == '\n') {
        NavUpdate update = parseLine(lineBuffer);
        Serial.printf("[MotoNav] %s | %dm | %s | ETA %dmin\n",
                      update.maneuver.c_str(), update.distanceMeters,
                      update.streetName.c_str(), update.etaMinutes);
        // TODO: render on display instead of Serial.printf once wired up
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
  }
  void onDisconnect(NimBLEServer* server, NimBLEConnInfo& connInfo, int reason) override {
    Serial.println("[MotoNav] Phone disconnected, re-advertising");
    NimBLEDevice::startAdvertising();
  }
};

void setup() {
  Serial.begin(115200);

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
}

void loop() {
  delay(1000);
}
