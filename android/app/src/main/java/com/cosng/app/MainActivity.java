package com.cosng.app;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        lockToKioskIfDeviceOwner();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-assert the lock every time the app comes back to the foreground,
        // in case anything managed to briefly exit it.
        lockToKioskIfDeviceOwner();
    }

    private void lockToKioskIfDeviceOwner() {
        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(this, KioskDeviceAdminReceiver.class);
        if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
            // Whitelist only this app to be allowed into locked kiosk mode
            dpm.setLockTaskPackages(admin, new String[]{getPackageName()});
            startLockTask();
        }
    }
}
