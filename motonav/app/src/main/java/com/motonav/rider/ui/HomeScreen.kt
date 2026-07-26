package com.motonav.rider.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HomeScreen(
    isConnected: Boolean,
    onConnectClick: () -> Unit,
    onStartNavClick: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = if (isConnected) "Device connected" else "Device not connected",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onConnectClick) {
            Text(if (isConnected) "Disconnect" else "Connect to MotoNav device")
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onStartNavClick, enabled = isConnected) {
            Text("Start navigation (stub)")
        }
    }
}
