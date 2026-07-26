package com.motonav.rider

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import com.motonav.rider.ble.BleCentralManager
import com.motonav.rider.navigation.NavigationManager
import com.motonav.rider.ui.HomeScreen

/**
 * Barebones single-activity shell. No foreground service, no runtime
 * permission handling, no reconnect logic yet — see README "Known gaps".
 * Enough to prove: scan -> connect -> write a nav line -> device parses it.
 */
class MainActivity : ComponentActivity() {

    private lateinit var bleManager: BleCentralManager
    private lateinit var navigationManager: NavigationManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        bleManager = BleCentralManager(applicationContext)
        navigationManager = NavigationManager(applicationContext) { navUpdate ->
            bleManager.sendNavLine(navUpdate.toWireLine())
        }

        setContent {
            var connected by remember { mutableStateOf(false) }
            bleManager.onConnectionStateChanged = { connected = it }

            HomeScreen(
                isConnected = connected,
                onConnectClick = {
                    if (connected) bleManager.disconnect() else bleManager.startScan()
                },
                onStartNavClick = {
                    // TODO: replace with a real destination search UI —
                    // hardcoded coords are just for the PoC test ride
                    navigationManager.requestRoute(destinationLat = 0.0, destinationLon = 0.0)
                }
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        bleManager.disconnect()
        navigationManager.stop()
    }
}
