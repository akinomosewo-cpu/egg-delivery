import { useEffect, useState, useCallback } from "react";
import { supabase, today, logEvent, requestNotificationPermission, notify } from "./supabase";
import { queueAction, getQueuedActions, removeQueuedAction, queueCount, looksOffline } from "./offlineQueue";
import { T } from "./components/ui";
import AdminPlan from "./components/AdminPlan";
import AdminDashboard from "./components/AdminDashboard";
import AdminEvents from "./components/AdminEvents";
import AdminManage from "./components/AdminManage";
import AdminReports from "./components/AdminReports";
import AdminMissingCrates from "./components/AdminMissingCrates";
import AdminDayList from "./components/AdminDayList";
import AdminMap from "./components/AdminMap";
import AdminStock from "./components/AdminStock";
import ActivityLogTable from "./components/ActivityLogTable";
import AdminBalances from "./components/AdminBalances";
import AdminCalendar from "./components/AdminCalendar";
import DriverApp from "./components/DriverApp";

const ADMIN_PIN = "8791"; // change this to change the admin password

export default function App() {
  const [device, setDevice] = useState("driver"); // driver-first: workers open this most
  const [adminTab, setAdminTab] = useState("plan");
  const [adminUnlocked, setAdminUnlocked] = useState(false); // always asks for the PIN fresh
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [crateReturns, setCrateReturns] = useState([]);
  const [events, setEvents] = useState([]);
  const [openDebts, setOpenDebts] = useState([]); // crates owed by customers, not yet collected back
  const [stockEntries, setStockEntries] = useState([]);
  const [allDeliveriesForStock, setAllDeliveriesForStock] = useState([]);
  const [stockCounts, setStockCounts] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [driverLocations, setDriverLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [error, setError] = useState(null);

  // ---- Load everything for today ----
  const loadAll = useCallback(async () => {
    try {
      const [drv, cus, hlp, del, ret, evt, debts, locs, stock, allDel, counts, payments] = await Promise.all([
        supabase.from("drivers").select("*").eq("active", true).order("name"),
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("helpers").select("*").eq("active", true).order("name"),
        supabase.from("deliveries").select("*").eq("delivery_date", today()).order("created_at"),
        supabase.from("crate_returns").select("*").eq("return_date", today()),
        supabase.from("delivery_events").select("*").order("event_date", { ascending: false }).order("created_at", { ascending: true }).limit(300),
        supabase.from("deliveries").select("*").gt("missing_crates", 0).eq("missing_crates_resolved", false).order("delivery_date"),
        supabase.from("driver_locations").select("*"),
        supabase.from("stock_entries").select("*"),
        supabase.from("deliveries").select("customer_id, crates_assigned, price_due, payment_collected, missing_crates, missing_crates_resolved, delivery_date"), // all-time — used for stock math and customer balances
        supabase.from("stock_counts").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("customer_payments").select("*").order("created_at", { ascending: false }),
      ]);
      const firstError = drv.error || cus.error || hlp.error || del.error || ret.error || evt.error || debts.error || locs.error || stock.error || allDel.error || counts.error || payments.error;
      if (firstError) throw firstError;
      setDrivers(drv.data);
      setCustomers(cus.data);
      setHelpers(hlp.data);
      setDeliveries(del.data);
      setCrateReturns(ret.data);
      setEvents(evt.data);
      setOpenDebts(debts.data);
      setDriverLocations(locs.data);
      setStockEntries(stock.data);
      setAllDeliveriesForStock(allDel.data);
      setStockCounts(counts.data);
      setCustomerPayments(payments.data);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "helpers" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, loadAll)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "delivery_events" }, (payload) => {
        loadAll();
        const row = payload.new;
        if (row.event_type === "delivered") notify("Delivery complete", "A driver just marked a stop delivered.");
        if (row.event_type === "crates_submitted") notify("Crates submitted", "A driver sent in their crate count.");
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  // Backup for realtime: silently re-fetch every 5 seconds in case a realtime
  // event gets missed (weak signal, brief disconnect, etc). No spinner, no
  // page reload — just quietly keeps the data current in the background.
  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Offline queue: process anything waiting whenever we come back online,
  // and check periodically too (some browsers don't fire 'online' reliably)
  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    let items;
    try {
      items = await getQueuedActions();
    } catch {
      return;
    }
    for (const item of items) {
      try {
        if (item.actionName === "updateStatus") {
          const [id, status, ctx] = item.args;
          await runUpdateStatus(id, status, ctx);
        }
        await removeQueuedAction(item.id);
      } catch (e) {
        if (!looksOffline(e)) await removeQueuedAction(item.id); // a real error, not just offline — drop it, don't retry forever
        break; // stop here, try the rest next time
      }
    }
    const remaining = await queueCount();
    setPendingSync(remaining);
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    queueCount().then(setPendingSync);
    processQueue();
    const interval = setInterval(processQueue, 15000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, [processQueue]);

  // Ask for notification permission once the admin unlocks the dashboard
  useEffect(() => {
    if (adminUnlocked) requestNotificationPermission();
  }, [adminUnlocked]);

  const syncNow = async () => {
    setSyncing(true);
    await loadAll();
    setTimeout(() => setSyncing(false), 400);
  };

  const unlockAdmin = () => setAdminUnlocked(true);

  const lockAdmin = () => setAdminUnlocked(false);

  const clearTodayData = async () => {
    const ok = window.confirm(
      "Clear ALL of today's deliveries, crate returns, and events?\n\nThis cannot be undone. Yesterday and earlier days are not affected."
    );
    if (!ok) return;
    const d = today();
    const [r1, r2, r3] = await Promise.all([
      supabase.from("deliveries").delete().eq("delivery_date", d),
      supabase.from("crate_returns").delete().eq("return_date", d),
      supabase.from("delivery_events").delete().eq("event_date", d),
    ]);
    const err = r1.error || r2.error || r3.error;
    if (err) alert("Could not clear: " + err.message);
    loadAll();
  };

  // ---- Actions ----
  const addDelivery = async (row) => {
    const { error } = await supabase.from("deliveries").insert({ ...row, delivery_date: row.delivery_date || today() });
    if (error) alert("Could not save: " + error.message);
    else loadAll();
  };

  const removeDelivery = async (id) => {
    const { error } = await supabase.from("deliveries").delete().eq("id", id).eq("status", "pending");
    if (error) alert("Could not remove: " + error.message);
    else loadAll();
  };

  // Claim an unassigned delivery — guarded so two drivers can't grab the same one.
  // Returns true if the claim succeeded, false if someone else beat them to it.
  const claimDelivery = async (id, driverId, helperIds) => {
    const { data, error } = await supabase
      .from("deliveries")
      .update({ driver_id: driverId, helper_ids: helperIds, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .is("driver_id", null)
      .select();
    if (error) {
      alert("Could not claim: " + error.message);
      loadAll();
      return false;
    }
    if (!data || data.length === 0) {
      loadAll();
      return false; // someone else already claimed it
    }
    await logEvent({ driver_id: driverId, customer_id: data[0].customer_id, delivery_id: id, event_type: "claimed" });
    loadAll();
    return true;
  };

  // Undo an accidental claim — only allowed before any progress has been made,
  // so nothing already photographed/delivered can get silently orphaned.
  const unclaimDelivery = async (id, driverId) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("driver_id, customer_id, status, crates_delivered")
      .eq("id", id)
      .single();
    if (e1) {
      alert("Could not undo: " + e1.message);
      return;
    }
    if (cur.driver_id !== driverId) {
      alert("This isn't your delivery to return.");
      loadAll();
      return;
    }
    if ((cur.crates_delivered || 0) > 0) {
      alert("Can't return this — some crates have already been delivered here.");
      return;
    }
    const { error } = await supabase
      .from("deliveries")
      .update({ driver_id: null, helper_ids: [], claimed_at: null, status: "pending", started_at: null })
      .eq("id", id);
    if (error) {
      alert("Could not undo: " + error.message);
      return;
    }
    await logEvent({ driver_id: driverId, customer_id: cur.customer_id, delivery_id: id, event_type: "unclaimed" });
    loadAll();
  };

  // Route status: pending -> in_transit -> arrived
  // Offline-aware: this doesn't need a photo, so it's the one action that
  // queues automatically and sends itself once signal comes back.
  const runUpdateStatus = async (id, status, ctx) => {
    const timeCol = status === "in_transit" ? { started_at: new Date().toISOString() } : status === "arrived" ? { arrived_at: new Date().toISOString() } : {};
    const { error } = await supabase.from("deliveries").update({ status, ...timeCol }).eq("id", id);
    if (error) throw error;
    await logEvent({
      driver_id: ctx.driver_id,
      customer_id: ctx.customer_id,
      delivery_id: id,
      event_type: status === "in_transit" ? "route_started" : "arrived",
    });
  };

  const updateStatus = async (id, status, ctx) => {
    if (!navigator.onLine) {
      await queueAction("updateStatus", [id, status, ctx]);
      setPendingSync((n) => n + 1);
      return;
    }
    try {
      await runUpdateStatus(id, status, ctx);
      loadAll();
    } catch (e) {
      if (looksOffline(e)) {
        await queueAction("updateStatus", [id, status, ctx]);
        setPendingSync((n) => n + 1);
      } else {
        alert("Could not update: " + e.message);
      }
    }
  };

  // Save a partial drop-off (driver couldn't carry the full order in one trip).
  // Accumulates onto whatever's already been delivered so far; does NOT complete the delivery.
  const submitPartialDelivery = async (id, addedCrates, newPhotos, ctx) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("crates_delivered, photo_urls")
      .eq("id", id)
      .single();
    if (e1) {
      alert("Could not save: " + e1.message);
      return;
    }
    const newTotal = (cur.crates_delivered || 0) + Number(addedCrates || 0);
    const mergedPhotos = [...(cur.photo_urls || []), ...newPhotos];
    const { error } = await supabase
      .from("deliveries")
      .update({ crates_delivered: newTotal, photo_urls: mergedPhotos, status: "arrived" })
      .eq("id", id);
    if (error) {
      alert("Could not save: " + error.message);
      return;
    }
    await logEvent({ driver_id: ctx.driver_id, customer_id: ctx.customer_id, delivery_id: id, event_type: "partial_delivered" });
    loadAll();
  };

  // Complete a delivery — called once cumulative delivered crates reach the assigned amount
  const markDelivered = async (id, addedCrates, photoUrls, videoUrl, missingEggs, missingCrates, signatureUrl, sizes, payment, receiptUrl, ctx) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("crates_delivered, photo_urls")
      .eq("id", id)
      .single();
    if (e1) {
      alert("Could not save: " + e1.message);
      return;
    }
    const finalCrates = (cur.crates_delivered || 0) + Number(addedCrates || 0);
    const mergedPhotos = [...(cur.photo_urls || []), ...photoUrls];
    const { error } = await supabase
      .from("deliveries")
      .update({
        status: "delivered",
        crates_delivered: finalCrates,
        eggs_delivered: 0,
        photo_urls: mergedPhotos,
        video_url: videoUrl,
        missing_eggs: missingEggs,
        missing_crates: missingCrates,
        signature_url: signatureUrl,
        big_large_delivered: sizes.bigLarge,
        small_large_delivered: sizes.smallLarge,
        medium_delivered: sizes.medium,
        pullet_delivered: sizes.pullet,
        extra_delivered: sizes.extra,
        payment_collected: payment,
        receipt_url: receiptUrl,
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
      .insert({ driver_id: driverId, crate_count: count, photo_urls: photoUrls, video_url: videoUrl, return_date: today() });
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

  // Driver's live position — upserted quietly in the background while their app is open
  const updateDriverLocation = async (driverId, lat, lng) => {
    await supabase.from("driver_locations").upsert({ driver_id: driverId, lat, lng, updated_at: new Date().toISOString() });
  };

  // One-time lookup: turn a customer's text address into map coordinates, save it so it's never re-looked-up
  const geocodeCustomer = async (customerId, lat, lng) => {
    await supabase.from("customers").update({ lat, lng }).eq("id", customerId);
  };

  const addStockEntry = async (amount, note, driverId) => {
    const { error } = await supabase.from("stock_entries").insert({ amount, note, driver_id: driverId || null });
    if (error) alert("Could not save: " + error.message);
    else loadAll();
  };

  // A driver's morning warehouse count — just a reference reading, doesn't
  // feed into the stock math itself. Shared once-a-day across all drivers.
  // Records a payment a customer makes later, paying down their outstanding
  // balance. Photo proof required.
  const recordPayment = async (customerId, amount, photoUrl, note) => {
    const { error } = await supabase.from("customer_payments").insert({ customer_id: customerId, amount, photo_url: photoUrl, note: note || null });
    if (error) alert("Could not save: " + error.message);
    else loadAll();
  };

  const addStockCount = async (driverId, amount, photoUrl) => {
    const { error } = await supabase.from("stock_counts").insert({ driver_id: driverId, amount, photo_url: photoUrl || null });
    if (error) alert("Could not save: " + error.message);
    else loadAll();
  };

  const addHelper = async (name) => {
    const { error } = await supabase.from("helpers").insert({ name });
    if (error) alert("Could not add: " + error.message);
    else loadAll();
  };

  const deactivateHelper = async (id) => {
    const { error } = await supabase.from("helpers").update({ active: false }).eq("id", id);
    if (error) alert("Could not remove: " + error.message);
    else loadAll();
  };

  // Mark a customer's owed crates as collected back
  const resolveMissingCrates = async (deliveryId, driverId) => {
    const { error } = await supabase
      .from("deliveries")
      .update({ missing_crates_resolved: true, missing_crates_resolved_at: new Date().toISOString() })
      .eq("id", deliveryId);
    if (error) {
      alert("Could not update: " + error.message);
      return;
    }
    if (driverId) {
      await logEvent({ driver_id: driverId, delivery_id: deliveryId, event_type: "debt_resolved" });
    }
    loadAll();
  };

  // Driver-facing collection: requires a photo, supports partial (some crates now, rest still owed)
  const collectMissingCrates = async (deliveryId, driverId, amountCollected, photoUrl) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("missing_crates, missing_crates_photos")
      .eq("id", deliveryId)
      .single();
    if (e1) {
      alert("Could not save: " + e1.message);
      return;
    }
    const remaining = Math.max(0, (cur.missing_crates || 0) - Number(amountCollected || 0));
    const resolved = remaining <= 0;
    const mergedPhotos = [...(cur.missing_crates_photos || []), photoUrl];
    const { error } = await supabase
      .from("deliveries")
      .update({
        missing_crates: remaining,
        missing_crates_photos: mergedPhotos,
        missing_crates_resolved: resolved,
        missing_crates_resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq("id", deliveryId);
    if (error) {
      alert("Could not save: " + error.message);
      return;
    }
    await logEvent({
      driver_id: driverId,
      delivery_id: deliveryId,
      event_type: "debt_resolved",
      detail: resolved ? "Fully collected" : `Collected ${amountCollected}, ${remaining} still owed`,
    });
    loadAll();
  };

  // ---- Layout ----
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "transparent",
        fontFamily: "'Helvetica Neue', 'Segoe UI', Arial, system-ui, sans-serif",
        letterSpacing: "-0.01em",
        color: T.ink,
        padding: "env(safe-area-inset-top, 0px) 0 calc(40px + env(safe-area-inset-bottom, 0px))",
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
                onClick={() => { setDevice(t.key); if (t.key === "driver") lockAdmin(); }}
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

        {!isOnline && (
          <div
            style={{
              background: "#3A3A32",
              color: "#F0E9C9",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            📡 No signal — Start route / Arrived taps are saved and will send automatically once you're back online.
            {pendingSync > 0 && ` (${pendingSync} waiting)`}
          </div>
        )}
        {isOnline && pendingSync > 0 && (
          <div
            style={{
              background: T.greenBg,
              color: T.green,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Syncing {pendingSync} saved action{pendingSync !== 1 ? "s" : ""}…
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
                { key: "today", label: "Today" },
                { key: "live", label: "Live" },
                { key: "map", label: "Map" },
                { key: "stock", label: "Stock" },
                { key: "log", label: "Log" },
                { key: "balances", label: "Balances" },
                { key: "calendar", label: "Calendar" },
                { key: "events", label: "Events" },
                { key: "missing", label: "Missing" },
                { key: "reports", label: "Reports" },
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
              {(adminTab === "live" || adminTab === "events") && (
                <button
                  onClick={clearTodayData}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    fontFamily: "inherit",
                    fontWeight: 700,
                    fontSize: 12,
                    color: T.red,
                    cursor: "pointer",
                    padding: "8px 2px 10px",
                  }}
                >
                  Clear today
                </button>
              )}
              <button
                onClick={lockAdmin}
                style={{
                  marginLeft: adminTab === "live" || adminTab === "events" ? 0 : "auto",
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
                helpers={helpers}
                deliveries={deliveries}
                addDelivery={addDelivery}
                removeDelivery={removeDelivery}
                availableStock={
                  stockEntries.reduce((s, e) => s + Number(e.amount || 0), 0) -
                  allDeliveriesForStock.reduce((s, d) => s + Number(d.crates_assigned || 0), 0)
                }
              />
            ) : adminTab === "live" ? (
              <AdminDashboard
                drivers={drivers}
                customers={customers}
                helpers={helpers}
                deliveries={deliveries}
                crateReturns={crateReturns}
                driverLocations={driverLocations}
              />
            ) : adminTab === "events" ? (
              <AdminEvents drivers={drivers} customers={customers} events={events} />
            ) : adminTab === "map" ? (
              <AdminMap drivers={drivers} customers={customers} driverLocations={driverLocations} deliveries={deliveries} geocodeCustomer={geocodeCustomer} />
            ) : adminTab === "stock" ? (
              <AdminStock stockEntries={stockEntries} deliveries={allDeliveriesForStock} addStockEntry={addStockEntry} drivers={drivers} stockCounts={stockCounts} />
            ) : adminTab === "log" ? (
              <ActivityLogTable events={events} drivers={drivers} customers={customers} showAccount={true} />
            ) : adminTab === "balances" ? (
              <AdminBalances customers={customers} allDeliveries={allDeliveriesForStock} customerPayments={customerPayments} recordPayment={recordPayment} />
            ) : adminTab === "calendar" ? (
              <AdminCalendar customers={customers} allDeliveries={allDeliveriesForStock} />
            ) : adminTab === "today" ? (
              <AdminDayList drivers={drivers} customers={customers} helpers={helpers} deliveries={deliveries} />
            ) : adminTab === "missing" ? (
              <AdminMissingCrates
                customers={customers}
                drivers={drivers}
                openDebts={openDebts}
                collectMissingCrates={collectMissingCrates}
              />
            ) : adminTab === "reports" ? (
              <AdminReports drivers={drivers} customers={customers} helpers={helpers} />
            ) : (
              <AdminManage
                drivers={drivers}
                customers={customers}
                helpers={helpers}
                addDriver={addDriver}
                deactivateDriver={deactivateDriver}
                addCustomer={addCustomer}
                deactivateCustomer={deactivateCustomer}
                addHelper={addHelper}
                deactivateHelper={deactivateHelper}
              />
            )}
          </>
        ) : (
          <DriverApp
            drivers={drivers}
            customers={customers}
            helpers={helpers}
            deliveries={deliveries}
            crateReturns={crateReturns}
            openDebts={openDebts}
            claimDelivery={claimDelivery}
            unclaimDelivery={unclaimDelivery}
            updateStatus={updateStatus}
            submitPartialDelivery={submitPartialDelivery}
            markDelivered={markDelivered}
            submitCrateReturn={submitCrateReturn}
            resolveMissingCrates={resolveMissingCrates}
            collectMissingCrates={collectMissingCrates}
            updateDriverLocation={updateDriverLocation}
            addStockCount={addStockCount}
            stockCounts={stockCounts}
            availableStock={
              stockEntries.reduce((s, e) => s + Number(e.amount || 0), 0) -
              allDeliveriesForStock.reduce((s, d) => s + Number(d.crates_assigned || 0), 0)
            }
          />
        )}
      </div>
    </div>
  );
}