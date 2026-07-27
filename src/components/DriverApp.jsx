import { useState } from "react";
import { T, Btn, Tag, NumInput, PhotoButton, fmtQty } from "./ui";
import { uploadPhoto } from "../supabase";

const STATUS_LABEL = {
  pending: "Not started",
  in_transit: "On the way",
  arrived: "Arrived",
  delivered: "Delivered",
};

export default function DriverApp({ drivers, customers, deliveries, crateReturns, updateStatus, markDelivered, submitCrateReturn }) {
  const [driverId, setDriverId] = useState(null);
  const [openStop, setOpenStop] = useState(null);
  const [dc, setDc] = useState("");
  const [photoUrl, setPhotoUrl] = useState(null);
  const [retCount, setRetCount] = useState("");
  const [retPhotos, setRetPhotos] = useState([]);
  const [busy, setBusy] = useState(false);

  if (!driverId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 24 }}>
        <div style={{ textAlign: "center", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
          Who is driving today?
        </div>
        {drivers.map((d) => (
          <button
            key={d.id}
            onClick={() => setDriverId(d.id)}
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
  const myStops = deliveries.filter((d) => d.driver_id === driverId);
  const pending = myStops.filter((d) => d.status !== "delivered");
  const done = myStops.filter((d) => d.status === "delivered");
  const myReturn = crateReturns.find((r) => r.driver_id === driverId);
  const stop = myStops.find((d) => d.id === openStop);

  if (stop) {
    const c = customers.find((x) => x.id === stop.customer_id);
    const name = c ? c.name : "this customer";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Btn kind="ghost" small onClick={() => setOpenStop(null)}>
          ← Back to route
        </Btn>
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{name}</div>
              <div style={{ fontSize: 13, color: T.mute, marginBottom: 6 }}>{c && c.area}</div>
            </div>
            <Tag color={T.mute} bg={T.tan}>
              {STATUS_LABEL[stop.status]}
            </Tag>
          </div>
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

          {stop.status === "arrived" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>What was actually delivered?</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <NumInput label="Crates delivered" value={dc} onChange={setDc} width={120} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <PhotoButton
                  photos={photoUrl ? [photoUrl] : []}
                  onUploaded={setPhotoUrl}
                  upload={uploadPhoto}
                  label="Photo at this stop (required)"
                />
              </div>
              <Btn
                full
                kind="green"
                disabled={!photoUrl || busy}
                onClick={async () => {
                  setBusy(true);
                  await markDelivered(stop.id, dc === "" ? stop.crates_assigned : dc, photoUrl, {
                    driver_id: driverId,
                    customer_id: stop.customer_id,
                  });
                  setBusy(false);
                  setOpenStop(null);
                  setDc("");
                  setPhotoUrl(null);
                }}
              >
                {busy ? "Saving…" : "✓ Mark delivered"}
              </Btn>
              {!photoUrl && (
                <div style={{ fontSize: 12, color: T.mute, textAlign: "center", marginTop: 8 }}>
                  Take a photo to finish this stop
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>
          {drv ? drv.name : ""}'s route · {done.length}/{myStops.length}
        </div>
        <Btn kind="ghost" small onClick={() => setDriverId(null)}>
          Switch
        </Btn>
      </div>

      {myStops.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          No Deliveries Yet. Please ask the Admin.
        </div>
      )}

      {myStops.map((d) => {
        const c = customers.find((x) => x.id === d.customer_id);
        const isDone = d.status === "delivered";
        return (
          <button
            key={d.id}
            onClick={() => {
              if (!isDone) {
                setOpenStop(d.id);
                setDc(d.crates_assigned);
                setPhotoUrl(null);
              }
            }}
            style={{
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 16px",
              borderRadius: 12,
              border: `1.5px solid ${isDone ? T.green : T.line}`,
              background: isDone ? T.greenBg : T.card,
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
              </div>
            </div>
            <div style={{ fontSize: 22 }}>{isDone ? "✅" : d.status === "arrived" ? "📍" : d.status === "in_transit" ? "🚐" : "○"}</div>
          </button>
        );
      })}

      {myStops.length > 0 && pending.length === 0 && !myReturn && (
        <div style={{ background: "#F5FBE6", border: `1.5px solid ${T.ink}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>All stops done</div>
          <div style={{ fontSize: 13, color: T.mute, marginBottom: 12 }}>
            Count the crates you collected back and photograph them.
          </div>
          <div style={{ marginBottom: 12 }}>
            <NumInput label="Crates collected" value={retCount} onChange={setRetCount} width={120} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <PhotoButton
              photos={retPhotos}
              onUploaded={(url) => setRetPhotos((x) => [...x, url])}
              upload={uploadPhoto}
              label="Photos of the crates"
            />
          </div>
          <Btn
            full
            disabled={busy || retCount === "" || retPhotos.length === 0}
            onClick={async () => {
              setBusy(true);
              await submitCrateReturn(driverId, retCount, retPhotos);
              setBusy(false);
              setRetCount("");
              setRetPhotos([]);
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
          }}
        >
          Route closed · {myReturn.crate_count} crates sent to office ✓
        </div>
      )}
    </div>
  );
}
