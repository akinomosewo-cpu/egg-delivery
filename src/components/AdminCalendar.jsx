import { useState } from "react";
import { T, Tag } from "./ui";

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateStr(d) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD, matches delivery_date format
}

export default function AdminCalendar({ customers, allDeliveries }) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "Unknown";

  const deliveriesFor = (dateStr) => allDeliveries.filter((d) => d.delivery_date === dateStr);

  const todayStr = toDateStr(new Date());
  const weekLabel = `${weekStart.toLocaleDateString("en-NG", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(n.getDate() - 7); return n; })}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.ink }}
        >
          ‹
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{weekLabel}</span>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            style={{ fontSize: 11, fontWeight: 700, color: T.mute, background: "none", border: `1px solid ${T.line}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(n.getDate() + 7); return n; })}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.ink }}
        >
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((d) => {
          const dateStr = toDateStr(d);
          const dayDeliveries = deliveriesFor(dateStr);
          const totalCrates = dayDeliveries.reduce((s, x) => s + Number(x.crates_assigned || 0), 0);
          const isToday = dateStr === todayStr;
          const isSelected = selectedDay === dateStr;
          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDay(isSelected ? null : dateStr)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 4px",
                borderRadius: 10,
                border: `1.5px solid ${isSelected ? T.ink : T.line}`,
                background: isToday ? T.tan : T.card,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: T.mute, textTransform: "uppercase" }}>
                {d.toLocaleDateString("en-NG", { weekday: "short" })}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{d.getDate()}</span>
              {dayDeliveries.length > 0 ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: T.green }}>{dayDeliveries.length}</span>
              ) : (
                <span style={{ fontSize: 10, color: T.line }}>—</span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (() => {
        const dayDeliveries = deliveriesFor(selectedDay);
        const totalCrates = dayDeliveries.reduce((s, x) => s + Number(x.crates_assigned || 0), 0);
        const label = new Date(selectedDay + "T00:00:00").toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" });
        return (
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: T.tan, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{label}</div>
              <div style={{ fontSize: 12, color: T.mute }}>
                {dayDeliveries.length} deliver{dayDeliveries.length !== 1 ? "ies" : "y"} · {totalCrates} crates
              </div>
            </div>
            {dayDeliveries.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: T.mute, fontSize: 13 }}>
                Nothing scheduled for this day yet.
              </div>
            )}
            {dayDeliveries.map((d, i) => (
              <div key={i} style={{ padding: "10px 14px", borderTop: i > 0 ? `1px solid ${T.line}` : "none", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{customerName(d.customer_id)}</span>
                <Tag color={T.mute} bg={T.tan}>{d.crates_assigned} crates</Tag>
              </div>
            ))}
          </div>
        );
      })()}

      <div style={{ fontSize: 11, color: T.mute, textAlign: "center" }}>
        Only shows deliveries that have actually been posted for that date. To schedule ahead, post a delivery on the Plan tab with a future date.
      </div>
    </div>
  );
}
