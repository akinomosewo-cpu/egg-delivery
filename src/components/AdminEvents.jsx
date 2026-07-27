import { T, Tag, fmtTime } from "./ui";

const EVENT_TEXT = {
  route_started: (drv, cust) => `${drv} started the route to ${cust}`,
  arrived: (drv, cust) => `${drv} arrived at ${cust}`,
  delivered: (drv, cust) => `${drv} delivered to ${cust}`,
  crates_submitted: (drv) => `${drv} sent in crates collected`,
};

const EVENT_ICON = {
  route_started: "🚐",
  arrived: "📍",
  delivered: "✅",
  crates_submitted: "📦",
};

export default function AdminEvents({ drivers, customers, events }) {
  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name || "A driver";
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "a customer";

  const summary = {
    started: events.filter((e) => e.event_type === "route_started").length,
    delivered: events.filter((e) => e.event_type === "delivered").length,
    crateBatches: events.filter((e) => e.event_type === "crates_submitted").length,
    activeDrivers: new Set(events.map((e) => e.driver_id)).size,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary strip */}
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
          ["Drivers active", summary.activeDrivers],
          ["Routes started", summary.started],
          ["Delivered", summary.delivered],
          ["Crate reports", summary.crateBatches],
        ].map(([label, val]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ color: T.yolk, fontSize: 20, fontWeight: 900 }}>{val}</div>
            <div style={{ color: "#C9C9C0", fontSize: 10, fontWeight: 700, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
        {events.length === 0 && (
          <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
            No activity yet today.
          </div>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderBottom: `1px solid ${T.line}`,
            }}
          >
            <div style={{ fontSize: 18, width: 24, textAlign: "center" }}>{EVENT_ICON[e.event_type] || "•"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {(EVENT_TEXT[e.event_type] || (() => e.event_type))(driverName(e.driver_id), customerName(e.customer_id))}
              </div>
            </div>
            <Tag color={T.mute} bg={T.tan}>
              {fmtTime(e.created_at)}
            </Tag>
          </div>
        ))}
      </div>
    </div>
  );
}
