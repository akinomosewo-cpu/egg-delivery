// Push notifications via Capacitor's own official push plugin, talking
// directly to Firebase — no OneSignal, no Cordova-plugin timing quirks.
// Only runs inside the real native Android/iOS app; on the web/PWA version
// this quietly does nothing, so it's always safe to call these.

import { supabase } from "./supabase";

function isNative() {
  return typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

let currentToken = null;
let pendingRole = null; // { role: 'admin' } or { role: 'driver', driverId }

async function saveToken() {
  if (!currentToken || !pendingRole) return;
  const { error } = await supabase.from("device_tokens").upsert(
    {
      token: currentToken,
      role: pendingRole.role,
      driver_id: pendingRole.driverId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) console.error("Could not save push token:", error);
  else console.log("[notifications] token saved for role:", pendingRole.role);
}

export async function initNotifications() {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    PushNotifications.addListener("registration", (token) => {
      console.log("[notifications] registered, token received");
      currentToken = token.value;
      saveToken();
    });

    PushNotifications.addListener("registrationError", (err) => {
      console.error("[notifications] registration error:", JSON.stringify(err));
    });

    const perm = await PushNotifications.requestPermissions();
    console.log("[notifications] permission result:", perm.receive);
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {
    console.error("Push init failed:", e);
  }
}

// Call when Admin unlocks the dashboard — tags this device as an admin device
export function tagAsAdmin() {
  if (!isNative()) return;
  pendingRole = { role: "admin" };
  saveToken();
}

// Call when a driver picks their name — ties this device to that specific driver
export function tagAsDriver(driverId) {
  if (!isNative()) return;
  pendingRole = { role: "driver", driverId };
  saveToken();
}