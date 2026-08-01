import { useState } from "react";
import { T, Tag, fmtQty, fmtDateTime } from "./ui";

const money = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

export default function AdminDashboard({ drivers, customers, helpers, deliveries, crateReturns }) {
  const [expandedId, setExpandedId] = useState(null);

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
        const ret = crateReturns.find((r) => r.driver_id === drv.id);
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
              <span style={{ fontSize: 13, fontWeight: 700, color: T.mute }}>
                {done.length}/{list.length} stops done
              </span>
            </div>

            {list.map((d) => {
              const c = customers.find((x) => x.id === d.customer_id);
              const short =
                d.status === "delivered" &&
                (d.crates_delivered !== d.crates_assigned || d.eggs_delivered !== d.eggs_assigned);
              const isOpen = expandedId === d.id;
              const isPartial = d.status !== "delivered" && (d.crates_delivered || 0) > 0 && (d.crates_delivered || 0) < d.crates_assigned;
              const helperNames = (d.helper_ids || []).map((id) => (helpers.find((h) => h.id === id) || {}).name).filter(Boolean);
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
                          On the way
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

                        {(d.missing_crates > 0 || d.missing_eggs > 0) && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>MISSING / CRACKED</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: d.missing_crates_resolved ? T.green : T.red }}>
                              {d.missing_crates || 0} crates missing · {d.missing_eggs || 0} eggs cracked
                              {d.missing_crates > 0 && d.missing_crates_resolved && (
                                <div style={{ fontWeight: 600, marginTop: 2 }}>✓ Crates collected back {fmtDateTime(d.missing_crates_resolved_at)}</div>
                              )}
                            </div>
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
