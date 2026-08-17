package com.cosng.app;

import android.app.admin.DeviceAdminReceiver;

// Required by Android whenever an app becomes a "Device Owner" — this is
// what unlocks true kiosk lockdown (Lock Task Mode). This class itself
// doesn't need any custom logic; its presence is what Android checks for.
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
}
