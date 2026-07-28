import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Today's date as YYYY-MM-DD in local time
export const today = () => new Date().toLocaleDateString("en-CA");

// Upload a photo file to storage, return its public URL
export async function uploadPhoto(file) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${today()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("delivery-photos").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("delivery-photos").getPublicUrl(path);
  return data.publicUrl;
}

// Log an action to the event timeline (route_started, arrived, delivered, crates_submitted)
export async function logEvent({ driver_id, customer_id = null, delivery_id = null, event_type, detail = null }) {
  const { error } = await supabase.from("delivery_events").insert({ driver_id, customer_id, delivery_id, event_type, detail });
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

