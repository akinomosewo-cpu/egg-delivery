import { createClient } from "@supabase/supabase-js";
import { savePendingPhoto } from "./offlineQueue";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Today's date as YYYY-MM-DD in local time
export const today = () => new Date().toLocaleDateString("en-CA");

// Upload a photo to storage, return its public URL.
// If the network is unavailable or too slow, saves the photo locally
// to IndexedDB and returns a pending:// URL instead — the offline queue
// processor will upload it for real once signal returns, swapping in the
// real URL transparently. The rest of the app never needs to handle this.
export async function uploadPhoto(file) {
  const isVideo = file.type.startsWith("video/");
  const maxBytes = isVideo ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(
      isVideo
        ? `That video is too large (over ${maxMb}MB). Please record a shorter clip and try again.`
        : `That photo is too large (over ${maxMb}MB). Try again — most phone cameras save well under this.`
    );
  }

  // Try the real upload first
  if (navigator.onLine) {
    try {
      const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `${today()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const uploadPromise = supabase.storage.from("delivery-photos").upload(path, file);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 20000)
      );
      const { error } = await Promise.race([uploadPromise, timeoutPromise]);
      if (!error) {
        const { data } = supabase.storage.from("delivery-photos").getPublicUrl(path);
        return data.publicUrl;
      }
    } catch (e) {
      // fall through to offline save below
      console.warn("Upload failed, saving offline:", e.message);
    }
  }

  // No signal or upload failed — save locally and return a pending:// URL
  const pendingId = await savePendingPhoto(file);
  return pendingId;
}

// Calculate total storage used in the photo/video bucket by summing real file sizes.
// (The anon key can't read Supabase's billing API, so this adds it up directly —
// accurate, just calculated here instead of pulled from a dashboard.)
export async function getStorageUsage() {
  let totalBytes = 0;
  let fileCount = 0;
  const { data: rootItems, error } = await supabase.storage.from("delivery-photos").list("", { limit: 1000 });
  if (error) throw error;
  for (const item of rootItems || []) {
    if (item.id === null) {
      // it's a date folder — list what's inside it
      const { data: files } = await supabase.storage.from("delivery-photos").list(item.name, { limit: 1000 });
      for (const f of files || []) {
        totalBytes += (f.metadata && f.metadata.size) || 0;
        fileCount++;
      }
    } else {
      totalBytes += (item.metadata && item.metadata.size) || 0;
      fileCount++;
    }
  }
  return { totalBytes, fileCount };
}

export async function logEvent({ driver_id, customer_id = null, delivery_id = null, event_type, detail = null }) {
  const { error } = await supabase.from("delivery_events").insert({ driver_id, customer_id, delivery_id, event_type, detail, event_date: today() });
  if (error) console.error("logEvent failed:", error.message);
}

// ---- Browser notifications (fires only while the admin has this tab open) ----
export function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export function notify(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.svg" });
    } catch (e) {
      console.error("Notification failed:", e);
    }
  }
}

