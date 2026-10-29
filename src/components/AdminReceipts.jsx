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
      .select("id, customer_id, delivery_date, payment_collected, receipt_url, receipt_urls, status")
      .eq("delivery_date", dateStr)
      .order("customer_id", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error("AdminReceipts query error:", err);
          setError(err.message);
          setLoading(false);
          return;
        }
        const filtered = (data || []).filter((d) => {
          const payment = Number(d.payment_collected || 0) > 0;
          const hasRealReceipt =
            (d.receipt_url && !d.receipt_url.startsWith("pending://")) ||
            (Array.isArray(d.receipt_urls) && d.receipt_urls.some((u) => !u.startsWith("pending://")));
          return payment || hasRealReceipt;
        });
        setRows(filtered);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateStr]);

  const totalCollected = rows.reduce((s, d) => s + Number(d.payment_collected || 0), 0);
  const isToday = dateStr === todayStr;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>Receipts</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => shiftDay(-1)}
          style={{
            width: 40, height: 40, borderRadius: 10,
            border: `1.5px solid ${T.line}`, background: T.card,
            fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >&#8249;</button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtDisplay(dateStr)}</div>
          {isToday && <div style={{ fontSize: 11, color: T.mute, fontWeight: 600 }}>Today</div>}
        </div>

        <button
          onClick={() => shiftDay(1)}
          disabled={isToday}
          style={{
            width: 40, height: 40, borderRadius: 10,
            border: `1.5px solid ${T.line}`,
            background: isToday ? T.tan : T.card,
            fontSize: 20, cursor: isToday ? "default" : "pointer",
            opacity: isToday ? 0.35 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >&#8250;</button>
      </div>

      <div style={{ background: T.tan, borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
        <span style={{ fontWeight: 800 }}>{loading ? "..." : rows.length}</span> record{rows.length !== 1 ? "s" : ""}{" "}
        &middot; <span style={{ fontWeight: 800 }}>&#8358;{fmtMoney(totalCollected)}</span> collected
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 32 }}>Loading...</div>
      ) : error ? (
        <div style={{ textAlign: "center", color: "#c00", fontSize: 13, padding: 24 }}>Error: {error}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 32 }}>
          No receipts or payments for {fmtDisplay(dateStr)}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((d) => {
            const photos = (() => {
              if (Array.isArray(d.receipt_urls) && d.receipt_urls.length > 0)
                return d.receipt_urls.filter((u) => !u.startsWith("pending://"));
              if (d.receipt_url && !d.receipt_url.startsWith("pending://"))
                return [d.receipt_url];
              return [];
            })();
            return (
              <div key={d.id} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{customerName(d.customer_id)}</div>
                  {Number(d.payment_collected || 0) > 0 && (
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.green }}>
                      &#8358;{fmtMoney(d.payment_collected)}
                    </div>
                  )}
                </div>
                {photos.length > 0 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    {photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={`Receipt ${i + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: T.mute }}>No receipt photo</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
