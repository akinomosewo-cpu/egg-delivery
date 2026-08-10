import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { T, Tag, fmtQty, fmtDateTime } from "./ui";
import { getRoute } from "../routing";

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
  });
const currentLocationIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2A7DE1;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const idleDriverPin = pin("#4E8A00");
const customerPin = pin("#111111");
const ABUJA_CENTER = [9.0765, 7.3986];
const STALE_MINUTES = 20;

const money = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

export default function AdminDashboard({ drivers, customers, helpers, deliveries, crateReturns, driverLocations }) {
  const [expandedId, setExpandedId] = useState(null);
  const [, forceRedraw] = useState(0);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);
  const routeLinesRef = useRef([]);
  const routeCacheRef = useRef({});
  const lastFitCountRef = useRef(0);

  // Which delivery each driver is currently actively working on (in_transit or arrived) — this is what gets a route line + ETA
  const activePairs = drivers
    .map((drv) => {
      const loc = driverLocations?.find((l) => l.driver_id === drv.id);
      const delivery = deliveries.find((d) => d.driver_id === drv.id && (d.status === "in_transit" || d.status === "arrived"));
      if (!loc || !delivery) return null;
      const customer = customers.find((c) => c.id === delivery.customer_id);
      if (!customer || customer.lat == null || customer.lng == null) return null;
      return { driver: drv, loc, customer };
    })
    .filter(Boolean);

  useEffect(() => {
    if (leafletMapRef.current || !mapRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView(ABUJA_CENTER, 12);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    routeLinesRef.current.forEach((l) => map.removeLayer(l));
    routeLinesRef.current = [];

    const todaysCustomerIds = new Set(deliveries.map((d) => d.customer_id));
    const todaysDriverIds = new Set(deliveries.filter((d) => d.driver_id).map((d) => d.driver_id));
    const activeDriverIds = new Set(activePairs.map((p) => p.driver.id));

    (driverLocations || []).forEach((loc) => {
      if (!todaysDriverIds.has(loc.driver_id)) return;
      const drv = drivers.find((d) => d.id === loc.driver_id);
      if (!drv) return;
      const isActive = activeDriverIds.has(drv.id);
      const marker = L.marker([loc.lat, loc.lng], { icon: isActive ? currentLocationIcon : idleDriverPin })
        .addTo(map)
        .bindPopup(`<b>${drv.name}</b>${isActive ? " — on the way" : ""}`);
      markersRef.current.push(marker);
    });

    customers.forEach((c) => {
      if (!todaysCustomerIds.has(c.id) || c.lat == null || c.lng == null) return;
      const marker = L.marker([c.lat, c.lng], { icon: customerPin }).addTo(map).bindPopup(`<b>${c.name}</b>`);
      markersRef.current.push(marker);
    });

    activePairs.forEach(({ driver, loc, customer }) => {
      const key = `${driver.id}:${customer.id}`;
      const cached = routeCacheRef.current[key];
      if (cached) {
        const line = L.polyline(cached.points, { color: "#2A7DE1", weight: 4, opacity: 0.8 }).addTo(map);
        routeLinesRef.current.push(line);
      } else {
        getRoute({ lat: loc.lat, lng: loc.lng }, { lat: customer.lat, lng: customer.lng })
          .then((route) => {
            if (route) {
              routeCacheRef.current[key] = route;
              forceRedraw((n) => n + 1); // redraw now that the route is cached
            }
          })
          .catch((e) => console.error("Route lookup failed:", e));
      }
    });

    if (markersRef.current.length > 0 && markersRef.current.length !== lastFitCountRef.current) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 15 });
      lastFitCountRef.current = markersRef.current.length;
    }
  }, [driverLocations, drivers, customers, deliveries]);

  const todaysRevenue = deliveries
    .filter((d) => d.status === "delivered")
    .reduce((s, d) => s + Number(d.payment_collected || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: T.green,
            display: "inline-block",
            animation: "pulse 1.6s infinite",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>
          Live — updates as drivers work
        </span>
      </div>

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 220,
          borderRadius: 12,
          border: `1.5px solid ${T.line}`,
          overflow: "hidden",
        }}
      />
      <div style={{ fontSize: 11, color: T.mute, textAlign: "center", marginTop: -10 }}>
        🟢 Idle driver · 🔵 On the way · ⚫ Customer
      </div>

      <div
        style={{
          background: T.ink,
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 13, color: "#C9C9C0", fontWeight: 600 }}>Collected today</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.yolk }}>{money(todaysRevenue)}</div>
      </div>

      {(() => {
        const unclaimed = deliveries.filter((d) => !d.driver_id && d.status === "pending");
        if (unclaimed.length === 0) return null;
        return (
          <div style={{ background: T.card, border: `1.5px dashed ${T.yolkDark}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "#F5FBE6", fontWeight: 800, fontSize: 15 }}>
              Waiting to be claimed ({unclaimed.length})
            </div>
            {unclaimed.map((d) => {
              const c = customers.find((x) => x.id === d.customer_id);
              return (
                <div key={d.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c ? c.name : "…"}</span>
                  <span style={{ fontSize: 13, color: T.mute }}>{fmtQty(d.crates_assigned, d.eggs_assigned)}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {drivers.map((drv) => {
        const list = deliveries.filter((d) => d.driver_id === drv.id);
        const done = list.filter((d) => d.status === "delivered");
        const pending = list.filter((d) => d.status !== "delivered");
        const ret = crateReturns.find((r) => r.driver_id === drv.id);
        const loc = driverLocations?.find((l) => l.driver_id === drv.id);
        const staleMin = loc ? Math.round((Date.now() - new Date(loc.updated_at)) / 60000) : null;
        const isStale = pending.length > 0 && (staleMin === null || staleMin > STALE_MINUTES);
        if (list.length === 0 && !ret) return null;
        return (
          <div
            key={drv.id}
            style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                background: T.tan,
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15 }}>{drv.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isStale && (
                  <Tag color={T.red} bg="#FBEAE6">
                    📡 {staleMin === null ? "No signal yet" : `Quiet ${staleMin}m`}
                  </Tag>
                )}
                <span style={{ fontSize: 13, fontWeight: 700, color: T.mute }}>
                  {done.length}/{list.length} stops done
                </span>
              </div>
            </div>

            {list.map((d) => {
              const c = customers.find((x) => x.id === d.customer_id);
              const short =
                d.status === "delivered" &&
                (d.crates_delivered !== d.crates_assigned || d.eggs_delivered !== d.eggs_assigned);
              const isOpen = expandedId === d.id;
              const isPartial = d.status !== "delivered" && (d.crates_delivered || 0) > 0 && (d.crates_delivered || 0) < d.crates_assigned;
              const helperNames = (d.helper_ids || []).map((id) => (helpers.find((h) => h.id === id) || {}).name).filter(Boolean);
              const routeInfo = d.status === "in_transit" ? routeCacheRef.current[`${drv.id}:${d.customer_id}`] : null;
              const sizes = [
                ["Big large", d.big_large_delivered],
                ["Small large", d.small_large_delivered],
                ["Medium", d.medium_delivered],
                ["Pullet", d.pullet_delivered],
                ["Extra", d.extra_delivered],
              ].filter(([, v]) => v > 0);

              return (
                <div key={d.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : d.id)}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "10px 14px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{c ? c.name : "…"}</div>
                      {d.status === "delivered" ? (
                        <Tag color={T.green} bg={T.greenBg}>
                          ✓ {fmtDateTime(d.delivered_at)}
                        </Tag>
                      ) : isPartial ? (
                        <Tag color={T.red} bg="#FBEAE6">
                          🔁 Partial: {d.crates_delivered}/{d.crates_assigned}
                        </Tag>
                      ) : d.status === "arrived" ? (
                        <Tag color={T.yolkDark} bg={T.greenBg}>
                          Arrived
                        </Tag>
                      ) : d.status === "in_transit" ? (
                        <Tag color={T.yolkDark} bg={T.tan}>
                          On the way{routeInfo ? ` · ~${routeInfo.durationMin}m` : ""}
                        </Tag>
                      ) : (
                        <Tag color={T.mute} bg={T.tan}>
                          pending
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                      Assigned {fmtQty(d.crates_assigned, d.eggs_assigned)}
                      {d.status === "delivered" && (
                        <>
                          {" · "}
                          <span style={{ color: short ? T.red : T.green, fontWeight: 700 }}>
                            Delivered {fmtQty(d.crates_delivered || 0, d.eggs_delivered || 0)}
                            {short && " ⚠ mismatch"}
                          </span>
                        </>
                      )}
                      {isPartial && (
                        <>
                          {" · "}
                          <span style={{ color: T.red, fontWeight: 700 }}>
                            {d.crates_assigned - d.crates_delivered} crates still owed
                          </span>
                        </>
                      )}
                    </div>
                    {helperNames.length > 0 && (
                      <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>With {helperNames.join(", ")}</div>
                    )}
                    {d.status === "delivered" && (d.missing_crates > 0 || d.missing_eggs > 0) && (
                      <div style={{ marginTop: 4 }}>
                        {d.missing_crates > 0 && d.missing_crates_resolved ? (
                          <Tag color={T.green} bg={T.greenBg}>
                            ✓ Crates collected back
                          </Tag>
                        ) : (
                          <Tag color={T.red} bg="#FBEAE6">
                            ⚠ Missing: {d.missing_crates > 0 ? `${d.missing_crates} crate${d.missing_crates !== 1 ? "s" : ""}` : ""}
                            {d.missing_crates > 0 && d.missing_eggs > 0 ? " + " : ""}
                            {d.missing_eggs > 0 ? `${d.missing_eggs} cracked egg${d.missing_eggs !== 1 ? "s" : ""}` : ""}
                          </Tag>
                        )}
                      </div>
                    )}
                    {d.status === "delivered" && (
                      <div style={{ fontSize: 11, color: T.mute, marginTop: 4, fontWeight: 700 }}>{isOpen ? "▲ Hide details" : "▼ View full details"}</div>
                    )}
                  </button>

                  {isOpen && d.status === "delivered" && (
                    <div style={{ padding: "0 14px 16px", background: T.paper }}>
                      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 10, padding: 14 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700 }}>PRICE DUE</div>
                            <div style={{ fontSize: 16, fontWeight: 900 }}>{money(d.price_due)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700 }}>PAYMENT COLLECTED</div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: Number(d.payment_collected) < Number(d.price_due) ? T.red : T.green }}>
                              {money(d.payment_collected)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700 }}>DELIVERED</div>
                            <div style={{ fontSize: 16, fontWeight: 900 }}>{d.crates_delivered || 0} crates</div>
                          </div>
                        </div>

                        {sizes.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>SIZE BREAKDOWN</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {sizes.map(([label, v]) => `${label}: ${v}`).join(" · ")}
                            </div>
                          </div>
                        )}

                        {(d.missing_crates > 0 || d.missing_eggs > 0 || (d.missing_crates_photos && d.missing_crates_photos.length > 0)) && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>MISSING / CRACKED</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: d.missing_crates_resolved ? T.green : T.red }}>
                              {d.missing_crates || 0} crates still missing · {d.missing_eggs || 0} eggs cracked
                              {d.missing_crates_resolved && (
                                <div style={{ fontWeight: 600, marginTop: 2 }}>✓ Crates collected back {fmtDateTime(d.missing_crates_resolved_at)}</div>
                              )}
                            </div>
                            {d.missing_crates_photos && d.missing_crates_photos.length > 0 && (
                              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                                {d.missing_crates_photos.map((p, i) => (
                                  <a key={i} href={p} target="_blank" rel="noreferrer">
                                    <img src={p} alt={`crate collection ${i + 1}`} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {d.receipt_url && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 6 }}>RECEIPT</div>
                            <a href={d.receipt_url} target="_blank" rel="noreferrer">
                              <img src={d.receipt_url} alt="receipt" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                            </a>
                          </div>
                        )}

                        {((d.photo_urls && d.photo_urls.length > 0) || d.video_url) && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 6 }}>DELIVERY PHOTOS / VIDEO</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {(d.photo_urls || []).map((p, i) => (
                                <a key={i} href={p} target="_blank" rel="noreferrer">
                                  <img src={p} alt={`photo ${i + 1}`} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                                </a>
                              ))}
                              {d.video_url && (
                                <a href={d.video_url} target="_blank" rel="noreferrer">
                                  <video src={d.video_url} style={{ width: 100, height: 64, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        <div>
                          <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 6 }}>SIGNATURE</div>
                          {d.signature_url ? (
                            <a href={d.signature_url} target="_blank" rel="noreferrer">
                              <img src={d.signature_url} alt="signature" style={{ width: 120, height: 54, objectFit: "contain", background: "#fff", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                            </a>
                          ) : (
                            <div style={{ fontSize: 13, color: T.mute, fontStyle: "italic" }}>Customer wasn't available to sign</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {ret && (
              <div style={{ padding: "12px 14px", background: "#F5FBE6" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: T.yolkDark }}>
                  Crates returned: {ret.crate_count} · {fmtDateTime(ret.submitted_at)}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {(ret.photo_urls || []).map((p, i) => (
                    <a key={i} href={p} target="_blank" rel="noreferrer">
                      <img
                        src={p}
                        alt={`crates ${i + 1}`}
                        style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }}
                      />
                    </a>
                  ))}
                  {ret.video_url && (
                    <a href={ret.video_url} target="_blank" rel="noreferrer">
                      <video src={ret.video_url} style={{ width: 90, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {deliveries.length === 0 && crateReturns.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          No deliveries yet today. Add stops in the Plan tab.
        </div>
      )}
    </div>
  );
}