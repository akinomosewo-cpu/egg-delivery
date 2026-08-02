import { T, Tag, fmtQty, fmtTime } from "./ui";

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

          return (
            <div
              key={d.id}
              style={{
                background: T.card,
                border: `1.5px solid ${T.line}`,
                borderRadius: 10,
                padding: "10px 12px",
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
                <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>Delivered {fmtTime(d.delivered_at)}</div>
              )}
            </div>
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
