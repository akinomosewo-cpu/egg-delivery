import { T, Tag, fmtTime } from "./ui";

const EVENT_TEXT = {
  debt_resolved: (drv) => `${drv} collected owed crates back from a customer`,
  claimed: (drv, cust) => `${drv} claimed the delivery to ${cust}`,
  route_started: (drv, cust) => `${drv} started the route to ${cust}`,
  arrived: (drv, cust) => `${drv} arrived at ${cust}`,
  delivered: (drv, cust) => `${drv} delivered to ${cust}`,
  crates_submitted: (drv) => `${drv} sent in crates collected`,
};

const EVENT_ICON = {
  debt_resolved: "📥",
  claimed: "🤝",
  route_started: "🚐",
  arrived: "📍",
  delivered: "✅",
  crates_submitted: "📦",
};

const dayLabel = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
};

export default function AdminEvents({ drivers, customers, events }) {
  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name || "A driver";
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "a customer";

  const today = new Date().toLocaleDateString("en-CA");
  const todaysEvents = events.filter((e) => e.event_date === today);
  const summary = {
    claimed: todaysEvents.filter((e) => e.event_type === "claimed").length,
    started: todaysEvents.filter((e) => e.event_type === "route_started").length,
    delivered: todaysEvents.filter((e) => e.event_type === "delivered").length,
    crateBatches: todaysEvents.filter((e) => e.event_type === "crates_submitted").length,
    activeDrivers: new Set(todaysEvents.map((e) => e.driver_id)).size,
  };

  // Group events by day; each day's events are already ordered oldest-first from the query
  const groups = [];
  for (const e of events) {
    let g = groups.find((g) => g.date === e.event_date);
    if (!g) {
      g = { date: e.event_date, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  // groups are already newest-day-first because of the query's event_date desc order

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Today's summary strip */}
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
          ["Claimed", summary.claimed],
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

      {/* Timeline grouped by day */}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          No activity yet.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.date}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.mute, margin: "4px 0 8px 2px" }}>
            {dayLabel(g.date)}
          </div>
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
            {g.items.map((e) => (
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
      ))}
    </div>
  );
}
