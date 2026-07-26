package com.motonav.rider.ble

import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.util.Log

/**
 * Phone-side BLE central. Scans for the ESP32 PoC device, connects, and
 * writes NavUpdate wire-lines to NAV_DATA_CHAR.
 *
 * TODO before this is production-ready:
 *  - Auto-reconnect on disconnect (don't require a manual re-tap)
 *  - setPreferredPhy(LE_2M, LE_2M) once connected, for lower latency;
 *    fall back to LE_CODED if RSSI is poor / writes start failing
 *  - requestConnectionPriority(CONNECTION_PRIORITY_HIGH) briefly around
 *    maneuver changes, BALANCED otherwise, to save phone + device power
 *  - Runtime permission handling (BLUETOOTH_SCAN / BLUETOOTH_CONNECT on API 31+)
 *  - Chunk writes that exceed the negotiated MTU
 */
class BleCentralManager(private val context: Context) {

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager.adapter
    private var gatt: BluetoothGatt? = null
    private var navDataChar: BluetoothGattCharacteristic? = null

    var onConnectionStateChanged: ((Boolean) -> Unit)? = null

    fun startScan() {
        val scanner = adapter?.bluetoothLeScanner ?: run {
            Log.e(TAG, "Bluetooth not available/enabled")
            return
        }
        scanner.startScan(scanCallback)
    }

    fun stopScan() {
        adapter?.bluetoothLeScanner?.stopScan(scanCallback)
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val name = result.device.name ?: return
            if (name.startsWith(BleConstants.DEVICE_NAME_PREFIX)) {
                stopScan()
                connect(result.device)
            }
        }
    }

    private fun connect(device: BluetoothDevice) {
        gatt = device.connectGatt(context, false, gattCallback)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            val connected = newState == BluetoothProfile.STATE_CONNECTED
            onConnectionStateChanged?.invoke(connected)
            if (connected) {
                g.discoverServices()
                // TODO: g.setPreferredPhy(BluetoothDevice.PHY_LE_2M, BluetoothDevice.PHY_LE_2M, ...)
            } else {
                navDataChar = null
                // TODO: auto-reconnect with backoff instead of just dropping
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            val service = g.getService(BleConstants.SERVICE_UUID) ?: return
            navDataChar = service.getCharacteristic(BleConstants.NAV_DATA_CHAR_UUID)
        }
    }

    /**
     * Writes one NavUpdate wire-line. Caller (NavigationManager's
     * callback) is expected to call this on every route progress /
     * banner instruction event.
     */
    fun sendNavLine(line: String) {
        val characteristic = navDataChar ?: return
        val g = gatt ?: return
        @Suppress("DEPRECATION")
        characteristic.value = line.toByteArray(Charsets.UTF_8)
        @Suppress("DEPRECATION")
        g.writeCharacteristic(characteristic)
    }

    fun disconnect() {
        gatt?.disconnect()
        gatt?.close()
        gatt = null
    }

    companion object {
        private const val TAG = "BleCentralManager"
    }
}
