import { useState, useEffect, useRef } from "react";
import { T, Btn, Tag, NumInput, MediaCapture, SignaturePad, fmtQty } from "./ui";
import { uploadPhoto } from "../supabase";
import { tagAsDriver } from "../notifications";

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
  crateReturns,
  openDebts,
  claimDelivery,
  unclaimDelivery,
  updateStatus,
  submitPartialDelivery,
  markDelivered,
  submitCrateReturn,
  resolveMissingCrates,
  collectMissingCrates,
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
  const [stopPhotos, setStopPhotos] = useState([]);
  const [stopVideo, setStopVideo] = useState(null);
  const [missingEggs, setMissingEggs] = useState("");
  const [missingCrates, setMissingCrates] = useState("");
  const [signatureUrl, setSignatureUrl] = useState(null);
  const [signatureSkipped, setSignatureSkipped] = useState(false);
  const [payment, setPayment] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [retCount, setRetCount] = useState("");
  const [retPhotos, setRetPhotos] = useState([]);
  const [retVideo, setRetVideo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [collectingDebtId, setCollectingDebtId] = useState(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectPhoto, setCollectPhoto] = useState(null);
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
        {drivers.map((d) => (
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

  const drv = drivers.find((d) => d.id === driverId);
  const available = deliveries.filter((d) => !d.driver_id && d.status === "pending");
  const myStops = deliveries.filter((d) => d.driver_id === driverId);
  const pending = myStops.filter((d) => d.status !== "delivered");
  const done = myStops.filter((d) => d.status === "delivered");
  const myReturn = crateReturns.find((r) => r.driver_id === driverId);
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
    const c = customers.find((x) => x.id === claiming.customer_id);
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
          {helpers.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mute, marginBottom: 16 }}>
              No helpers added yet — ask the Admin to add names in Manage.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {helpers.map((h) => {
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
              const ok = await claimDelivery(claiming.id, driverId, pickedHelpers);
              setBusy(false);
              if (ok) {
                setClaimingId(null);
                setPickedHelpers([]);
              } else {
                alert("Someone else just claimed this delivery. Pick another one.");
                setClaimingId(null);
                setPickedHelpers([]);
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
    const c = customers.find((x) => x.id === stop.customer_id);
    const name = c ? c.name : "this customer";
    const stopHelperNames = (stop.helper_ids || []).map((id) => (helpers.find((h) => h.id === id) || {}).name).filter(Boolean);

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
                await updateStatus(stop.id, "in_transit", { driver_id: driverId, customer_id: stop.customer_id });
                setBusy(false);
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
                await updateStatus(stop.id, "arrived", { driver_id: driverId, customer_id: stop.customer_id });
                setBusy(false);
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
                  {alreadyDelivered > 0 ? "How many crates this trip?" : "How many crates delivered?"}
                  <span style={{ color: T.mute, fontWeight: 600 }}> (max {remaining})</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
                </div>

                <div style={{ marginBottom: 18 }}>
                  <MediaCapture
                    photos={stopPhotos}
                    onAddPhoto={(url) => setStopPhotos((p) => [...p, url])}
                    onRemovePhoto={(i) => setStopPhotos((p) => p.filter((_, idx) => idx !== i))}
                    video={stopVideo}
                    onSetVideo={setStopVideo}
                    onRemoveVideo={() => setStopVideo(null)}
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
                    <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                      <NumInput label="Missing crates" value={missingCrates} onChange={setMissingCrates} width={120} />
                      <NumInput label="Cracked eggs" value={missingEggs} onChange={setMissingEggs} width={140} />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <NumInput label="Payment collected (₦)" value={payment} onChange={setPayment} width={160} decimal />
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
                    if (isFinalVisit) {
                      await markDelivered(
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
                          extra: 0,
                        },
                        payment === "" ? 0 : Number(payment),
                        receiptPhoto,
                        { driver_id: driverId, customer_id: stop.customer_id }
                      );
                    } else {
                      await submitPartialDelivery(stop.id, thisVisit, stopPhotos, {
                        driver_id: driverId,
                        customer_id: stop.customer_id,
                      });
                    }
                    setBusy(false);
                    setOpenStop(null);
                    setDc("");
                    setStopPhotos([]);
                    setStopVideo(null);
                    setMissingEggs("");
                    setMissingCrates("");
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{drv ? drv.name : ""}</div>
        <Btn kind="ghost" small onClick={() => setDriverId(null)}>
          Switch
        </Btn>
      </div>

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
            const c = customers.find((x) => x.id === d.customer_id);
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
            const c = customers.find((x) => x.id === d.customer_id);
            const isDone = d.status === "delivered";
            const canReturn = d.status === "pending" && (d.crates_delivered || 0) === 0;
            const helperNames = (d.helper_ids || []).map((id) => (helpers.find((h) => h.id === id) || {}).name).filter(Boolean);
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
                        unclaimDelivery(d.id, driverId);
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

        {myStops.length > 0 && pending.length === 0 && !myReturn && (
          <div style={{ background: "#F5FBE6", border: `1.5px solid ${T.ink}`, borderRadius: 12, padding: 16, marginTop: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>All stops done</div>
            <div style={{ fontSize: 13, color: T.mute, marginBottom: 12 }}>
              Count the crates you collected back and photograph them.
            </div>
            <div style={{ marginBottom: 12 }}>
              <NumInput label="Crates collected" value={retCount} onChange={setRetCount} width={120} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <MediaCapture
                photos={retPhotos}
                onAddPhoto={(url) => setRetPhotos((x) => [...x, url])}
                onRemovePhoto={(i) => setRetPhotos((p) => p.filter((_, idx) => idx !== i))}
                video={retVideo}
                onSetVideo={setRetVideo}
                onRemoveVideo={() => setRetVideo(null)}
                upload={uploadPhoto}
                maxPhotos={5}
                label="Photos of the crates"
              />
            </div>
            <Btn
              full
              disabled={busy || retCount === "" || retPhotos.length === 0}
              onClick={async () => {
                setBusy(true);
                await submitCrateReturn(driverId, Number(retCount), retPhotos, retVideo);
                setBusy(false);
                setRetCount("");
                setRetPhotos([]);
                setRetVideo(null);
              }}
            >
              {busy ? "Sending…" : "Send crate count to office"}
            </Btn>
          </div>
        )}

        {myReturn && (
          <div
            style={{
              background: T.greenBg,
              border: `1.5px solid ${T.green}`,
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
              fontWeight: 800,
              color: T.green,
              marginTop: 10,
            }}
          >
            Route closed · {myReturn.crate_count} crates sent to office ✓
          </div>
        )}
      </div>

      {/* Missing crates owed by customers — only from this driver's own deliveries */}
      {(() => {
        const myDebts = openDebts.filter((debt) => debt.driver_id === driverId);
        if (myDebts.length === 0) return null;
        return (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.mute, marginBottom: 8 }}>
              Crates still owed by customers ({myDebts.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myDebts.map((debt) => {
                const c = customers.find((x) => x.id === debt.customer_id);
                const isCollecting = collectingDebtId === debt.id;
                return (
                <div key={debt.id} style={{ background: "#FBEAE6", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{c ? c.name : "…"}</div>
                  <div style={{ fontSize: 12, color: T.mute, marginBottom: 10 }}>
                    Owes {debt.missing_crates} crate{debt.missing_crates !== 1 ? "s" : ""}
                    {c && c.area ? ` · ${c.area}` : ""}
                  </div>

                  {!isCollecting ? (
                    <Btn
                      small
                      full
                      kind="green"
                      onClick={() => {
                        setCollectingDebtId(debt.id);
                        setCollectAmount("");
                        setCollectPhoto(null);
                      }}
                    >
                      Collected the crates
                    </Btn>
                  ) : (
                    <div style={{ background: "#fff", borderRadius: 10, padding: 12, border: `1.5px solid ${T.line}` }}>
                      <div style={{ marginBottom: 10 }}>
                        <NumInput
                          label={`How many crates? (${debt.missing_crates} owed)`}
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
                        <Btn kind="ghost" small onClick={() => setCollectingDebtId(null)}>
                          Cancel
                        </Btn>
                        <Btn
                          small
                          kind="green"
                          full
                          disabled={busy || collectAmount === "" || Number(collectAmount) <= 0 || !collectPhoto}
                          onClick={async () => {
                            setBusy(true);
                            await collectMissingCrates(debt.id, driverId, Number(collectAmount), collectPhoto);
                            setBusy(false);
                            setCollectingDebtId(null);
                            setCollectAmount("");
                            setCollectPhoto(null);
                          }}
                        >
                          {busy ? "Saving…" : "Confirm collected"}
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
          const who = (drivers.find((d) => d.id === todayCount.driver_id) || {}).name || "A driver";
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
            <div style={{ fontSize: 12, color: T.mute, marginBottom: 10 }}>{question} A photo and video are both required as proof.</div>
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
                label="Photo and video proof (both required)"
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