import { useState } from "react";
import { T, Btn } from "./ui";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-NG", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtMoney(v) {
  if (!v && v !== 0) return "—";
  return "₦" + Number(v).toLocaleString("en-NG");
}

export default function AdminReceipts({ deliveries, allDeliveries, customers, drivers }) {
  // Use today as default date filter
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [expandedId, setExpandedId] = useState(null);

  // Combine today's deliveries + all-time for date filtering
  const allCombined = [
    ...(deliveries || []),
    ...(allDeliveries || []).filter(
      (d) => !(deliveries || []).find((dd) => dd.id === d.id)
    ),
  ];

  // Get all unique delivery dates for the date picker
  const allDates = [...new Set(
    allCombined
      .filter((d) => d.delivery_date)
      .map((d) => d.delivery_date)
  )].sort((a, b) => b.localeCompare(a));

  // Filter to selected date, only completed deliveries with a receipt or payment
  const filtered = allCombined.filter(
    (d) =>
      d.delivery_date === selectedDate &&
      (d.receipt_url || (d.payment_collected && Number(d.payment_collected) > 0))
  );

  const totalPayment = filtered.reduce(
    (s, d) => s + Number(d.payment_collected || 0), 0
  );

  const customerName = (id) =>
    (customers || []).find((c) => c.id === id)?.name || "Unknown customer";
  const driverName = (id) =>
    (drivers || []).find((d) => d.id === id)?.name || "Unknown driver";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>Receipts</div>

      {/* Date picker */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.mute }}>Date:</div>
        <select
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setExpandedId(null); }}
          style={{
            padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${T.line}`,
            fontSize: 14, fontFamily: "inherit", background: T.card, color: T.ink,
            fontWeight: 700, cursor: "pointer",
          }}
        >
          {allDates.length === 0 && (
            <option value={todayStr}>{fmtDate(todayStr)}</option>
          )}
          {allDates.map((d) => (
            <option key={d} value={d}>{fmtDate(d)}</option>
          ))}
        </select>
      </div>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div style={{
          background: T.tan, borderRadius: 10, padding: "10px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 13, color: T.mute, fontWeight: 600 }}>
            {filtered.length} receipt{filtered.length !== 1 ? "s" : ""} on {fmtDate(selectedDate)}
          </div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            {fmtMoney(totalPayment)} collected
          </div>
        </div>
      )}

      {/* Receipt cards */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", color: T.mute, fontSize: 14, padding: "32px 20px",
          background: T.card, borderRadius: 12, border: `1.5px solid ${T.line}`,
        }}>
          No receipts or payments recorded for {fmtDate(selectedDate)}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((d) => {
            const isOpen = expandedId === d.id;
            return (
              <div
                key={d.id}
                style={{
                  background: T.card, borderRadius: 12,
                  border: `1.5px solid ${T.line}`, overflow: "hidden",
                }}
              >
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isOpen ? null : d.id)}
                  style={{
                    width: "100%", textAlign: "left", padding: "14px 16px",
                    border: "none", background: "none", cursor: "pointer",
                    fontFamily: "inherit", display: "flex",
                    justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>
                      {customerName(d.customer_id)}
                    </div>
                    <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                      Driver: {driverName(d.driver_id)}
                      {d.crates_delivered > 0 && ` · ${d.crates_delivered} crates delivered`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>
                      {fmtMoney(d.payment_collected)}
                    </div>
                    <div style={{ fontSize: 11, color: T.mute }}>
                      {isOpen ? "▲ hide" : "▼ show"}
                    </div>
                  </div>
                </button>

                {/* Expanded: receipt photo + payment details */}
                {isOpen && (
                  <div style={{
                    borderTop: `1px solid ${T.line}`, padding: "14px 16px",
                    display: "flex", flexDirection: "column", gap: 12,
                  }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>Payment collected</div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>{fmtMoney(d.payment_collected)}</div>
                      </div>
                      {d.price_due > 0 && (
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>Price due</div>
                          <div style={{ fontWeight: 800, fontSize: 18 }}>{fmtMoney(d.price_due)}</div>
                          {d.payment_collected < d.price_due && (
                            <div style={{ fontSize: 12, color: T.red, fontWeight: 700, marginTop: 2 }}>
                              Outstanding: {fmtMoney(d.price_due - d.payment_collected)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {d.receipt_url ? (
                      <div>
                        <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 8 }}>Receipt photo</div>
                        <a href={d.receipt_url} target="_blank" rel="noreferrer">
                          <img
                            src={d.receipt_url}
                            alt="Receipt"
                            style={{
                              width: "100%", maxWidth: 380, borderRadius: 10,
                              border: `1.5px solid ${T.line}`, display: "block",
                            }}
                          />
                        </a>
                        <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>
                          Tap image to open full size
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: T.mute, fontStyle: "italic" }}>
                        No receipt photo — payment recorded only.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
