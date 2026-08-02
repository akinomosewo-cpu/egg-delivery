import { useState } from "react";
import { T, Tag, fmtQty, fmtTime, fmtDateTime } from "./ui";

const money = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

const STATUS_LABEL = {
  pending: "Not started",
  in_transit: "On the way",
  arrived: "Arrived",
  delivered: "Delivered",
};
const STATUS_COLOR = {
  pending: [T.mute, T.tan],
  in_transit: [T.yolkDark, T.tan],
  arrived: [T.yolkDark, T.greenBg],
  delivered: [T.green, T.greenBg],
};

export default function AdminDayList({ drivers, customers, helpers, deliveries }) {
  const [expandedId, setExpandedId] = useState(null);
  const rows = [...deliveries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const totals = {
    crates: rows.reduce((s, d) => s + (d.crates_assigned || 0), 0),
    delivered: rows.filter((d) => d.status === "delivered").length,
    unclaimed: rows.filter((d) => !d.driver_id).length,
    payment: rows.reduce((s, d) => s + Number(d.payment_collected || 0), 0),
  };

  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name;
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "…";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          background: T.ink,
          borderRadius: 12,
          padding: "14px 10px",
        }}
      >
        {[
          ["Stops today", rows.length],
          ["Crates posted", totals.crates],
          ["Delivered", totals.delivered],
          ["Unclaimed", totals.unclaimed],
        ].map(([label, val]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ color: T.yolk, fontSize: 20, fontWeight: 900 }}>{val}</div>
            <div style={{ color: "#C9C9C0", fontSize: 10, fontWeight: 700, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          No deliveries posted yet today.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((d) => {
          const helperNames = (d.helper_ids || []).map((id) => (helpers.find((h) => h.id === id) || {}).name).filter(Boolean);
          const [tagColor, tagBg] = STATUS_COLOR[d.status] || STATUS_COLOR.pending;
          const owesMore = d.missing_crates > 0 && !d.missing_crates_resolved;

          const isOpen = expandedId === d.id;
          const sizes = [
            ["Big large", d.big_large_delivered],
            ["Small large", d.small_large_delivered],
            ["Medium", d.medium_delivered],
            ["Pullet", d.pullet_delivered],
          ].filter(([, v]) => v > 0);

          return (
            <button
              key={d.id}
              onClick={() => setExpandedId(isOpen ? null : d.id)}
              style={{
                background: T.card,
                border: `1.5px solid ${T.line}`,
                borderRadius: 10,
                padding: "10px 12px",
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                width: "100%",
                display: "block",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{customerName(d.customer_id)}</div>
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 1 }}>
                    {driverName(d.driver_id) || <span style={{ color: T.yolkDark, fontWeight: 700 }}>Unclaimed</span>}
                    {helperNames.length > 0 && ` + ${helperNames.join(", ")}`}
                  </div>
                </div>
                <Tag color={tagColor} bg={tagBg}>
                  {STATUS_LABEL[d.status]}
                </Tag>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 12 }}>
                <span style={{ color: T.mute, fontWeight: 600 }}>
                  {fmtQty(d.crates_assigned, d.eggs_assigned)}
                  {d.status === "delivered" && ` · delivered ${d.crates_delivered || 0}`}
                </span>
                <span style={{ fontWeight: 700, color: T.ink }}>
                  {Number(d.price_due) > 0 && money(d.price_due)}
                  {d.status === "delivered" && Number(d.payment_collected) > 0 && (
                    <span style={{ color: Number(d.payment_collected) < Number(d.price_due) ? T.red : T.green }}>
                      {" → "}{money(d.payment_collected)}
                    </span>
                  )}
                </span>
              </div>

              {owesMore && (
                <div style={{ marginTop: 6 }}>
                  <Tag color={T.red} bg="#FBEAE6">
                    ⚠ {d.missing_crates} crate{d.missing_crates !== 1 ? "s" : ""} still owed
                  </Tag>
                </div>
              )}

              {d.status === "delivered" && (
                <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>
                  Delivered {fmtTime(d.delivered_at)} · {isOpen ? "▲ Hide details" : "▼ View details"}
                </div>
              )}
              {d.status !== "delivered" && (
                <div style={{ fontSize: 11, color: T.mute, marginTop: 4, fontWeight: 700 }}>
                  {isOpen ? "▲ Hide details" : "▼ View details"}
                </div>
              )}

              {isOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, cursor: "default" }}
                >
                  {d.crates_assigned > 0 && (
                    <div style={{ fontSize: 12, color: T.mute, marginBottom: 8 }}>
                      Assigned {fmtQty(d.crates_assigned, d.eggs_assigned)}
                    </div>
                  )}

                  {sizes.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 2 }}>SIZE BREAKDOWN</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{sizes.map(([label, v]) => `${label}: ${v}`).join(" · ")}</div>
                    </div>
                  )}

                  {(d.missing_crates > 0 || d.missing_eggs > 0) && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 2 }}>MISSING / CRACKED</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: d.missing_crates_resolved ? T.green : T.red }}>
                        {d.missing_crates || 0} crates missing · {d.missing_eggs || 0} eggs cracked
                        {d.missing_crates_resolved && (
                          <div style={{ fontWeight: 600, marginTop: 2 }}>✓ Collected back {fmtDateTime(d.missing_crates_resolved_at)}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {d.receipt_url && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>RECEIPT</div>
                      <a href={d.receipt_url} target="_blank" rel="noreferrer">
                        <img src={d.receipt_url} alt="receipt" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                      </a>
                    </div>
                  )}

                  {((d.photo_urls && d.photo_urls.length > 0) || d.video_url) && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>PHOTOS / VIDEO</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(d.photo_urls || []).map((p, i) => (
                          <a key={i} href={p} target="_blank" rel="noreferrer">
                            <img src={p} alt={`photo ${i + 1}`} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                          </a>
                        ))}
                        {d.video_url && (
                          <a href={d.video_url} target="_blank" rel="noreferrer">
                            <video src={d.video_url} style={{ width: 90, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 11, color: T.mute, fontWeight: 700, marginBottom: 4 }}>SIGNATURE</div>
                    {d.signature_url ? (
                      <a href={d.signature_url} target="_blank" rel="noreferrer">
                        <img src={d.signature_url} alt="signature" style={{ width: 110, height: 48, objectFit: "contain", background: "#fff", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                      </a>
                    ) : (
                      <div style={{ fontSize: 12, color: T.mute, fontStyle: "italic" }}>
                        {d.status === "delivered" ? "Customer wasn't available to sign" : "Not delivered yet"}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div
          style={{
            background: T.ink,
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: "#C9C9C0", fontSize: 13, fontWeight: 600 }}>Total collected today</span>
          <span style={{ color: T.yolk, fontSize: 16, fontWeight: 900 }}>{money(totals.payment)}</span>
        </div>
      )}
    </div>
  );
}
