import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { T, Tag } from "./ui";

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
                    return (
                      <div key={r.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{customerName(r.customer_id)}</span>
                          <span style={{ fontSize: 12, color: T.mute }}>
                            {new Date(r.delivery_date + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                          {r.crates_delivered} crates{hNames.length > 0 && ` · with ${hNames.join(", ")}`}
                        </div>
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
