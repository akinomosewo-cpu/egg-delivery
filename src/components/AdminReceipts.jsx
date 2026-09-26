import { useState, useMemo } from "react";
import { T } from "./ui";

const fmtDate = (d) => new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
const fmtMoney = (n) => Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 0 });

export default function AdminReceipts({ customers, deliveries }) {
  const today = new Date().toLocaleDateString("en-CA");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const customerName = (id) => (customers || []).find((c) => c.id === id)?.name || "Unknown";

  const rows = useMemo(() => {
    return (deliveries || [])
      .filter((d) => {
        if (!d.delivery_date) return false;
        if (d.delivery_date < dateFrom) return false;
        if (d.delivery_date > dateTo) return false;
        // Only show rows that have either a receipt photo or a payment
        const hasReceipt = (d.receipt_url || (d.receipt_urls && d.receipt_urls.length > 0));
        const hasPayment = Number(d.payment_collected || 0) > 0;
        return hasReceipt || hasPayment;
      })
      .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
  }, [deliveries, dateFrom, dateTo]);

  const totalCollected = rows.reduce((s, d) => s + Number(d.payment_collected || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 17 }}>Receipts</div>

      {/* Date filter */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>From</div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${T.line}`, fontFamily: "inherit", fontSize: 14 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>To</div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${T.line}`, fontFamily: "inherit", fontSize: 14 }}
          />
        </div>
      </div>

      {/* Summary */}
      <div style={{ background: T.tan, borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
        <span style={{ fontWeight: 800 }}>{rows.length}</span> record{rows.length !== 1 ? "s" : ""} ·{" "}
        <span style={{ fontWeight: 800 }}>₦{fmtMoney(totalCollected)}</span> collected
      </div>

      {/* Records */}
      {rows.length === 0 ? (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 24 }}>
          No receipts or payments found for this date range.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((d) => {
            const photos = d.receipt_urls && d.receipt_urls.length > 0
              ? d.receipt_urls
              : d.receipt_url
              ? [d.receipt_url]
              : [];
            return (
              <div
                key={d.id}
                style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{customerName(d.customer_id)}</div>
                    <div style={{ fontSize: 12, color: T.mute }}>{fmtDate(d.delivery_date)}</div>
                  </div>
                  {Number(d.payment_collected || 0) > 0 && (
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.green }}>
                      ₦{fmtMoney(d.payment_collected)}
                    </div>
                  )}
                </div>

                {/* Receipt photos */}
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={`Receipt ${i + 1}`}
                          style={{
                            width: 80, height: 80, objectFit: "cover",
                            borderRadius: 8, border: `1.5px solid ${T.line}`,
                          }}
                        />
                      </a>
                    ))}
                  </div>
                )}

                {photos.length === 0 && Number(d.payment_collected || 0) > 0 && (
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>No receipt photo</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
