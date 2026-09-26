import { useState, useEffect, useRef, useCallback } from "react";
import { T, Btn, Tag, NumInput, MediaCapture, SignaturePad, fmtQty } from "./ui";
import { uploadPhoto } from "../supabase";
import { tagAsDriver } from "../notifications";
import { queueAction, looksOffline } from "../offlineQueue";

// Offline data cache
// Writes drivers/customers/helpers/deliveries to IndexedDB on every
// successful server fetch. Reads them back when the app loads offline.
const CACHE_DB    = "egg-app-cache";
const CACHE_STORE = "snapshots";

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CACHE_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveCache(key, value) {
  try {
    const db = await openCacheDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      tx.objectStore(CACHE_STORE).put({ key, value, savedAt: Date.now() });
      tx.oncomplete = res;
      tx.onerror    = () => rej(tx.error);
    });
  } catch (e) { console.warn("[cache] save failed:", e); }
}

async function loadCache(key) {
  try {
    const db = await openCacheDB();
    return await new Promise((res, rej) => {
      const tx  = db.transaction(CACHE_STORE, "readonly");
      const req = tx.objectStore(CACHE_STORE).get(key);
      req.onsuccess = () => res(req.result ? req.result.value : null);
      req.onerror   = () => rej(req.error);
    });
  } catch { return null; }
}

const sizesLine = (d) => {
  const parts = [
    ["Big large", d.big_large_assigned],
    ["Small large", d.small_large_assigned],
    ["Medium", d.medium_assigned],
    ["Pullet", d.pullet_assigned],
    ["Extra", d.extra_assigned],
  ].filter(([, v]) => v > 0);
  return parts.length ? parts.map(([l, v]) => `${l}: ${v}`).join(" · ") : null;
};

const STATUS_LABEL = {
  pending: "Not started",
  in_transit: "On the way",
  arrived: "Arrived",
  delivered: "Delivered",
};

export default function DriverApp({
  drivers,
  customers,
  helpers,
  deliveries,
  openDebts,
  allDeliveries,
  claimDelivery,
  unclaimDelivery,
  updateStatus,
  submitPartialDelivery,
  markDelivered,
  resolveMissingCrates,
  collectMissingCrates,
  collectEmptyCrates,
  updateDriverLocation,
  addStockCount,
  stockCounts,
  availableStock,
}) {
  const [driverId, setDriverId] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [pickedHelpers, setPickedHelpers] = useState([]);
  const [openStop, setOpenStop] = useState(null);
  const [dc, setDc] = useState("");
  const [extraDelivered, setExtraDelivered] = useState("");
  const [emptyPickedUp, setEmptyPickedUp] = useState("");
  const [emptyLeft, setEmptyLeft] = useState("");
  const [stopPhotos, setStopPhotos] = useState([]);
  const [stopVideo, setStopVideo] = useState(null);
  const [missingEggs, setMissingEggs] = useState("");
  const [missingCrates, setMissingCrates] = useState("");
  const [backorderCrates, setBackorderCrates] = useState("");
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [signatureSkipped, setSignatureSkipped] = useState(false);
  const [payment, setPayment] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [offlineToast, setOfflineToast] = useState(null);

  // ---- Internal working copies of all data ----
  // These start from IndexedDB cache on mount, get updated when fresh server
  // data arrives, and get patched immediately when the driver does something
  // offline. This way the UI always reflects the driver's actions instantly,
  // regardless of network state. The server is the source of truth when
  // online; the local patch is the source of truth when offline.
  const [cachedDrivers,       setCachedDrivers]       = useState([]);
  const [cachedCustomers,     setCachedCustomers]     = useState([]);
  const [cachedHelpers,       setCachedHelpers]       = useState([]);
  const [cachedDeliveries,    setCachedDeliveries]    = useState([]);
  const [cachedOpenDebts,     setCachedOpenDebts]     = useState([]);
  const [cachedAllDeliveries, setCachedAllDeliveries] = useState([]);

  // Seed from IndexedDB on mount so the app is usable immediately offline
  useEffect(() => {
    (async () => {
      const [d, c, h, del, od, all] = await Promise.all([
        loadCache("drivers"),
        loadCache("customers"),
        loadCache("helpers"),
        loadCache("deliveries"),
        loadCache("openDebts"),
        loadCache("allDeliveries"),
      ]);
      if (d)   setCachedDrivers(d);
      if (c)   setCachedCustomers(c);
      if (h)   setCachedHelpers(h);
      if (del) setCachedDeliveries(del);
      if (od)  setCachedOpenDebts(od);
      if (all) setCachedAllDeliveries(all);
    })();
  }, []);

  // When fresh server data arrives, overwrite the cache. Deliberately doesn't
  // gate on navigator.onLine — that flag can get stuck stale, which would
  // otherwise stop customer/driver names from ever refreshing after
  // reconnecting. This is still safe: props only change here after App.jsx's
  // loadAll() completes an actual successful fetch, so by definition we're
  // online whenever this effect sees new data — an in-progress offline
  // session's local patches are never at risk of being overwritten.
  useEffect(() => {
    if (drivers       && drivers.length       > 0) { setCachedDrivers(drivers);             saveCache("drivers",       drivers); }
    if (customers     && customers.length     > 0) { setCachedCustomers(customers);          saveCache("customers",     customers); }
    if (helpers       && helpers.length       > 0) { setCachedHelpers(helpers);              saveCache("helpers",       helpers); }
    if (deliveries    && deliveries.length    > 0) { setCachedDeliveries(deliveries);        saveCache("deliveries",    deliveries); }
    if (openDebts     && openDebts.length     > 0) { setCachedOpenDebts(openDebts);          saveCache("openDebts",     openDebts); }
    if (allDeliveries && allDeliveries.length > 0) { setCachedAllDeliveries(allDeliveries);  saveCache("allDeliveries", allDeliveries); }
  }, [drivers, customers, helpers, deliveries, openDebts, allDeliveries]);

  // Always read from the local working copy — it's either fresh server data
  // (when online) or the locally patched version (when offline).
  // Props are used as immediate fallback while the IndexedDB cache loads async on mount.
  const _drivers       = cachedDrivers.length       > 0 ? cachedDrivers       : (drivers       || []);
  const _customers     = cachedCustomers.length     > 0 ? cachedCustomers     : (customers     || []);
  const _helpers       = cachedHelpers.length       > 0 ? cachedHelpers       : (helpers       || []);
  const _openDebts     = cachedOpenDebts.length     > 0 ? cachedOpenDebts     : (openDebts     || []);
  const _allDeliveries = cachedAllDeliveries.length > 0 ? cachedAllDeliveries : (allDeliveries || []);
  // Deliveries: use cache when offline (has local patches), props when online and cache is stale
  const _deliveries    = (!navigator.onLine && cachedDeliveries.length > 0)
    ? cachedDeliveries
    : (deliveries && deliveries.length > 0 ? deliveries : cachedDeliveries);


  const showOfflineToast = useCallback((msg) => {
    setOfflineToast(msg);
    setTimeout(() => setOfflineToast(null), 5000);
  }, []);

  const withOfflineQueue = useCallback(
    (actionName, fn) =>
      async (...args) => {
        try {
          return await fn(...args);
        } catch (err) {
          // Queue if offline — check navigator.onLine directly as primary signal,
          // fall back to error message pattern for cases where onLine is stale.
          const offline = !navigator.onLine || looksOffline(err);
          console.warn("[withOfflineQueue]", actionName, "offline:", offline, "err:", err?.message);
          if (offline) {
            await queueAction(actionName, args);
            showOfflineToast("📡 No signal — action saved and will send automatically once you're back online.");
            return "__queued__";
          } else {
            throw err;
          }
        }
      },
    [showOfflineToast]
  );
  const [collectingDebtId, setCollectingDebtId] = useState(null);
  const [collectingDebtType, setCollectingDebtType] = useState(null); // "missing" | "empty"
  const [collectAmount, setCollectAmount] = useState("");
  const [collectPhoto, setCollectPhoto] = useState(null);

  // Shared card for a single open crate debt — used both in the top
  // banner and the detailed list further down, so the same photo+amount
  // evidence flow is available everywhere, regardless of which driver
  // originally created the debt. `kind` distinguishes a missing-crates debt
  // from an empty-crates-left debt, since both key off a delivery id and
  // could otherwise collide in the collectingDebtId/collectingDebtType state.
  const renderDebtCard = (debt, busyState, setBusyState, kind = "missing") => {
    // Guard against stale cached data from before delivery `id` was included
    // in the allDeliveries query — without a real id, collecting would try to
    // update a delivery row with id "undefined" and fail. Pull-to-refresh
    // (the ↻ button) will replace the stale cache with fresh data.
    if (!debt.id) {
      const c0 = _customers.find((x) => x.id === debt.customer_id);
      return (
        <div key={`missing-id-${debt.customer_id}-${kind}`} style={{ background: "#FBEAE6", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{c0 ? c0.name : "…"}</div>
          <div style={{ fontSize: 12, color: T.mute }}>
            Tap ↻ at the top to refresh before collecting this one.
          </div>
        </div>
      );
    }
    const c = _customers.find((x) => x.id === debt.customer_id);
    const isCollecting = collectingDebtId === debt.id && collectingDebtType === kind;
    const owed = kind === "missing" ? debt.missing_crates : debt.empty_crates_left;
    const collectFn = kind === "missing" ? collectMissingCrates : collectEmptyCrates;
    const label = kind === "missing" ? "Collected the crates" : "Picked up the empty crates";
    const owedText = kind === "missing" ? `Owes ${owed} crate${owed !== 1 ? "s" : ""}` : `${owed} empty crate${owed !== 1 ? "s" : ""} left there`;
    return (
      <div key={debt.id} style={{ background: "#FBEAE6", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{c ? c.name : "…"}</div>
        <div style={{ fontSize: 12, color: T.mute, marginBottom: 10 }}>
          {owedText}
          {c && c.area ? ` · ${c.area}` : ""}
        </div>

        {!isCollecting ? (
          <Btn
            small
            full
            kind="green"
            onClick={() => {
              setCollectingDebtId(debt.id);
              setCollectingDebtType(kind);
              setCollectAmount("");
              setCollectPhoto(null);
            }}
          >
            {label}
          </Btn>
        ) : (
          <div style={{ background: "#fff", borderRadius: 10, padding: 12, border: `1.5px solid ${T.line}` }}>
            <div style={{ marginBottom: 10 }}>
              <NumInput
                label={`How many crates? (${owed} owed)`}
                value={collectAmount}
                onChange={setCollectAmount}
                width={120}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <MediaCapture
                photos={collectPhoto ? [collectPhoto] : []}
                onAddPhoto={(url) => setCollectPhoto(url)}
                onRemovePhoto={() => setCollectPhoto(null)}
                video={null}
                onSetVideo={() => {}}
                onRemoveVideo={() => {}}
                upload={uploadPhoto}
                maxPhotos={1}
                label="Photo of the crates (required)"
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="ghost" small onClick={() => { setCollectingDebtId(null); setCollectingDebtType(null); }}>
                Cancel
              </Btn>
              <Btn
                small
                kind="green"
                full
                disabled={busyState || collectAmount === "" || Number(collectAmount) <= 0 || !collectPhoto}
                onClick={async () => {
                  setBusyState(true);
                  const actionName = kind === "missing" ? "collectMissingCrates" : "collectEmptyCrates";
                  let result;
                  try {
                    result = await withOfflineQueue(actionName, collectFn)(debt.id, driverId, Number(collectAmount), collectPhoto);
                  } catch (err) {
                    // A genuine (non-offline) failure — leave the banner as-is so
                    // the driver can see it didn't go through and retry.
                    console.warn("[collect] failed:", err.message);
                    setBusyState(false);
                    return;
                  }
                  setBusyState(false);
                  // Only patch the local cache once the collection actually
                  // succeeded or was safely queued for replay — never on a
                  // hard failure, otherwise the banner would clear locally
                  // while the server still shows the debt as open, and it
                  // would reappear on the next successful sync.
                  const collected = Number(collectAmount);
                  const patchedList = (list) => list.map((d) => {
                    if (d.id !== debt.id) return d;
                    if (kind === "empty") {
                      return { ...d, empty_crates_picked_up: (Number(d.empty_crates_picked_up || 0) + collected) };
                    }
                    return { ...d, missing_crates: Math.max(0, Number(d.missing_crates || 0) - collected) };
                  });
                  setCachedDeliveries((prev) => patchedList(prev));
                  const base = cachedDeliveries.length ? cachedDeliveries : _deliveries;
                  saveCache("deliveries", patchedList(base));
                  const openDebtsBase = cachedOpenDebts.length ? cachedOpenDebts : _openDebts;
                  setCachedOpenDebts((prev) => patchedList(prev.length ? prev : openDebtsBase));
                  saveCache("openDebts", patchedList(openDebtsBase));
                  // Also patch allDeliveries cache (used by crateIssues banner)
                  setCachedAllDeliveries((prev) => patchedList(prev));
                  saveCache("allDeliveries", patchedList(cachedAllDeliveries.length ? cachedAllDeliveries : _allDeliveries));
                  setCollectingDebtId(null);
                  setCollectingDebtType(null);
                  setCollectAmount("");
                  setCollectPhoto(null);
                }}
              >
                {busyState ? "Saving…" : "Confirm collected"}
              </Btn>
            </div>
          </div>
        )}
      </div>
    );
  };
  const [stockForm, setStockForm] = useState({
    morning: { small: "", medium: "", large: "", photo: null, video: null },
    evening: { small: "", medium: "", large: "", photo: null, video: null },
  });
  const [stockBusy, setStockBusy] = useState(false);

  // Keep a stable reference to updateDriverLocation — App.jsx redefines this
  // function on every render (including its own 5-second polling refresh),
  // so putting it directly in the effect below would tear down and restart
  // the location watch constantly, causing repeated permission prompts.
  const updateDriverLocationRef = useRef(updateDriverLocation);
  useEffect(() => {
    updateDriverLocationRef.current = updateDriverLocation;
  }, [updateDriverLocation]);

  // App.jsx handles all queue replay via processQueue on the "online" event.
  // DriverApp just needs to refresh its cached deliveries when signal returns
  // so the UI reflects what was synced.
  useEffect(() => {
    const onOnline = () => {
      // Clear offline cache so fresh server data takes over on next render
      // (App.jsx will call loadAll which updates the props passed here)
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Quietly report this driver's live position while they're logged in —
  // only works while this screen is open and the phone is unlocked.
  //
  // Uses an active poll (ask for a fresh position every 20s) rather than
  // watchPosition's continuous stream — on Android's WebView, watchPosition
  // can silently stop delivering updates after the first reading (a known
  // OS/battery-optimization quirk), leaving the pin frozen forever. Actively
  // re-asking on a timer sidesteps that.
  useEffect(() => {
    if (!driverId || !("geolocation" in navigator)) return;

    const poll = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateDriverLocationRef.current(driverId, pos.coords.latitude, pos.coords.longitude);
        },
        (err) => console.error("Location error:", err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    };

    poll(); // fire immediately, don't wait for the first interval tick
    const intervalId = setInterval(poll, 20000);
    return () => clearInterval(intervalId);
  }, [driverId]);


  if (!driverId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 24 }}>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          Who is driving today?
        </div>
        {_drivers.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setDriverId(d.id);
              tagAsDriver(d.id);
            }}
            style={{
              padding: "18px 0",
              borderRadius: 12,
              border: `1.5px solid ${T.line}`,
              background: T.card,
              fontSize: 17,
              fontWeight: 800,
              color: T.ink,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {d.name}
          </button>
        ))}
      </div>
    );
  }

  const drv = _drivers.find((d) => d.id === driverId);
  // Helpers already riding with another driver on an unfinished delivery — hide them
  // from the picker so two drivers can't claim the same helper at once.
  const busyHelperIds = new Set(
    deliveries
      .filter((d) => d.driver_id && d.driver_id !== driverId && d.status !== "delivered")
      .flatMap((d) => d.helper_ids || [])
  );
  const pickableHelpers = _helpers.filter((h) => !busyHelperIds.has(h.id));
  const available = _deliveries.filter((d) => !d.driver_id && d.status === "pending");
  const myStops = _deliveries.filter((d) => d.driver_id === driverId);
  const pending = myStops.filter((d) => d.status !== "delivered");
  const done = myStops.filter((d) => d.status === "delivered");
  const stop = myStops.find((d) => d.id === openStop);
  const claiming = available.find((d) => d.id === claimingId);

  const toggleHelper = (id) => {
    setPickedHelpers((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) return cur; // capped at 2
      return [...cur, id];
    });
  };

  // ---- Claiming a delivery: pick 0-2 helpers, then confirm ----
  if (claiming) {
    const c = _customers.find((x) => x.id === claiming.customer_id);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Btn kind="ghost" small onClick={() => { setClaimingId(null); setPickedHelpers([]); }}>
          ← Back
        </Btn>
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{c ? c.name : "…"}</div>
          <div style={{ fontSize: 13, color: T.mute, marginBottom: 4 }}>{c && c.area}</div>
          {c && c.address && <div style={{ fontSize: 12, color: T.mute, marginBottom: 12 }}>📍 {c.address}</div>}
          <div style={{ background: T.tan, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 700, marginBottom: 18 }}>
            {fmtQty(claiming.crates_assigned, claiming.eggs_assigned)}
            {sizesLine(claiming) && <div style={{ fontSize: 12, fontWeight: 600, color: T.mute, marginTop: 4 }}>{sizesLine(claiming)}</div>}
            {claiming.price_due > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginTop: 6 }}>Price: ₦{Number(claiming.price_due).toLocaleString("en-NG")}</div>}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            Bringing anyone with you? (up to 2, optional)
          </div>
          {pickableHelpers.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mute, marginBottom: 16 }}>
              {helpers.length === 0
                ? "No helpers added yet — ask the Admin to add names in Manage."
                : "Everyone's out with another driver right now."}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {pickableHelpers.map((h) => {
                const picked = pickedHelpers.includes(h.id);
                return (
                  <button
                    key={h.id}
                    onClick={() => toggleHelper(h.id)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 999,
                      border: `1.5px solid ${picked ? T.ink : T.line}`,
                      background: picked ? T.greenBg : "#fff",
                      color: T.ink,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {picked ? "✓ " : ""}{h.name}
                  </button>
                );
              })}
            </div>
          )}

          <Btn
            full
            kind="green"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await withOfflineQueue("claimDelivery", claimDelivery)(claiming.id, driverId, pickedHelpers);
                if (result === "__queued__") {
                  // Offline: optimistically mark the delivery as claimed locally
                  // so it moves from "Available" into "My route" right away.
                  // The real DB update syncs when signal returns.
                  const patch = (list) => list.map((d) =>
                    d.id === claiming.id
                      ? { ...d, driver_id: driverId, helper_ids: pickedHelpers, status: "pending" }
                      : d
                  );
                  setCachedDeliveries((prev) => patch(prev));
                  saveCache("deliveries", patch(cachedDeliveries.length ? cachedDeliveries : _deliveries));
                  setClaimingId(null);
                  setPickedHelpers([]);
                } else if (result) {
                  setClaimingId(null);
                  setPickedHelpers([]);
                } else {
                  alert("Someone else just claimed this delivery. Pick another one.");
                  setClaimingId(null);
                  setPickedHelpers([]);
                }
              } catch (err) {
                console.error("[claim] failed:", err);
                alert("Could not claim: " + (err?.message || "unknown error") + "\n\nOnline: " + navigator.onLine);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Claiming…" : "Claim this delivery"}
          </Btn>
        </div>
      </div>
    );
  }

  // ---- Stop detail (claimed by me) ----
  if (stop) {
    const c = _customers.find((x) => x.id === stop.customer_id);
    const name = c ? c.name : "this customer";
    const stopHelperNames = (stop.helper_ids || []).map((id) => (_helpers.find((h) => h.id === id) || {}).name).filter(Boolean);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Btn kind="ghost" small onClick={() => setOpenStop(null)}>
          ← Back to route
        </Btn>
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{name}</div>
              <div style={{ fontSize: 13, color: T.mute, marginBottom: 2 }}>{c && c.area}</div>
              {c && c.address && <div style={{ fontSize: 12, color: T.mute, marginBottom: 6 }}>📍 {c.address}</div>}
            </div>
            <Tag color={T.mute} bg={T.tan}>
              {STATUS_LABEL[stop.status]}
            </Tag>
          </div>
          {stopHelperNames.length > 0 && (
            <div style={{ fontSize: 12, color: T.mute, marginBottom: 6 }}>With {stopHelperNames.join(", ")}</div>
          )}
          {c && c.phone && (
            <a href={`tel:${c.phone}`} style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
              Call {c.phone}
            </a>
          )}
          <div
            style={{
              background: T.tan,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 14,
              fontWeight: 700,
              margin: "14px 0 16px",
            }}
          >
            Assigned: {fmtQty(stop.crates_assigned, stop.eggs_assigned)}
            {sizesLine(stop) && <div style={{ fontSize: 12, fontWeight: 600, color: T.mute, marginTop: 4 }}>{sizesLine(stop)}</div>}
            {stop.price_due > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginTop: 6 }}>Price: ₦{Number(stop.price_due).toLocaleString("en-NG")}</div>}
          </div>

          {stop.status === "pending" && (
            <Btn
              full
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                // Patch locally first so the button updates instantly
                setCachedDeliveries((prev) => prev.map((d) => d.id === stop.id ? { ...d, status: "in_transit" } : d));
                try {
                  await withOfflineQueue("updateStatus", updateStatus)(stop.id, "in_transit", { driver_id: driverId, customer_id: stop.customer_id });
                } catch { /* already handled */ } finally { setBusy(false); }
              }}
            >
              {busy ? "Starting…" : `Start route to ${name}`}
            </Btn>
          )}

          {stop.status === "in_transit" && (
            <Btn
              full
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                // Patch locally first so the button updates instantly
                setCachedDeliveries((prev) => prev.map((d) => d.id === stop.id ? { ...d, status: "arrived" } : d));
                try {
                  await withOfflineQueue("updateStatus", updateStatus)(stop.id, "arrived", { driver_id: driverId, customer_id: stop.customer_id });
                } catch { /* already handled */ } finally { setBusy(false); }
              }}
            >
              {busy ? "Updating…" : "Arrived at customer's location"}
            </Btn>
          )}

          {stop.status === "arrived" && (() => {
            const alreadyDelivered = stop.crates_delivered || 0;
            const remaining = Math.max(0, stop.crates_assigned - alreadyDelivered);
            const thisVisit = dc === "" ? 0 : Number(dc);
            const projectedTotal = alreadyDelivered + thisVisit;
            const isFinalVisit = projectedTotal >= stop.crates_assigned && thisVisit > 0;
            const receiptRequired = !c || c.requires_receipt !== false;

            return (
              <>
                {alreadyDelivered > 0 && (
                  <div style={{ background: T.tan, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                    Already dropped off: {alreadyDelivered} of {stop.crates_assigned} crates
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  Crates of egg delivered
                  <span style={{ color: T.mute, fontWeight: 600 }}> (max {remaining})</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  <NumInput
                    label="Crates this trip"
                    value={dc}
                    onChange={(v) => {
                      if (v === "") return setDc("");
                      const n = Number(v);
                      setDc(n > remaining ? String(remaining) : v);
                    }}
                    width={120}
                  />
                  <NumInput label="Extra delivered" value={extraDelivered} onChange={setExtraDelivered} width={120} decimal fractions />
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Empty crate exchange at this stop</div>
                <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                  <NumInput label="Picked up" value={emptyPickedUp} onChange={setEmptyPickedUp} width={110} />
                  <NumInput label="Left with customer" value={emptyLeft} onChange={setEmptyLeft} width={140} />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <MediaCapture
                    photos={stopPhotos}
                    onAddPhoto={(url) => setStopPhotos((p) => [...p, url])}
                    onRemovePhoto={(i) => setStopPhotos((p) => p.filter((_, idx) => idx !== i))}
                    video={null}
                    onSetVideo={() => {}}
                    onRemoveVideo={() => {}}
                    upload={uploadPhoto}
                    maxPhotos={5}
                    label="Photos at this stop (at least 1 required)"
                  />
                </div>

                {!isFinalVisit && thisVisit > 0 && (
                  <div style={{ fontSize: 12, color: T.mute, marginBottom: 12 }}>
                    That leaves {stop.crates_assigned - projectedTotal} crates still to bring — this will be saved as a partial drop-off. No signature needed yet.
                  </div>
                )}

                {isFinalVisit && (
                  <>
                    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                      <NumInput label="Returned Cracked" value={missingCrates} onChange={setMissingCrates} width={120} />
                      <NumInput label="Owed to customer (short of eggs)" value={backorderCrates} onChange={setBackorderCrates} width={180} />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      {/* payment removed from driver form */}
                    </div>

                    {receiptRequired && (
                      <div style={{ marginBottom: 18 }}>
                        <MediaCapture
                          photos={receiptPhoto ? [receiptPhoto] : []}
                          onAddPhoto={(url) => setReceiptPhoto(url)}
                          onRemovePhoto={() => setReceiptPhoto(null)}
                          video={null}
                          onSetVideo={() => {}}
                          onRemoveVideo={() => {}}
                          upload={uploadPhoto}
                          maxPhotos={1}
                          label="Receipt photo (required)"
                        />
                      </div>
                    )}

                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Customer signature</div>
                      {signatureSkipped ? (
                        <div style={{ fontSize: 13, color: T.mute, fontWeight: 600 }}>
                          Skipped — customer not available.{" "}
                          <button
                            onClick={() => setSignatureSkipped(false)}
                            style={{ background: "none", border: "none", color: T.ink, fontWeight: 700, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                          >
                            Undo
                          </button>
                        </div>
                      ) : signatureUrl ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <img src={signatureUrl} alt="customer signature" style={{ width: 110, height: 46, objectFit: "contain", background: "#fff", border: `1.5px solid ${T.line}`, borderRadius: 6 }} />
                          <Btn kind="ghost" small onClick={() => setSignatureUrl(null)}>
                            Redo
                          </Btn>
                        </div>
                      ) : (
                        <>
                          <SignaturePad upload={uploadPhoto} onCapture={setSignatureUrl} />
                          <button
                            onClick={() => setSignatureSkipped(true)}
                            style={{ marginTop: 8, background: "none", border: "none", color: T.mute, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
                          >
                            Customer not available to sign
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}

                <Btn
                  full
                  kind="green"
                  disabled={
                    busy ||
                    thisVisit <= 0 ||
                    stopPhotos.length === 0 ||
                    (isFinalVisit && ((receiptRequired && !receiptPhoto) || (!signatureUrl && !signatureSkipped)))
                  }
                  onClick={async () => {
                    setBusy(true);
                    const crateExchange = {
                      extra: extraDelivered === "" ? 0 : Number(extraDelivered),
                      backorder: backorderCrates === "" ? 0 : Number(backorderCrates),
                      emptyPickedUp: emptyPickedUp === "" ? 0 : Number(emptyPickedUp),
                      emptyLeft: emptyLeft === "" ? 0 : Number(emptyLeft),
                    };
                    try {
                      if (isFinalVisit) {
                        await withOfflineQueue("markDelivered", markDelivered)(
                          stop.id,
                          thisVisit,
                          stopPhotos,
                          stopVideo,
                          missingEggs === "" ? 0 : Number(missingEggs),
                          missingCrates === "" ? 0 : Number(missingCrates),
                          signatureUrl,
                          {
                            bigLarge: 0,
                            smallLarge: 0,
                            medium: 0,
                            pullet: 0,
                          },
                          payment === "" ? 0 : Number(payment),
                          receiptPhoto,
                          crateExchange,
                          { driver_id: driverId, customer_id: stop.customer_id }
                        );
                        // Optimistically mark delivered locally so the ✅ shows immediately
                        setCachedDeliveries((prev) => prev.map((d) =>
                          d.id === stop.id
                            ? { ...d, status: "delivered", crates_delivered: (d.crates_delivered || 0) + thisVisit,
                                empty_crates_picked_up: (d.empty_crates_picked_up || 0) + crateExchange.emptyPickedUp,
                                empty_crates_left: crateExchange.emptyLeft,
                                backorder_crates: (d.backorder_crates || 0) + crateExchange.backorder,
                                extra_delivered: (d.extra_delivered || 0) + crateExchange.extra }
                            : d
                        ));
                      } else {
                        await withOfflineQueue("submitPartialDelivery", submitPartialDelivery)(stop.id, thisVisit, stopPhotos, stopVideo, crateExchange, {
                          driver_id: driverId,
                          customer_id: stop.customer_id,
                        });
                        // Optimistically update partial delivery locally
                        setCachedDeliveries((prev) => prev.map((d) =>
                          d.id === stop.id
                            ? { ...d, crates_delivered: (d.crates_delivered || 0) + thisVisit,
                                empty_crates_picked_up: (d.empty_crates_picked_up || 0) + crateExchange.emptyPickedUp,
                                empty_crates_left: crateExchange.emptyLeft,
                                backorder_crates: (d.backorder_crates || 0) + crateExchange.backorder,
                                extra_delivered: (d.extra_delivered || 0) + crateExchange.extra }
                            : d
                        ));
                      }
                    } catch (e) {
                      console.error("[markDelivered] failed:", e.message);
                    } finally {
                      setBusy(false);
                    }
                    setOpenStop(null);
                    setDc("");
                    setExtraDelivered("");
                    setEmptyPickedUp("");
                    setEmptyLeft("");
                    setStopPhotos([]);
                    setStopVideo(null);
                    setMissingEggs("");
                    setMissingCrates("");
                    setBackorderCrates("");
                    setSignatureUrl(null);
                    setSignatureSkipped(false);
                    setPayment("");
                    setReceiptPhoto(null);
                  }}
                >
                  {busy ? "Saving…" : isFinalVisit ? "✓ Mark delivered" : "Save partial delivery"}
                </Btn>
                {thisVisit <= 0 && (
                  <div style={{ fontSize: 12, color: T.mute, textAlign: "center", marginTop: 8 }}>
                    Enter how many crates you're dropping off this trip
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  // ---- Main screen: available pool + my claimed route ----
  const crateIssues = (() => {
    const byCustomer = {};
    _openDebts
      .forEach((d) => {
        const key = d.customer_id;
        if (!byCustomer[key]) byCustomer[key] = { customerId: key, owed: 0, owedDeliveryIds: [], backorder: 0, emptyLeft: 0, emptyLeftDate: null, emptyLeftDeliveryId: null };
        byCustomer[key].owed += Number(d.missing_crates || 0);
        byCustomer[key].owedDeliveryIds.push(d.id);
      });
    (_allDeliveries || [])
      .forEach((d) => {
        const key = d.customer_id;
        if (Number(d.backorder_crates || 0) > 0) {
          if (!byCustomer[key]) byCustomer[key] = { customerId: key, owed: 0, owedDeliveryIds: [], backorder: 0, emptyLeft: 0, emptyLeftDate: null, emptyLeftDeliveryId: null };
          byCustomer[key].backorder += Number(d.backorder_crates);
        }
        // Only flag empty crates if: value > 0, delivery is within 30 days,
        // and not already resolved (picked_up >= left means collected)
        const _emptyLeft = Number(d.empty_crates_left || 0);
        const _emptyPicked = Number(d.empty_crates_picked_up || 0);
        const _agedays = d.delivery_date
          ? (Date.now() - new Date(d.delivery_date).getTime()) / 86400000
          : 999;
        if (_emptyLeft > 0 && _agedays <= 30 && _emptyPicked < _emptyLeft) {
          if (!byCustomer[key]) byCustomer[key] = { customerId: key, owed: 0, owedDeliveryIds: [], backorder: 0, emptyLeft: 0, emptyLeftDate: null, emptyLeftDeliveryId: null };
          if (!byCustomer[key].emptyLeftDate || d.delivery_date > byCustomer[key].emptyLeftDate) {
            byCustomer[key].emptyLeft = _emptyLeft;
            byCustomer[key].emptyLeftDate = d.delivery_date;
            byCustomer[key].emptyLeftDeliveryId = d.id;
          }
        }
      });
    return Object.values(byCustomer)
      .map((c) => ({ ...c, name: (_customers.find((x) => x.id === c.customerId) || customers.find((x) => x.id === c.customerId) || {}).name || "a customer" }))
      .filter((c) => c.owed > 0 || c.backorder > 0 || c.emptyLeft > 0);
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {offlineToast && (
        <div style={{
          background: "#1a2a0a", color: "#c8f080", fontSize: 13, fontWeight: 600,
          padding: "10px 14px", borderRadius: 10,
        }}>
          {offlineToast}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{drv ? drv.name : ""}</div>
        <Btn kind="ghost" small onClick={() => setDriverId(null)}>
          Switch
        </Btn>
      </div>

      {crateIssues.length > 0 && (
        <div style={{ background: "#FBEAE6", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, color: T.red, fontSize: 14, marginBottom: 6 }}>⚠ Crates owed / missing</div>
          {crateIssues.map((c) => (
            <div key={c.customerId} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: T.red, fontWeight: 600, marginBottom: 6 }}>
                {c.name}
                {c.owed > 0 && ` · ${c.owed} crate${c.owed !== 1 ? "s" : ""} owed back`}
                {c.backorder > 0 && ` · ${c.backorder} backordered`}
                {c.emptyLeft > 0 && ` · ${c.emptyLeft} empty crate${c.emptyLeft !== 1 ? "s" : ""} left`}
              </div>
              {c.owed > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: c.emptyLeft > 0 ? 8 : 0 }}>
                  {_openDebts
                    .filter((debt) => c.owedDeliveryIds.includes(debt.id))
                    .map((debt) => renderDebtCard(debt, busy, setBusy, "missing"))}
                </div>
              )}
              {c.emptyLeft > 0 &&
                renderDebtCard({ id: c.emptyLeftDeliveryId, customer_id: c.customerId, empty_crates_left: c.emptyLeft }, busy, setBusy, "empty")}
            </div>
          ))}
        </div>
      )}

      {/* Available pool */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.mute, marginBottom: 8 }}>
          Available deliveries ({available.length})
        </div>
        {available.length === 0 && (
          <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 20, background: T.card, borderRadius: 12, border: `1.5px solid ${T.line}` }}>
            Nothing to claim right now.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {available.map((d) => {
            const c = _customers.find((x) => x.id === d.customer_id);
            return (
              <button
                key={d.id}
                onClick={() => setClaimingId(d.id)}
                style={{
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: `1.5px dashed ${T.yolkDark}`,
                  background: "#F5FBE6",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  width: "100%",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{c ? c.name : "…"}</div>
                  <div style={{ fontSize: 13, color: T.mute }}>
                    {c && c.area ? `${c.area} · ` : ""}
                    {fmtQty(d.crates_assigned, d.eggs_assigned)}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>Claim →</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* My route */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.mute, marginBottom: 8 }}>
          My route ({done.length}/{myStops.length})
        </div>

        {myStops.length === 0 && (
          <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 20 }}>
            You haven't claimed any deliveries yet.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {myStops.map((d) => {
            const c = _customers.find((x) => x.id === d.customer_id);
            const isDone = d.status === "delivered";
            const canReturn = d.status === "pending" && (d.crates_delivered || 0) === 0;
            const helperNames = (d.helper_ids || []).map((id) => (_helpers.find((h) => h.id === id) || {}).name).filter(Boolean);
            return (
              <div
                key={d.id}
                style={{
                  borderRadius: 12,
                  border: `1.5px solid ${isDone ? T.green : T.line}`,
                  background: isDone ? T.greenBg : T.card,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => {
                    if (!isDone) {
                      setOpenStop(d.id);
                      setDc("");
                      setExtraDelivered("");
                      setEmptyPickedUp("");
                      setEmptyLeft("");
                      setBackorderCrates("");
                      setStopPhotos([]);
                      setStopVideo(null);
                    }
                  }}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 16px",
                    border: "none",
                    background: "none",
                    cursor: isDone ? "default" : "pointer",
                    fontFamily: "inherit",
                    width: "100%",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{c ? c.name : "…"}</div>
                    <div style={{ fontSize: 13, color: T.mute }}>
                      {c && c.area ? `${c.area} · ` : ""}
                      {fmtQty(d.crates_assigned, d.eggs_assigned)}
                      {!isDone && ` · ${STATUS_LABEL[d.status]}`}
                      {helperNames.length > 0 && ` · with ${helperNames.join(", ")}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 22 }}>{isDone ? "✅" : d.status === "arrived" ? "📍" : d.status === "in_transit" ? "🚐" : "○"}</div>
                </button>
                {canReturn && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Return this delivery to ${c ? c.name : "the customer"} back to the pool? Any other driver can claim it.`)) {
                        withOfflineQueue("unclaimDelivery", unclaimDelivery)(d.id, driverId).then((res) => {
                          if (res === "__queued__") {
                            const unpatch = (list) => list.map((x) =>
                              x.id === d.id ? { ...x, driver_id: null, helper_ids: [], status: "pending" } : x
                            );
                            setCachedDeliveries((prev) => unpatch(prev));
                            saveCache("deliveries", unpatch(_deliveries));
                          }
                        }).catch(() => {});
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 16px",
                      border: "none",
                      borderTop: `1px solid ${T.line}`,
                      background: T.tan,
                      color: T.mute,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    ↩ Claimed by accident? Return this delivery
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {myStops.length > 0 && pending.length === 0 && (() => {
          const totalPickedUp = myStops.reduce((s, d) => s + Number(d.empty_crates_picked_up || 0), 0);
          const totalLeft = myStops.reduce((s, d) => s + Number(d.empty_crates_left || 0), 0);
          return (
            <div
              style={{
                background: T.greenBg,
                border: `1.5px solid ${T.green}`,
                borderRadius: 12,
                padding: 16,
                textAlign: "center",
                marginTop: 10,
              }}
            >
              <div style={{ fontWeight: 800, color: T.green, marginBottom: 4 }}>All stops done ✓</div>
              <div style={{ fontSize: 13, color: T.mute }}>
                Empty crates picked up today: <b>{totalPickedUp}</b>
                {totalLeft > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: T.red, fontWeight: 700 }}>{totalLeft} still left with customers</span>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Missing crates owed by customers — company-wide, any driver can collect */}
      {(() => {
        const allDebts = _openDebts;
        if (allDebts.length === 0) return null;
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.mute, marginBottom: 8 }}>
              Crates still owed by customers ({allDebts.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allDebts.map((debt) => renderDebtCard(debt, busy, setBusy))}
            </div>
          </div>
        );
      })()}

      {/* Warehouse counts — morning (start of shift) and evening (end of
          shift), each shared across all drivers, once per day per type */}
      {["morning", "evening"].map((type) => {
        const todayStr = new Date().toLocaleDateString("en-CA");
        const todayCount = (stockCounts || []).find((c) => c.work_date === todayStr && c.count_type === type);
        const label = type === "morning" ? "morning" : "end of shift";
        const question =
          type === "morning"
            ? "How many are left in the warehouse right now, before deliveries go out?"
            : "How many are left in the warehouse now that the shift is ending?";

        if (todayCount) {
          const who = (_drivers.find((d) => d.id === todayCount.driver_id) || {}).name || "A driver";
          return (
            <div key={type} style={{ background: T.tan, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14, opacity: 0.75 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, color: T.mute }}>
                {type === "morning" ? "Morning" : "End of shift"} count — done ✓
              </div>
              <div style={{ fontSize: 13, color: T.mute }}>
                {who} reported at{" "}
                {new Date(todayCount.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Small: <b>{todayCount.amount_small ?? "—"}</b> · Medium: <b>{todayCount.amount_medium ?? "—"}</b> · Large: <b>{todayCount.amount_large ?? "—"}</b>
              </div>
              {todayCount.photo_url && (
                <a href={todayCount.photo_url} target="_blank" rel="noreferrer">
                  <img
                    src={todayCount.photo_url}
                    alt="warehouse proof"
                    style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}`, marginTop: 8 }}
                  />
                </a>
              )}
              {todayCount.video_url && (
                <div style={{ marginTop: 6 }}>
                  <a href={todayCount.video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.ink, textDecoration: "underline" }}>
                    🎥 View proof video
                  </a>
                </div>
              )}
            </div>
          );
        }

        const s = stockForm[type];
        const setField = (field, value) => setStockForm((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
        const filled = s.small !== "" && s.medium !== "" && s.large !== "" && s.photo && s.video;

        return (
          <div key={type} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Report {label} warehouse count</div>
            <div style={{ fontSize: 12, color: T.mute, marginBottom: 10 }}>{question} A photo is required as proof.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <NumInput label="Small" value={s.small} onChange={(v) => setField("small", v)} width={90} />
              <NumInput label="Medium" value={s.medium} onChange={(v) => setField("medium", v)} width={90} />
              <NumInput label="Large" value={s.large} onChange={(v) => setField("large", v)} width={90} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <MediaCapture
                photos={s.photo ? [s.photo] : []}
                onAddPhoto={(url) => setField("photo", url)}
                onRemovePhoto={() => setField("photo", null)}
                video={s.video}
                onSetVideo={(url) => setField("video", url)}
                onRemoveVideo={() => setField("video", null)}
                upload={uploadPhoto}
                maxPhotos={1}
                label="Photo proof (required)"
              />
            </div>
            <Btn
              small
              full
              onClick={async () => {
                if (!filled) return;
                setStockBusy(true);
                await addStockCount(driverId, type, Number(s.small), Number(s.medium), Number(s.large), s.photo, s.video);
                setStockBusy(false);
                setStockForm((prev) => ({ ...prev, [type]: { small: "", medium: "", large: "", photo: null, video: null } }));
              }}
              disabled={stockBusy || !filled}
            >
              {stockBusy ? "Saving…" : "Submit count"}
            </Btn>
          </div>
        );
      })}
    </div>
  );
}
