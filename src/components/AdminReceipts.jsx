import { useState, useEffect } from "react";
import { T } from "./ui";
import { supabase } from "../supabase";

const toLocalISO = (d) => d.toLocaleDateString("en-CA");
const fmtDisplay = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-NG", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const fmtMoney = (n) => Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0 });

export default function AdminReceipts({ customers }) {
  const todayStr = toLocalISO(new Date());
  const [dateStr, setDateStr] = useState(todayStr);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const customerName = (id) => (customers || []).find((c) => c.id === id)?.name || "Unknown";

  const shiftDay = (n) => {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + n);
    setDateStr(toLocalISO(d));
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    setRows([]);

    supabase
      .from("deliveries")
      .select("id, customer_id, delivery_date, payment_collected, receipt_url, status")
      .eq("delivery_date", dateStr)
      .gt("payment_collected", 0)
      .order("customer_id", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error("AdminReceipts query error:", err);
          setError(err.message);
          setLoading(false);
          return;
        }
        setRows(data || []);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateStr]);

  const totalCollected = rows.reduce((s, d) => s + Number(d.payment_collected || 0), 0);
  const isToday = dateStr === todayStr;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>Receipts</div>

      {/* Day navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => shiftDay(-1)}
          style={{
            width: 40, height: 40, borderRadius: 10,
            border: "1.5px solid #ccc", background: "#fff",
            fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >&#8249;</button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtDisplay(dateStr)}</div>
          {isToday && <div style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>Today</div>}
        </div>

        <button
          onClick={() => shiftDay(1)}
          disabled={isToday}
          style={{
            width: 40, height: 40, borderRadius: 10,
            border: "1.5px solid #ccc",
            background: isToday ? "#f5f5ee" : "#fff",
            fontSize: 20, cursor: isToday ? "default" : "pointer",
            opacity: isToday ? 0.35 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >&#8250;</button>
      </div>

      {/* Summary bar */}
      <div style={{ background: "#f0faf0", borderRadius: 10, padding: "12px 14px", fontSize: 14, border: "1.5px solid #c8e6c8" }}>
        <span style={{ fontWeight: 800 }}>{loading ? "..." : rows.length}</span> payment{rows.length !== 1 ? "s" : ""}{" "}
        &middot; Total: <span style={{ fontWeight: 800, fontSize: 16, color: "#2a7a2a" }}>&#8358;{fmtMoney(totalCollected)}</span>
      </div>

      {/* Records */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#888", fontSize: 14, padding: 32 }}>Loading...</div>
      ) : error ? (
        <div style={{ textAlign: "center", color: "#c00", fontSize: 13, padding: 24 }}>Error: {error}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", color: "#888", fontSize: 14, padding: 32 }}>
          No payments recorded for {fmtDisplay(dateStr)}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((d) => {
            const photo = d.receipt_url && !d.receipt_url.startsWith("pending://") ? d.receipt_url : null;
            return (
              <div key={d.id} style={{ background: "#fff", border: "1.5px solid #e0e0d8", borderRadius: 12, padding: 14 }}>
                {/* Customer + amount */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{customerName(d.customer_id)}</div>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "#2a7a2a" }}>
                    &#8358;{fmtMoney(d.payment_collected)}
                  </div>
                </div>

                {/* Method badge if present */}
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>
                  </div>
                )}

                {/* Receipt photo (only if it's actually a receipt image) */}
                {photo ? (
                  <a href={photo} target="_blank" rel="noreferrer">
                    <img
                      src={photo}
                      alt="Receipt"
                      style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e0e0d8" }}
                    />
                  </a>
                ) : (
                  <div style={{ fontSize: 12, color: "#aaa" }}>No receipt photo</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
