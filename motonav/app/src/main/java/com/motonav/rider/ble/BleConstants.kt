package com.motonav.rider.ble

import java.util.UUID

/**
 * BLE protocol constants for MotoNav.
 *
 * Phone acts as GATT CENTRAL, the ESP32 PoC device acts as GATT
 * PERIPHERAL/server — opposite direction from BreatheBird, where the
 * ESP32 was the one broadcasting sensor data. Here the phone has the nav
 * data and writes it down to the device.
 *
 * Wire format (text line, '\n'-terminated, same idea as BreatheBird's
 * serial line format):
 *   "NAV|<maneuverCode>|<distanceMeters>|<streetName>|<etaMinutes>\n"
 *   e.g. "NAV|TURN_LEFT|150|MG Road|4\n"
 *
 * MTU is commonly ~20-23 bytes on an unrequested connection, so longer
 * street names can span multiple BLE writes. The firmware reassembles on
 * '\n', same pattern as BleModels.processChunk() in BreatheBird.
 */
object BleConstants {
    val SERVICE_UUID: UUID = UUID.fromString("a1b2c3d0-1234-5678-9abc-def012345678")
    val NAV_DATA_CHAR_UUID: UUID = UUID.fromString("a1b2c3d1-1234-5678-9abc-def012345678") // phone -> device, WRITE
    val STATUS_CHAR_UUID: UUID = UUID.fromString("a1b2c3d2-1234-5678-9abc-def012345678")   // device -> phone, NOTIFY
    val CCCD_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val DEVICE_NAME_PREFIX = "MotoNav_"

    const val LINE_PREFIX = "NAV"
    const val LINE_DELIMITER = "|"
    const val LINE_TERMINATOR = "\n"
}
