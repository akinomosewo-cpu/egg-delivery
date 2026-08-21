import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { T, Tag, fmtQty } from "./ui";

const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
};

const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AdminReports({ drivers, customers, helpers }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDriver, setExpandedDriver] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [y, m] = month.split("-").map(Number);
      const start = `${month}-01`;
      const endDate = new Date(y, m, 1); // first day of next month
      const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-01`;

      const { data, error } = await supabase
        .from("deliveries")
        .select("*")
        .eq("status", "delivered")
        .gte("delivery_date", start)
        .lt("delivery_date", end)
        .order("delivered_at");
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setError(e.message || "Could not load report");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const helperName = (id) => (helpers.find((h) => h.id === id) || {}).name || "?";
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "…";

  // Group this month's delivered rows by driver
  const byDriver = drivers
    .map((drv) => {
      const items = rows.filter((r) => r.driver_id === drv.id);
      const totalCrates = items.reduce((s, r) => s + (r.crates_delivered || 0), 0);
      return { driver: drv, items, totalCrates };
    })
    .filter((g) => g.items.length > 0);

  const grandTotal = byDriver.reduce((s, g) => s + g.totalCrates, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Month picker */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: "10px 14px" }}>
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.ink, fontWeight: 800 }}>
          ‹
        </button>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{monthLabel(month)}</div>
        <button onClick={() => setMonth((m) => shiftMonth(m, 1))} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.ink, fontWeight: 800 }}>
          ›
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", color: T.mute, padding: 20 }}>Loading…</div>}
      {error && <div style={{ color: T.red, fontSize: 13, fontWeight: 700 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div style={{ background: T.ink, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 13, color: "#C9C9C0", fontWeight: 600 }}>Total delivered this month</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.yolk }}>{grandTotal} crates</div>
          </div>

          {byDriver.length === 0 && (
            <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
              No completed deliveries in {monthLabel(month)}.
            </div>
          )}

          {byDriver.map(({ driver, items, totalCrates }) => {
            const open = expandedDriver === driver.id;
            return (
              <div key={driver.id} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedDriver(open ? null : driver.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: T.tan,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{driver.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Tag color={T.yolkDark} bg={T.greenBg}>
                      {totalCrates} crates · {items.length} stop{items.length !== 1 ? "s" : ""}
                    </Tag>
                    <span style={{ fontSize: 12, color: T.mute }}>{open ? "▲" : "▼"}</span>
                  </span>
                </button>
                {open &&
                  items.map((r) => {
                    const hNames = (r.helper_ids || []).map(helperName);
                    const rowOpen = expandedItem === r.id;
                    const sizes = [
                      ["Big large", r.big_large_delivered],
                      ["Small large", r.small_large_delivered],
                      ["Medium", r.medium_delivered],
                      ["Pullet", r.pullet_delivered],
                    ].filter(([, v]) => v > 0);
                    return (
                      <div key={r.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                        <button
                          onClick={() => setExpandedItem(rowOpen ? null : r.id)}
                          style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "10px 14px" }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{customerName(r.customer_id)}</span>
                            <span style={{ fontSize: 12, color: T.mute }}>
                              {new Date(r.delivery_date + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                            {r.crates_delivered} crates{hNames.length > 0 && ` · with ${hNames.join(", ")}`}
                            {" · "}
                            <span style={{ fontWeight: 700 }}>{rowOpen ? "▲ Hide details" : "▼ View details"}</span>
                          </div>
                        </button>

                        {rowOpen && (
                          <div style={{ padding: "0 14px 14px", fontSize: 13 }}>
                            <div style={{ marginBottom: 6 }}>
                              Assigned {fmtQty(r.crates_assigned, r.eggs_assigned)} · Delivered {r.crates_delivered || 0} crates
                            </div>
                            {sizes.length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                <b>Sizes:</b> {sizes.map(([label, v]) => `${label}: ${v}`).join(" · ")}
                              </div>
                            )}
                            {Number(r.extra_delivered) > 0 && <div style={{ marginBottom: 6 }}>Extra delivered: {r.extra_delivered}</div>}
                            {(Number(r.backorder_crates) > 0 || Number(r.empty_crates_picked_up) > 0 || Number(r.empty_crates_left) > 0) && (
                              <div style={{ marginBottom: 6, fontWeight: 700 }}>
                                {Number(r.backorder_crates) > 0 && <div style={{ color: T.red }}>{r.backorder_crates} crate(s) backordered</div>}
                                {Number(r.empty_crates_picked_up) > 0 && <div>Empty crates picked up: {r.empty_crates_picked_up}</div>}
                                {Number(r.empty_crates_left) > 0 && <div style={{ color: T.red }}>{r.empty_crates_left} empty crate(s) left with customer</div>}
                              </div>
                            )}
                            {(Number(r.missing_crates) > 0 || Number(r.missing_eggs) > 0) && (
                              <div style={{ marginBottom: 6, fontWeight: 700, color: r.missing_crates_resolved ? T.green : T.red }}>
                                {r.missing_crates || 0} crate(s) missing · {r.missing_eggs || 0} egg(s) cracked
                                {r.missing_crates_resolved && " (collected back)"}
                              </div>
                            )}
                            {Number(r.price_due) > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                Price: ₦{Number(r.price_due).toLocaleString("en-NG")} · Collected: ₦{Number(r.payment_collected || 0).toLocaleString("en-NG")}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                              {(r.photo_urls || []).map((p, i) => (
                                <a key={i} href={p} target="_blank" rel="noreferrer">
                                  <img src={p} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} />
                                </a>
                              ))}
                              {r.video_url && (
                                <a href={r.video_url} target="_blank" rel="noreferrer" style={{ position: "relative", display: "inline-block" }}>
                                  <video src={r.video_url} muted playsInline preload="metadata" style={{ width: 80, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}`, display: "block" }} />
                                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", borderRadius: 6, color: "#fff", fontSize: 18 }}>▶</div>
                                </a>
                              )}
                              {r.video_url && (
                                <a href={r.video_url} target="_blank" rel="noreferrer">
                                  <video src={r.video_url} style={{ width: 80, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} muted />
                                </a>
                              )}
                              {r.signature_url && (
                                <a href={r.signature_url} target="_blank" rel="noreferrer">
                                  <img src={r.signature_url} alt="signature" style={{ width: 90, height: 40, objectFit: "contain", background: "#fff", borderRadius: 6, border: `1px solid ${T.line}` }} />
                                </a>
                              )}
                              {r.receipt_url && (
                                <a href={r.receipt_url} target="_blank" rel="noreferrer">
                                  <img src={r.receipt_url} alt="receipt" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
