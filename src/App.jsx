import { useEffect, useState, useCallback } from "react";
import { supabase, today, logEvent, requestNotificationPermission, notify } from "./supabase";
import { T } from "./components/ui";
import AdminPlan from "./components/AdminPlan";
import AdminDashboard from "./components/AdminDashboard";
import AdminEvents from "./components/AdminEvents";
import AdminManage from "./components/AdminManage";
import DriverApp from "./components/DriverApp";

const ADMIN_PIN = "8791"; // change this to change the admin password

export default function App() {
  const [device, setDevice] = useState("driver"); // driver-first: workers open this most
  const [adminTab, setAdminTab] = useState("plan");
  const [adminUnlocked, setAdminUnlocked] = useState(() => localStorage.getItem("adminUnlocked") === "true");
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [crateReturns, setCrateReturns] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  // ---- Load everything for today ----
  const loadAll = useCallback(async () => {
    try {
      const [drv, cus, del, ret, evt] = await Promise.all([
        supabase.from("drivers").select("*").eq("active", true).order("name"),
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("deliveries").select("*").eq("delivery_date", today()).order("created_at"),
        supabase.from("crate_returns").select("*").eq("return_date", today()),
        supabase.from("delivery_events").select("*").order("event_date", { ascending: false }).order("created_at", { ascending: true }).limit(300),
      ]);
      const firstError = drv.error || cus.error || del.error || ret.error || evt.error;
      if (firstError) throw firstError;
      setDrivers(drv.data);
      setCustomers(cus.data);
      setDeliveries(del.data);
      setCrateReturns(ret.data);
      setEvents(evt.data);
      setError(null);
    } catch (e) {
      console.error(e);
      setError(e.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Realtime: any change re-syncs everyone, and pings the admin on new deliveries ----
  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "crate_returns" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, loadAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_events" }, (payload) => {
        loadAll();
        const row = payload.new;
        if (row.event_type === "delivered") notify("Delivery complete", "A driver just marked a stop delivered.");
        if (row.event_type === "crates_submitted") notify("Crates submitted", "A driver sent in their crate count.");
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  // Ask for notification permission once the admin unlocks the dashboard
  useEffect(() => {
    if (adminUnlocked) requestNotificationPermission();
  }, [adminUnlocked]);

  const syncNow = async () => {
    setSyncing(true);
    await loadAll();
    setTimeout(() => setSyncing(false), 400);
  };

  const unlockAdmin = () => {
    setAdminUnlocked(true);
    localStorage.setItem("adminUnlocked", "true");
  };

  const lockAdmin = () => {
    setAdminUnlocked(false);
    localStorage.removeItem("adminUnlocked");
  };

  // ---- Actions ----
  const addDelivery = async (row) => {
    const { error } = await supabase.from("deliveries").insert({ ...row, delivery_date: today() });
    if (error) alert("Could not save: " + error.message);
    else loadAll();
  };

  const removeDelivery = async (id) => {
    const { error } = await supabase.from("deliveries").delete().eq("id", id).eq("status", "pending");
    if (error) alert("Could not remove: " + error.message);
    else loadAll();
  };

  // Route status: pending -> in_transit -> arrived
  const updateStatus = async (id, status, ctx) => {
    const timeCol = status === "in_transit" ? { started_at: new Date().toISOString() } : status === "arrived" ? { arrived_at: new Date().toISOString() } : {};
    const { error } = await supabase.from("deliveries").update({ status, ...timeCol }).eq("id", id);
    if (error) {
      alert("Could not update: " + error.message);
      return;
    }
    await logEvent({
      driver_id: ctx.driver_id,
      customer_id: ctx.customer_id,
      delivery_id: id,
      event_type: status === "in_transit" ? "route_started" : "arrived",
    });
    loadAll();
  };

  const markDelivered = async (id, crates, photoUrls, videoUrl, ctx) => {
    const { error } = await supabase
      .from("deliveries")
      .update({
        status: "delivered",
        crates_delivered: crates,
        eggs_delivered: 0,
        photo_urls: photoUrls,
        video_url: videoUrl,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      alert("Could not save: " + error.message);
      return;
    }
    await logEvent({ driver_id: ctx.driver_id, customer_id: ctx.customer_id, delivery_id: id, event_type: "delivered" });
    loadAll();
  };

  const submitCrateReturn = async (driverId, count, photoUrls, videoUrl) => {
    const { error } = await supabase
      .from("crate_returns")
      .insert({ driver_id: driverId, crate_count: count, photo_urls: photoUrls, video_url: videoUrl });
    if (error) {
      alert("Could not send: " + error.message);
      return;
    }
    await logEvent({ driver_id: driverId, event_type: "crates_submitted" });
    loadAll();
  };

  const addDriver = async (name) => {
    const { error } = await supabase.from("drivers").insert({ name });
    if (error) alert("Could not add: " + error.message);
    else loadAll();
  };

  const deactivateDriver = async (id) => {
    const { error } = await supabase.from("drivers").update({ active: false }).eq("id", id);
    if (error) alert("Could not remove: " + error.message);
    else loadAll();
  };

  const addCustomer = async (row) => {
    const { error } = await supabase.from("customers").insert(row);
    if (error) alert("Could not add: " + error.message);
    else loadAll();
  };

  const deactivateCustomer = async (id) => {
    const { error } = await supabase.from("customers").update({ active: false }).eq("id", id);
    if (error) alert("Could not remove: " + error.message);
    else loadAll();
  };

  // ---- Layout ----
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.paper,
        fontFamily: "'Helvetica Neue', 'Segoe UI', Arial, system-ui, sans-serif",
        letterSpacing: "-0.01em",
        color: T.ink,
        padding: "0 0 40px",
      }}
    >
      <style>{`@keyframes pulse { 0%,100% {opacity:1} 50% {opacity:.35} }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }`}</style>

      <div style={{ maxWidth: 460, margin: "0 auto", padding: "14px 16px 0" }}>
        {/* Mode switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <div style={{ display: "flex", background: T.tan, borderRadius: 12, padding: 4, flex: 1 }}>
            {[
              { key: "driver", label: "Driver" },
              { key: "admin", label: "Admin" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setDevice(t.key)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 9,
                  border: "none",
                  fontFamily: "inherit",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  background: device === t.key ? T.ink : "transparent",
                  color: device === t.key ? T.paper : T.mute,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={syncNow}
            title="Refresh data"
            style={{
              width: 44,
              borderRadius: 12,
              border: `1.5px solid ${T.line}`,
              background: T.card,
              fontSize: 17,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: syncing ? "spin 0.6s linear" : "none",
            }}
          >
            ↻
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "#FBEAE6",
              color: T.red,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            ⚠ {error} — check your internet connection.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", color: T.mute, padding: 50 }}>Loading…</div>
        ) : device === "admin" && !adminUnlocked ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 30 }}>
            <div style={{ fontWeight: 900, fontSize: 22 }}>Admin</div>
            <div style={{ color: T.mute, fontSize: 13, fontWeight: 600 }}>Enter PIN to continue</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 99,
                    border: `2px solid ${pinError ? T.red : T.yolkDark}`,
                    background: pinEntry.length > i ? (pinError ? T.red : T.yolkDark) : "transparent",
                  }}
                />
              ))}
            </div>
            {pinError && (
              <div style={{ color: T.red, fontSize: 13, fontWeight: 700 }}>Wrong PIN — try again</div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 70px)", gap: 10, marginTop: 6 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
                k === "" ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      setPinError(false);
                      if (k === "⌫") {
                        setPinEntry((p) => p.slice(0, -1));
                        return;
                      }
                      const next = (pinEntry + k).slice(0, 4);
                      setPinEntry(next);
                      if (next.length === 4) {
                        if (next === ADMIN_PIN) {
                          unlockAdmin();
                          setPinEntry("");
                        } else {
                          setPinError(true);
                          setPinEntry("");
                        }
                      }
                    }}
                    style={{
                      height: 62,
                      borderRadius: 16,
                      border: `1.5px solid ${T.line}`,
                      background: T.card,
                      fontSize: 22,
                      fontWeight: 800,
                      color: T.ink,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {k}
                  </button>
                )
              )}
            </div>
          </div>
        ) : device === "admin" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16, borderBottom: `1.5px solid ${T.line}`, flexWrap: "wrap" }}>
              {[
                { key: "plan", label: "Plan" },
                { key: "live", label: "Live" },
                { key: "events", label: "Events" },
                { key: "manage", label: "Manage" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAdminTab(t.key)}
                  style={{
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                    fontWeight: 800,
                    fontSize: 14,
                    padding: "8px 2px 10px",
                    cursor: "pointer",
                    color: adminTab === t.key ? T.ink : T.mute,
                    borderBottom: adminTab === t.key ? `3px solid ${T.yolk}` : "3px solid transparent",
                    marginBottom: -1.5,
                  }}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={lockAdmin}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  fontFamily: "inherit",
                  fontWeight: 700,
                  fontSize: 12,
                  color: T.mute,
                  cursor: "pointer",
                  padding: "8px 2px 10px",
                }}
              >
                Lock
              </button>
            </div>
            {adminTab === "plan" ? (
              <AdminPlan
                drivers={drivers}
                customers={customers}
                deliveries={deliveries}
                addDelivery={addDelivery}
                removeDelivery={removeDelivery}
              />
            ) : adminTab === "live" ? (
              <AdminDashboard
                drivers={drivers}
                customers={customers}
                deliveries={deliveries}
                crateReturns={crateReturns}
              />
            ) : adminTab === "events" ? (
              <AdminEvents drivers={drivers} customers={customers} events={events} />
            ) : (
              <AdminManage
                drivers={drivers}
                customers={customers}
                addDriver={addDriver}
                deactivateDriver={deactivateDriver}
                addCustomer={addCustomer}
                deactivateCustomer={deactivateCustomer}
              />
            )}
          </>
        ) : (
          <DriverApp
            drivers={drivers}
            customers={customers}
            deliveries={deliveries}
            crateReturns={crateReturns}
            updateStatus={updateStatus}
            markDelivered={markDelivered}
            submitCrateReturn={submitCrateReturn}
          />
        )}
      </div>
    </div>
  );
}
