package com.motonav.rider.navigation

import com.motonav.rider.ble.BleConstants

/**
 * Simplified maneuver types actually rendered on-device. Maps down from
 * Mapbox's much richer maneuver type/modifier taxonomy — the device only
 * needs enough to pick an icon, not the full vocabulary.
 * See NavigationManager for the eventual Mapbox -> WireManeuver mapping.
 */
enum class WireManeuver {
    TURN_LEFT,
    TURN_RIGHT,
    SLIGHT_LEFT,
    SLIGHT_RIGHT,
    SHARP_LEFT,
    SHARP_RIGHT,
    UTURN,
    STRAIGHT,
    ROUNDABOUT,
    MERGE,
    ARRIVE,
    UNKNOWN
}

/**
 * The compact data actually pushed over BLE — deliberately small.
 */
data class NavUpdate(
    val maneuver: WireManeuver,
    val distanceMeters: Int,
    val streetName: String,
    val etaMinutes: Int
) {
    fun toWireLine(): String {
        val safeStreet = streetName.replace("|", "/").replace("\n", " ").take(24)
        return listOf(
            BleConstants.LINE_PREFIX,
            maneuver.name,
            distanceMeters.toString(),
            safeStreet,
            etaMinutes.toString()
        ).joinToString(BleConstants.LINE_DELIMITER) + BleConstants.LINE_TERMINATOR
    }
}
