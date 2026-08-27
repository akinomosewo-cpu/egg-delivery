import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Today's date as YYYY-MM-DD in local time
export const today = () => new Date().toLocaleDateString("en-CA");

// Read a video file's duration (seconds) via a hidden <video> element.
// Falls back to null if the browser can't determine it (upload proceeds anyway).
function getVideoDurationSeconds(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadedmetadata = () => {
      cleanup();
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => {
      cleanup();
      resolve(null);
    };
    v.src = url;
  });
}

const MAX_VIDEO_SECONDS = 30 * 60;

// Upload a photo or video to storage, return its public URL.
// Guards against the "stuck forever" problem on weak connections: rejects
// files that are too large outright, and times out any upload that hangs.
//
// Videos used to be capped at 20MB with a flat 30s timeout — on a weak
// connection that timeout fired well before a real delivery-proof video
// (which can easily run past 30MB on newer phones) finished uploading. The
// timeout doesn't cancel the in-flight request, so the upload could keep
// running in the background after the driver saw an error and moved on,
// occasionally landing a truncated file in storage that then "stopped
// early" on playback in Admin. Photos stay capped (they're always small).
// Video has no byte-size cap — instead it's capped by duration (30 min,
// which is far more than any delivery-proof clip needs), and the upload
// timeout scales with file size so a legitimate long video isn't cut off.
export async function uploadPhoto(file) {
  const isVideo = file.type.startsWith("video/");
  const maxBytes = isVideo ? Infinity : 8 * 1024 * 1024; // photos only: 8MB
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`That photo is too large (over ${maxMb}MB). Try again — most phone cameras save well under this.`);
  }

  if (isVideo) {
    const durationSec = await getVideoDurationSeconds(file);
    if (durationSec !== null && durationSec > MAX_VIDEO_SECONDS) {
      throw new Error("That video is longer than 30 minutes. Trim it and try again.");
    }
  }

  const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
  const path = `${today()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // ~1s per 200KB, minimum 30s (covers photos and small clips), capped at the time
  // a 30-min video could plausibly need on a weak connection — long enough for any
  // legitimate upload, but no longer an unbounded wait.
  const timeoutMs = Math.min(20 * 60 * 1000, Math.max(30000, (file.size / (200 * 1024)) * 1000));

  const uploadPromise = supabase.storage.from("delivery-photos").upload(path, file);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload took too long — check your connection and try again.")), timeoutMs)
  );

  const { error } = await Promise.race([uploadPromise, timeoutPromise]);
  if (error) throw error;
  const { data } = supabase.storage.from("delivery-photos").getPublicUrl(path);
  return data.publicUrl;
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

