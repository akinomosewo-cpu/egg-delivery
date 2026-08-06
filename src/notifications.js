// Push notifications via OneSignal — only runs inside the real native
// Android/iOS app (Capacitor). On the regular web/PWA version this quietly
// does nothing, so it's always safe to call these.

const ONESIGNAL_APP_ID = "adc2f2d9-08c1-49c8-a5f9-82df90369dc2";

function isNative() {
  return typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

export async function initNotifications() {
  if (!isNative()) return;
  try {
    const { OneSignal } = await import("onesignal-cordova-plugin");
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);
  } catch (e) {
    console.error("OneSignal init failed:", e);
  }
}

// Call when Admin unlocks the dashboard — tags this device as an admin device
export async function tagAsAdmin() {
  if (!isNative()) return;
  try {
    const { OneSignal } = await import("onesignal-cordova-plugin");
    OneSignal.User.addTag("role", "admin");
  } catch (e) {
    console.error("OneSignal tag failed:", e);
  }
}

// Call when a driver picks their name — ties this device to that specific driver,
// so a notification can be aimed at just them (not every driver's phone)
export async function tagAsDriver(driverId) {
  if (!isNative()) return;
  try {
    const { OneSignal } = await import("onesignal-cordova-plugin");
    OneSignal.login(driverId);
    OneSignal.User.addTag("role", "driver");
  } catch (e) {
    console.error("OneSignal tag failed:", e);
  }
}
