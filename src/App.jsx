import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, today, logEvent, requestNotificationPermission, notify } from "./supabase";
import { queueAction, getQueuedActions, removeQueuedAction, queueCount, looksOffline, getPendingPhotos, removePendingPhoto, isPendingUrl } from "./offlineQueue";
import { T } from "./components/ui";
import AdminPlan from "./components/AdminPlan";
import AdminDashboard from "./components/AdminDashboard";
import AdminManage from "./components/AdminManage";
import AdminReports from "./components/AdminReports";
import AdminMissingCrates from "./components/AdminMissingCrates";
import AdminDayList from "./components/AdminDayList";
import AdminMap from "./components/AdminMap";
import AdminStock from "./components/AdminStock";
import ActivityLogTable from "./components/ActivityLogTable";
import AdminBalances from "./components/AdminBalances";
import AdminCalendar from "./components/AdminCalendar";
import AdminWarehouseAttendance from "./components/AdminWarehouseAttendance";
import AdminReceipts from "./components/AdminReceipts";
import DriverApp from "./components/DriverApp";

const ADMIN_PIN = "1003"; // change this to change the admin password

// Gives a server call a deadline so a weak SIM can't leave the driver stuck
// on "Saving…" (or hold the sync queue) — after the deadline it's treated as
// offline and retried later. Every server write is safe to retry.
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("network timeout")), ms))]);

// Server data + anything done offline that hasn't synced yet. Applied on
// every refresh so the screen never "forgets" an offline action (status,
// claim, or crates dropped off). Each queued item disappears from the queue
// the moment the server has it, so nothing is ever counted twice.
const RANK = { pending: 0, in_transit: 1, arrived: 2, delivered: 3 };
async function withQueuedChanges(rows) {
  let items = [];
  try { items = await getQueuedActions(); } catch { return rows; }
  if (!items.length) return rows;
  const byId = new Map(rows.map((r) => [r.id, { ...r }]));
  for (const it of items) {
    const a = it.args || [];
    const d = byId.get(a[0]);
    if (!d) continue;
    const up = (st) => { if ((RANK[st] ?? 0) > (RANK[d.status] ?? 0)) d.status = st; };
    if (it.actionName === "claimDelivery") {
      if (!d.driver_id) { d.driver_id = a[1]; d.helper_ids = a[2] || []; }
    } else if (it.actionName === "updateStatus") {
      up(a[1]);
      if (a[1] === "in_transit" && !d.started_at) d.started_at = new Date(it.createdAt).toISOString();
    } else if (it.actionName === "submitPartialDelivery") {
      up("arrived");
      d.crates_delivered = (d.crates_delivered || 0) + Number(a[1] || 0);
    } else if (it.actionName === "markDelivered") {
      up("delivered");
      d.crates_delivered = (d.crates_delivered || 0) + Number(a[1] || 0);
    }
  }
  return rows.map((r) => byId.get(r.id));
}

export default function App() {
  const [device, setDevice] = useState("driver"); // driver-first: workers open this most
  const [adminTab, setAdminTab] = useState("plan");
  const [moreOpen, setMoreOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false); // always asks for the PIN fresh
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [helpers, setHelpers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [hiddenDeliveries, setHiddenDeliveries] = useState([]);
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
      const [drv, cus, hlp, del, hiddenDel, ret, evt, debts, locs, stock, allDel, counts, payments] = await Promise.all([
        supabase.from("drivers").select("*").eq("active", true).order("name"),
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("helpers").select("*").eq("active", true).order("name"),
        supabase.from("deliveries").select("*").eq("delivery_date", today()).is("hidden_until", null).order("created_at"),
        supabase.from("deliveries").select("*").gte("hidden_until", today()).order("delivery_date"),
        supabase.from("crate_returns").select("*").eq("return_date", today()),
        supabase.from("delivery_events").select("*").order("event_date", { ascending: false }).order("created_at", { ascending: true }).limit(300),
        supabase.from("deliveries").select("*").gt("missing_crates", 0).eq("missing_crates_resolved", false).order("delivery_date"),
        supabase.from("driver_locations").select("*"),
        supabase.from("stock_entries").select("*"),
        supabase.from("deliveries").select("customer_id, crates_assigned, price_due, payment_collected, missing_crates, missing_crates_resolved, backorder_crates, empty_crates_left, delivery_date"), // all-time — used for stock math and customer balances
        supabase.from("stock_counts").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("customer_payments").select("*").order("created_at", { ascending: false }),
      ]);
      const firstError = drv.error || cus.error || hlp.error || del.error || hiddenDel.error || ret.error || evt.error || debts.error || locs.error || stock.error || allDel.error || counts.error || payments.error;
      if (firstError) throw firstError;
      setDrivers(drv.data);
      setCustomers(cus.data);
      setHelpers(hlp.data);
      setDeliveries(await withQueuedChanges(del.data));
      setHiddenDeliveries(hiddenDel.data || []);
      setCrateReturns(ret.data);
      setEvents(evt.data);
      setOpenDebts(debts.data);
      setDriverLocations(locs.data);
      setStockEntries(stock.data);
      setAllDeliveriesForStock(allDel.data);
      setStockCounts(counts.data);
      setCustomerPayments(payments.data);
      setError(null);
      setIsOnline(true); // a successful fetch is proof of connectivity — more reliable than WebView's online/offline events
    } catch (e) {
      console.error(e);
      if (looksOffline(e)) setIsOnline(false);
      else setError(e.message || "Could not load data");
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

  // Offline queue: the ONE place queued actions get replayed. Runs on
  // reconnect, on app start, and every 15s. A lock stops overlapping runs
  // (the online event + the timer used to fire it twice at once).
  const queueRunning = useRef(false);
  const processQueue = useCallback(async () => {
    if (queueRunning.current) return;
    queueRunning.current = true;
    try {
      // Step 1: upload every photo saved to the device while offline.
      // Uploaded links are remembered in localStorage so a photo that
      // uploads on one attempt is never lost if the delivery itself has
      // to wait for the next attempt.
      let urlSwap = {};
      try { urlSwap = JSON.parse(localStorage.getItem("photoUrlSwap") || "{}"); } catch { urlSwap = {}; }
      let stillPending = new Set();
      try {
        const pending = await getPendingPhotos();
        for (const p of pending) {
          try {
            const file = new File([p.buffer], p.name, { type: p.type });
            const ext = (p.name.split(".").pop() || "jpg").toLowerCase();
            const path = `${today()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await withTimeout(supabase.storage.from("delivery-photos").upload(path, file), 30000);
            if (error) throw error;
            const { data } = supabase.storage.from("delivery-photos").getPublicUrl(path);
            urlSwap[p.id] = data.publicUrl;
            try { localStorage.setItem("photoUrlSwap", JSON.stringify(urlSwap)); } catch {}
            await removePendingPhoto(p.id);
          } catch (e) {
            // keep it on the device and try again next cycle — never give up
            console.warn("Photo upload failed, will retry:", e.message);
          }
        }
        stillPending = new Set((await getPendingPhotos()).map((p) => p.id));
      } catch (e) {
        console.warn("Photo queue check failed:", e.message);
      }

      // Swap pending:// links for real ones. If a photo is STILL waiting to
      // upload, the delivery isn't ready to sync yet — wait, so we never save
      // a broken pending:// link to the server.
      let notReady = false;
      const fix = (u) => {
        if (!isPendingUrl(u)) return u;
        if (urlSwap[u]) return urlSwap[u];
        if (stillPending.has(u)) { notReady = true; return u; }
        return null; // photo no longer on device — drop the dead link
      };
      const fixList = (urls) => (Array.isArray(urls) ? urls.map(fix).filter(Boolean) : urls);

      // Step 2: replay queued actions in the order they happened
      let items = [];
      try { items = await getQueuedActions(); } catch { return; }
      const blocked = new Set(); // deliveries that hit a real error — skip their later steps
      for (const item of items) {
        notReady = false;
        const deliveryId = item.args && item.args[0];
        if (blocked.has(deliveryId)) continue;
        try {
          if (item.actionName === "updateStatus") {
            const [id, status, ctx] = item.args;
            await withTimeout(runUpdateStatus(id, status, ctx), 15000);
          } else if (item.actionName === "claimDelivery") {
            const [id, driverId, helperIds] = item.args;
            await withTimeout(runClaimDelivery(id, driverId, helperIds), 15000);
          } else if (item.actionName === "submitPartialDelivery") {
            const [id, addedCrates, photos, crateExchange, ctx] = item.args;
            const fixedPhotos = fixList(photos);
            if (notReady) { blocked.add(deliveryId); continue; } // photos still uploading — this delivery waits, others carry on
            await withTimeout(runSubmitPartial(id, addedCrates, fixedPhotos, crateExchange, ctx), 20000);
          } else if (item.actionName === "markDelivered") {
            const a = [...item.args];
            a[2] = fixList(a[2]); // stop photos
            a[6] = fix(a[6]);     // signature
            a[9] = fix(a[9]);     // receipt
            a[12] = fixList(a[12]); // all receipt photos
            if (notReady) { blocked.add(deliveryId); continue; } // photos still uploading — this delivery waits, others carry on
            await withTimeout(runMarkDelivered(...a), 20000);
          }
          await removeQueuedAction(item.id);
        } catch (e) {
          if (looksOffline(e)) break; // signal dropped again — retry later, keep order
          // A real (non-network) error: status/claim actions are safe to drop,
          // but never throw away a delivery — leave it and retry next cycle.
          if (item.actionName === "updateStatus" || item.actionName === "claimDelivery") {
            console.warn("Dropping failed queued action:", item.actionName, e.message);
            await removeQueuedAction(item.id);
          } else {
            console.warn("Delivery sync failed, will retry:", e.message);
            blocked.add(deliveryId); // keep it queued; let other deliveries sync
          }
        }
      }
      setPendingSync(await queueCount());
      loadAll();
    } finally {
      queueRunning.current = false;
    }
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

  const updateDelivery = async (id, row) => {
    const { error } = await supabase.from("deliveries").update({
      customer_id: row.customer_id,
      crates_assigned: row.crates_assigned,
      eggs_assigned: 0,
      big_large_assigned: row.big_large_assigned,
      small_large_assigned: row.small_large_assigned,
      medium_assigned: row.medium_assigned,
      pullet_assigned: row.pullet_assigned,
      extra_assigned: row.extra_assigned,
      price_due: row.price_due,
      delivery_date: row.delivery_date,
    }).eq("id", id);
    if (error) alert("Could not update: " + error.message);
    else loadAll();
  };


  const hideDelivery = async (id) => {
    const { error } = await supabase.from("deliveries").update({ hidden_until: today() }).eq("id", id);
    if (error) alert("Could not hide: " + error.message);
    else loadAll();
  };

  const postponeDelivery = async (id) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const { error } = await supabase.from("deliveries").update({ hidden_until: tomorrowStr, delivery_date: tomorrowStr }).eq("id", id);
    if (error) alert("Could not postpone: " + error.message);
    else loadAll();
  };

  const unhideDelivery = async (id) => {
    const { error } = await supabase.from("deliveries").update({ hidden_until: null, delivery_date: today() }).eq("id", id);
    if (error) alert("Could not unhide: " + error.message);
    else loadAll();
  };

  // Claim an unassigned delivery — guarded so two drivers can't grab the same one.
  // Returns true if the claim succeeded, false if someone else beat them to it.
  // Sends a claim to the server. Returns true if claimed, false if another
  // driver got it first. Throws on network errors.
  const runClaimDelivery = async (id, driverId, helperIds) => {
    const { data, error } = await supabase
      .from("deliveries")
      .update({ driver_id: driverId, helper_ids: helperIds, claimed_at: new Date().toISOString() })
      .eq("id", id)
      .is("driver_id", null)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) {
      // Already claimed — fine if it was this same driver (a replay)
      const { data: cur } = await supabase.from("deliveries").select("driver_id").eq("id", id).single();
      return !!(cur && cur.driver_id === driverId);
    }
    await logEvent({ driver_id: driverId, customer_id: data[0].customer_id, delivery_id: id, event_type: "claimed" });
    return true;
  };

  const claimDelivery = async (id, driverId, helperIds) => {
    const ok = await withTimeout(runClaimDelivery(id, driverId, helperIds), 15000); // throws offline → DriverApp queues it
    loadAll();
    return ok;
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
  // Moves a delivery forward. Only ever moves it UP (pending → in_transit →
  // arrived) — a late replay of "arrived" can never knock a delivered stop back.
  const runUpdateStatus = async (id, status, ctx) => {
    const lowerThan = { in_transit: ["pending"], arrived: ["pending", "in_transit"] }[status];
    if (!lowerThan) return;
    const timeCol = status === "in_transit" ? { started_at: new Date().toISOString() } : { arrived_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("deliveries")
      .update({ status, ...timeCol })
      .eq("id", id)
      .in("status", lowerThan)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return; // already at or past this status — nothing to do
    await logEvent({
      driver_id: ctx.driver_id,
      customer_id: ctx.customer_id,
      delivery_id: id,
      event_type: status === "in_transit" ? "route_started" : "arrived",
    });
  };

  const updateStatus = async (id, status, ctx) => {
    await withTimeout(runUpdateStatus(id, status, ctx), 15000); // throws offline → DriverApp queues it
    loadAll();
  };

  // ---- Partial drop-off ----
  // Sends to the server; throws on any failure (used by live AND replay).
  const runSubmitPartial = async (id, addedCrates, newPhotos, crateExchange, ctx) => {
    // Each partial drop-off carries a unique opId. If it's already been
    // saved (e.g. signal dropped right after the server got it), skip it so
    // crates are never counted twice.
    if (ctx.opId) {
      const { data: seen, error: se } = await supabase
        .from("delivery_events").select("id")
        .eq("delivery_id", id).eq("event_type", "partial_delivered").eq("detail", ctx.opId).limit(1);
      if (se) throw se;
      if (seen && seen.length) return;
    }
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("status, crates_delivered, photo_urls, backorder_crates, empty_crates_picked_up, extra_delivered")
      .eq("id", id).single();
    if (e1 && e1.code === "PGRST116") return; // delivery was deleted — nothing to save
    if (e1) throw e1;
    if (cur.status === "delivered") return; // already completed — don't touch it
    const { error } = await supabase.from("deliveries").update({
      crates_delivered: (cur.crates_delivered || 0) + Number(addedCrates || 0),
      photo_urls: [...(cur.photo_urls || []), ...(newPhotos || [])],
      status: "arrived",
      extra_delivered: (cur.extra_delivered || 0) + Number(crateExchange?.extra || 0),
      backorder_crates: (cur.backorder_crates || 0) + Number(crateExchange?.backorder || 0),
      empty_crates_picked_up: (cur.empty_crates_picked_up || 0) + Number(crateExchange?.emptyPickedUp || 0),
      empty_crates_left: Number(crateExchange?.emptyLeft || 0),
    }).eq("id", id).neq("status", "delivered");
    if (error) throw error;
    await logEvent({ driver_id: ctx.driver_id, customer_id: ctx.customer_id, delivery_id: id, event_type: "partial_delivered", detail: ctx.opId || null });
  };

  const submitPartialDelivery = async (id, addedCrates, newPhotos, crateExchange, ctx) => {
    const opCtx = { ...ctx, opId: ctx.opId || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    try {
      if (!navigator.onLine) throw new Error("offline");
      await withTimeout(runSubmitPartial(id, addedCrates, newPhotos, crateExchange, opCtx), 20000);
      loadAll();
    } catch (e) {
      // No signal — save on the device, show it as done, sync later
      await queueAction("submitPartialDelivery", [id, addedCrates, newPhotos, crateExchange, opCtx]);
      setPendingSync(await queueCount());
      setDeliveries((prev) => prev.map((d) => d.id === id ? {
        ...d, status: "arrived",
        crates_delivered: (d.crates_delivered || 0) + Number(addedCrates || 0),
        photo_urls: [...(d.photo_urls || []), ...(newPhotos || [])],
      } : d));
    }
  };

  // ---- Final delivery ----
  // Sends to the server; throws on any failure (used by live AND replay).
  // Safe to run twice: if the stop is already delivered it does nothing,
  // so a slow-but-successful request followed by a replay can't double-count.
  const runMarkDelivered = async (id, addedCrates, photoUrls, videoUrl, missingEggs, missingCrates, signatureUrl, sizes, payment, receiptUrl, crateExchange, ctx, receiptUrls) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("status, crates_delivered, photo_urls, backorder_crates, empty_crates_picked_up, extra_delivered")
      .eq("id", id).single();
    if (e1 && e1.code === "PGRST116") return; // delivery was deleted — nothing to save
    if (e1) throw e1;
    if (cur.status === "delivered") return; // already saved — nothing to do
    const s = sizes || {};
    const row = {
      status: "delivered",
      crates_delivered: (cur.crates_delivered || 0) + Number(addedCrates || 0),
      eggs_delivered: 0,
      photo_urls: [...(cur.photo_urls || []), ...(photoUrls || [])],
      video_url: videoUrl || null,
      missing_eggs: missingEggs || 0,
      missing_crates: missingCrates || 0,
      signature_url: signatureUrl || null,
      big_large_delivered: s.bigLarge || 0,
      small_large_delivered: s.smallLarge || 0,
      medium_delivered: s.medium || 0,
      pullet_delivered: s.pullet || 0,
      extra_delivered: (cur.extra_delivered || 0) + Number(crateExchange?.extra || 0),
      backorder_crates: (cur.backorder_crates || 0) + Number(crateExchange?.backorder || 0),
      empty_crates_picked_up: (cur.empty_crates_picked_up || 0) + Number(crateExchange?.emptyPickedUp || 0),
      empty_crates_left: Number(crateExchange?.emptyLeft || 0),
      payment_collected: payment || 0,
      receipt_url: receiptUrl || (receiptUrls && receiptUrls[0]) || null,
      delivered_at: new Date().toISOString(),
    };
    if (Array.isArray(receiptUrls) && receiptUrls.length) row.receipt_urls = receiptUrls;
    let { error } = await supabase.from("deliveries").update(row).eq("id", id).neq("status", "delivered");
    if (error && row.receipt_urls && /receipt_urls/i.test(error.message || "")) {
      // receipt_urls column missing on this database — save without it
      delete row.receipt_urls;
      ({ error } = await supabase.from("deliveries").update(row).eq("id", id).neq("status", "delivered"));
    }
    if (error) throw error;
    await logEvent({ driver_id: ctx.driver_id, customer_id: ctx.customer_id, delivery_id: id, event_type: "delivered" });
  };

  const markDelivered = async (...args) => {
    const [id, addedCrates, photoUrls] = args;
    try {
      if (!navigator.onLine) throw new Error("offline");
      await withTimeout(runMarkDelivered(...args), 20000);
      loadAll();
    } catch (e) {
      // No signal — save on the device, show it as delivered, sync later
      await queueAction("markDelivered", args);
      setPendingSync(await queueCount());
      setDeliveries((prev) => prev.map((d) => d.id === id ? {
        ...d, status: "delivered",
        crates_delivered: (d.crates_delivered || 0) + Number(addedCrates || 0),
        photo_urls: [...(d.photo_urls || []), ...(photoUrls || [])],
        delivered_at: new Date().toISOString(),
      } : d));
    }
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

  const clearStockEntries = async () => {
    const ok = window.confirm("Clear all stock entries? This resets the warehouse stock count to zero. This cannot be undone.");
    if (!ok) return;
    const { error } = await supabase.from("stock_entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) alert("Could not clear: " + error.message);
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

  // A driver's warehouse count — morning (start of shift) or evening (end of
  // shift), split by egg size. Just a reference reading, doesn't feed into
  // the stock math itself. Shared once-per-type-per-day across all drivers.
  const addStockCount = async (driverId, countType, small, medium, large, photoUrl, videoUrl) => {
    const { error } = await supabase.from("stock_counts").insert({
      driver_id: driverId,
      count_type: countType,
      amount_small: small,
      amount_medium: medium,
      amount_large: large,
      photo_url: photoUrl || null,
      video_url: videoUrl || null,
    });
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

  // Driver-facing collection of empty crates left with a customer — same shape
  // as collectMissingCrates: requires a photo, supports partial pickup.
  const collectEmptyCrates = async (deliveryId, driverId, amountCollected, photoUrl) => {
    const { data: cur, error: e1 } = await supabase
      .from("deliveries")
      .select("empty_crates_left, empty_crates_photos")
      .eq("id", deliveryId)
      .single();
    if (e1) {
      alert("Could not save: " + e1.message);
      return;
    }
    const remaining = Math.max(0, (cur.empty_crates_left || 0) - Number(amountCollected || 0));
    const resolved = remaining <= 0;
    const mergedPhotos = [...(cur.empty_crates_photos || []), photoUrl];
    const { error } = await supabase
      .from("deliveries")
      .update({
        empty_crates_left: remaining,
        empty_crates_photos: mergedPhotos,
      })
      .eq("id", deliveryId);
    if (error) {
      alert("Could not save: " + error.message);
      return;
    }
    await logEvent({
      driver_id: driverId,
      delivery_id: deliveryId,
      event_type: "empty_crates_collected",
      detail: resolved ? "All empty crates picked up" : `Picked up ${amountCollected}, ${remaining} still left`,
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
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16, borderBottom: `1.5px solid ${T.line}`, flexWrap: "wrap", position: "relative" }}>
              {[
                { key: "plan", label: "Plan" },
                { key: "today", label: "Today" },
                { key: "live", label: "Live" },
                { key: "map", label: "Map" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setAdminTab(t.key); setMoreOpen(false); }}
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
              {(() => {
                const moreTabs = [
                  { key: "stock", label: "Stock" },
                  { key: "log", label: "Log" },
                  { key: "balances", label: "Balances" },
                  { key: "calendar", label: "Calendar" },
                  { key: "missing", label: "Missing" },
                  { key: "receipts", label: "Receipts" },
                  { key: "reports", label: "Reports" },
                  { key: "manage", label: "Manage" },
                  { key: "attendance", label: "Warehouse Attendance" },
                ];
                const activeInMore = moreTabs.find((t) => t.key === adminTab);
                return (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setMoreOpen((o) => !o)}
                      style={{
                        background: "none",
                        border: "none",
                        fontFamily: "inherit",
                        fontWeight: 800,
                        fontSize: 14,
                        padding: "8px 2px 10px",
                        cursor: "pointer",
                        color: activeInMore ? T.ink : T.mute,
                        borderBottom: activeInMore ? `3px solid ${T.yolk}` : "3px solid transparent",
                        marginBottom: -1.5,
                      }}
                    >
                      {activeInMore ? activeInMore.label : "More"} ▾
                    </button>
                    {moreOpen && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          zIndex: 20,
                          background: T.paper,
                          border: `1.5px solid ${T.line}`,
                          borderRadius: 10,
                          boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                          minWidth: 150,
                          overflow: "hidden",
                        }}
                      >
                        {moreTabs.map((t) => (
                          <button
                            key={t.key}
                            onClick={() => { setAdminTab(t.key); setMoreOpen(false); }}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              background: adminTab === t.key ? T.tan : "none",
                              border: "none",
                              fontFamily: "inherit",
                              fontWeight: 700,
                              fontSize: 13,
                              padding: "10px 14px",
                              cursor: "pointer",
                              color: T.ink,
                            }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {adminTab === "live" && (
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
                  marginLeft: adminTab === "live" ? 0 : "auto",
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
                updateDelivery={updateDelivery}
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
                driverLocations={driverLocations}
                onHide={hideDelivery}
                onPostpone={postponeDelivery}
                onUnhide={unhideDelivery}
              />
            ) : adminTab === "map" ? (
              <AdminMap drivers={drivers} customers={customers} driverLocations={driverLocations} deliveries={deliveries} geocodeCustomer={geocodeCustomer} />
            ) : adminTab === "stock" ? (
              <AdminStock stockEntries={stockEntries} deliveries={allDeliveriesForStock} addStockEntry={addStockEntry} clearStockEntries={clearStockEntries} drivers={drivers} stockCounts={stockCounts} />
            ) : adminTab === "log" ? (
              <ActivityLogTable events={events} drivers={drivers} customers={customers} showAccount={true} />
            ) : adminTab === "balances" ? (
              <AdminBalances customers={customers} allDeliveries={allDeliveriesForStock} customerPayments={customerPayments} recordPayment={recordPayment} />
            ) : adminTab === "calendar" ? (
              <AdminCalendar customers={customers} allDeliveries={allDeliveriesForStock} />
            ) : adminTab === "today" ? (
              <AdminDayList drivers={drivers} customers={customers} helpers={helpers} deliveries={deliveries} hiddenDeliveries={hiddenDeliveries} onHide={hideDelivery} onPostpone={postponeDelivery} onUnhide={unhideDelivery} onDelete={removeDelivery} />
            ) : adminTab === "missing" ? (
              <AdminMissingCrates
                customers={customers}
                drivers={drivers}
                openDebts={openDebts}
                collectMissingCrates={collectMissingCrates}
                allDeliveries={allDeliveriesForStock}
                collectEmptyCrates={collectEmptyCrates}
              />
            ) : adminTab === "receipts" ? (
              <AdminReceipts deliveries={deliveries} allDeliveries={allDeliveriesForStock} customers={customers} drivers={drivers} />
            ) : adminTab === "reports" ? (
              <AdminReports drivers={drivers} customers={customers} helpers={helpers} />
            ) : adminTab === "attendance" ? (
              <AdminWarehouseAttendance />
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
            setDeliveries={setDeliveries}
            openDebts={openDebts}
            claimDelivery={claimDelivery}
            unclaimDelivery={unclaimDelivery}
            updateStatus={updateStatus}
            submitPartialDelivery={submitPartialDelivery}
            markDelivered={markDelivered}
            resolveMissingCrates={resolveMissingCrates}
            collectMissingCrates={collectMissingCrates}
            collectEmptyCrates={collectEmptyCrates}
            updateDriverLocation={updateDriverLocation}
            addStockCount={addStockCount}
            stockCounts={stockCounts}
            availableStock={
              stockEntries.reduce((s, e) => s + Number(e.amount || 0), 0) -
              allDeliveriesForStock.reduce((s, d) => s + Number(d.crates_assigned || 0), 0)
            }
            allDeliveries={allDeliveriesForStock}
          />
        )}
      </div>
    </div>
  );
}
