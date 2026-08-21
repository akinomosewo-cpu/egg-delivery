package com.cosng.app;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Bundle;
import android.provider.MediaStore;
import com.getcapacitor.BridgeActivity;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        lockToKioskIfDeviceOwner();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-assert every time the app comes back to the foreground, in
        // case anything managed to briefly interrupt it.
        lockToKioskIfDeviceOwner();
    }

    private void lockToKioskIfDeviceOwner() {
        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(this, KioskDeviceAdminReceiver.class);
        if (dpm == null || !dpm.isDeviceOwnerApp(getPackageName())) return;

        // Allow this app, plus whatever camera app this specific tablet
        // actually has, to run while locked — otherwise Lock Task Mode
        // blocks the camera app entirely and the system falls back to a
        // generic file picker instead.
        dpm.setLockTaskPackages(admin, getAllowedPackages());

        // Force this app to always be the home screen — no chooser, no
        // flash of the real launcher, even right after a reboot.
        IntentFilter homeFilter = new IntentFilter(Intent.ACTION_MAIN);
        homeFilter.addCategory(Intent.CATEGORY_HOME);
        homeFilter.addCategory(Intent.CATEGORY_DEFAULT);
        dpm.addPersistentPreferredActivity(admin, homeFilter, new ComponentName(this, MainActivity.class));

        startLockTask();
    }

    private String[] getAllowedPackages() {
        Set<String> packages = new HashSet<>();
        packages.add(getPackageName());

        Intent photoIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        ResolveInfo photoApp = getPackageManager().resolveActivity(photoIntent, PackageManager.MATCH_DEFAULT_ONLY);
        if (photoApp != null) packages.add(photoApp.activityInfo.packageName);

        Intent videoIntent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        ResolveInfo videoApp = getPackageManager().resolveActivity(videoIntent, PackageManager.MATCH_DEFAULT_ONLY);
        if (videoApp != null) packages.add(videoApp.activityInfo.packageName);

        // The system's built-in document/file picker — sometimes what
        // actually shows instead of the camera when a chooser is involved
        packages.add("com.android.documentsui");
        packages.add("com.google.android.documentsui");
        packages.add("com.android.externalstorage");
        packages.add("com.android.providers.media");
        packages.add("com.android.providers.media.module");

        return packages.toArray(new String[0]);
    }
}
