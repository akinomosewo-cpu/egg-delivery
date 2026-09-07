import { createClient } from "@supabase/supabase-js";

// Separate Supabase project from the main app (src/supabase.js) — this talks
// only to the warehouse attendance kiosk's own project/anon key, kept fully
// isolated from delivery/driver data.
export const warehouseSupabase = createClient(
  import.meta.env.VITE_WAREHOUSE_SUPABASE_URL,
  import.meta.env.VITE_WAREHOUSE_SUPABASE_ANON_KEY
);

export async function fetchEmployees() {
  const { data, error } = await warehouseSupabase
    .from("employees")
    .select("id, name, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

// All attendance events for one employee since a given date, oldest first.
export async function fetchAttendanceForEmployee(employeeId, sinceIso) {
  const { data, error } = await warehouseSupabase
    .from("attendance")
    .select("event_type, occurred_at")
    .eq("employee_id", employeeId)
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return data;
}
