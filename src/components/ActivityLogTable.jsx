import { useState } from "react";
import { T, Tag, fmtQty } from "./ui";
import { supabase } from "../supabase";

const EVENT_TEXT = {
  claimed: (drv, cust) => `${drv} claimed the delivery to ${cust}`,
  unclaimed: (drv, cust) => `${drv} returned the delivery to ${cust}`,
  route_started: (drv, cust) => `${drv} started the route to ${cust}`,
  arrived: (drv, cust) => `${drv} arrived at ${cust}`,
  partial_delivered: (drv, cust) => `${drv} dropped off part of the order at ${cust}`,
  delivered: (drv, cust) => `${drv} delivered to ${cust}`,
  crates_submitted: (drv) => `${drv} sent in crates collected`,
  debt_resolved: (drv) => `${drv} collected owed crates back from a customer`,
};

const EVENT_LABEL = {
  claimed: "Claimed",
  unclaimed: "Returned",
  route_started: "Route started",
  arrived: "Arrived",
  partial_delivered: "Partial delivery",
  delivered: "Delivered",
  crates_submitted: "Crates submitted",
  debt_resolved: "Crates collected",
};

const fmtDateTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

const PAGE_SIZE = 10;

// Pass showAccount=true for Admin (sees who did what), false for a driver
// looking at just their own activity (name is redundant there).
export default function ActivityLogTable({ events, drivers, customers, showAccount = true }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [deliveryCache, setDeliveryCache] = useState({});
  const [loadingDelivery, setLoadingDelivery] = useState(null);

  const toggleExpand = async (row) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (!row.deliveryId || deliveryCache[row.deliveryId]) return;
    setLoadingDelivery(row.deliveryId);
    const { data } = await supabase.from("deliveries").select("*").eq("id", row.deliveryId).single();
    setDeliveryCache((cur) => ({ ...cur, [row.deliveryId]: data || null }));
    setLoadingDelivery(null);
  };

  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name || "Unknown";
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "a customer";

  const rows = events.map((e) => ({
    id: e.id,
    when: e.created_at,
    account: driverName(e.driver_id),
    type: e.event_type,
    deliveryId: e.delivery_id || null,
    label: EVENT_LABEL[e.event_type] || e.event_type,
    description: (EVENT_TEXT[e.event_type] || (() => e.event_type))(driverName(e.driver_id), customerName(e.customer_id)),
  }));

  const eventTypes = [...new Set(rows.map((r) => r.type))];

  const filtered = rows.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.description.toLowerCase().includes(q) || r.account.toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search activity…"
          style={{
            flex: 1,
            minWidth: 140,
            padding: "9px 12px",
            fontSize: 13,
            border: `1.5px solid ${T.line}`,
            borderRadius: 8,
            fontFamily: "inherit",
            color: T.ink,
            background: "#fff",
          }}
        />
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(0);
          }}
          style={{
            padding: "9px 10px",
            fontSize: 13,
            border: `1.5px solid ${T.line}`,
            borderRadius: 8,
            fontFamily: "inherit",
            color: T.ink,
            background: "#fff",
          }}
        >
          <option value="all">All actions</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABEL[t] || t}
            </option>
          ))}
        </select>
      </div>

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: showAccount ? "auto 1fr auto" : "1fr auto",
            gap: 10,
            padding: "10px 14px",
            background: T.tan,
            fontSize: 11,
            fontWeight: 700,
            color: T.mute,
            textTransform: "uppercase",
          }}
        >
          {showAccount && <div>Account</div>}
          <div>Activity</div>
          <div>When</div>
        </div>

        {pageRows.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: T.mute, fontSize: 13 }}>Nothing matches.</div>
        )}

        {pageRows.map((r) => {
          const isOpen = expandedId === r.id;
          const d = r.deliveryId ? deliveryCache[r.deliveryId] : null;
          const sizes = d
            ? [
                ["Big large", d.big_large_delivered],
                ["Small large", d.small_large_delivered],
                ["Medium", d.medium_delivered],
                ["Pullet", d.pullet_delivered],
              ].filter(([, v]) => v > 0)
            : [];
          return (
            <div key={r.id}>
              <button
                onClick={() => toggleExpand(r)}
                style={{
                  display: "grid",
                  gridTemplateColumns: showAccount ? "auto 1fr auto" : "1fr auto",
                  gap: 10,
                  padding: "10px 14px",
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: `1px solid ${T.line}`,
                  cursor: r.deliveryId ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {showAccount && <div style={{ fontSize: 13, fontWeight: 700 }}>{r.account}</div>}
                <div style={{ fontSize: 13 }}>
                  {r.description}
                  <div style={{ marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
                    <Tag color={T.mute} bg={T.tan}>
                      {r.label}
                    </Tag>
                    {r.deliveryId && <span style={{ fontSize: 11, color: T.mute, fontWeight: 700 }}>{isOpen ? "▲ Hide" : "▼ Details"}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.mute, whiteSpace: "nowrap" }}>{fmtDateTime(r.when)}</div>
              </button>

              {isOpen && r.deliveryId && (
                <div style={{ padding: "0 14px 14px", background: T.tan }}>
                  {loadingDelivery === r.deliveryId && <div style={{ fontSize: 12, color: T.mute, padding: "10px 0" }}>Loading…</div>}
                  {!loadingDelivery && !d && <div style={{ fontSize: 12, color: T.mute, padding: "10px 0" }}>Delivery record not found (may have been cleared).</div>}
                  {d && (
                    <div style={{ paddingTop: 10, fontSize: 13 }}>
                      <div style={{ marginBottom: 6 }}>
                        Assigned {fmtQty(d.crates_assigned, d.eggs_assigned)} · Delivered {d.crates_delivered || 0} crates
                      </div>
                      {sizes.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <b>Sizes:</b> {sizes.map(([label, v]) => `${label}: ${v}`).join(" · ")}
                        </div>
                      )}
                      {Number(d.extra_delivered) > 0 && <div style={{ marginBottom: 6 }}>Extra delivered: {d.extra_delivered}</div>}
                      {(Number(d.backorder_crates) > 0 || Number(d.empty_crates_picked_up) > 0 || Number(d.empty_crates_left) > 0) && (
                        <div style={{ marginBottom: 6, color: T.red, fontWeight: 700 }}>
                          {Number(d.backorder_crates) > 0 && <div>{d.backorder_crates} crate(s) backordered</div>}
                          {Number(d.empty_crates_picked_up) > 0 && <div style={{ color: T.ink, fontWeight: 600 }}>Empty crates picked up: {d.empty_crates_picked_up}</div>}
                          {Number(d.empty_crates_left) > 0 && <div>{d.empty_crates_left} empty crate(s) left with customer</div>}
                        </div>
                      )}
                      {(Number(d.missing_crates) > 0 || Number(d.missing_eggs) > 0) && (
                        <div style={{ marginBottom: 6, color: d.missing_crates_resolved ? T.green : T.red, fontWeight: 700 }}>
                          {d.missing_crates || 0} crate(s) missing · {d.missing_eggs || 0} egg(s) cracked
                          {d.missing_crates_resolved && " (collected back)"}
                        </div>
                      )}
                      {Number(d.price_due) > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          Price: ₦{Number(d.price_due).toLocaleString("en-NG")} · Collected: ₦{Number(d.payment_collected || 0).toLocaleString("en-NG")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {(d.photo_urls || []).map((p, i) => (
                          <a key={i} href={p} target="_blank" rel="noreferrer">
                            <img src={p} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} />
                          </a>
                        ))}
                        {d.video_url && (
                          <a href={d.video_url} target="_blank" rel="noreferrer" style={{ position: "relative", display: "inline-block" }}>
                            <video src={d.video_url} muted playsInline preload="metadata" style={{ width: 80, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}`, display: "block" }} />
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", borderRadius: 6, color: "#fff", fontSize: 18 }}>▶</div>
                          </a>
                        )}
                        {d.video_url && (
                          <a href={d.video_url} target="_blank" rel="noreferrer">
                            <video src={d.video_url} style={{ width: 80, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} muted />
                          </a>
                        )}
                        {d.signature_url && (
                          <a href={d.signature_url} target="_blank" rel="noreferrer">
                            <img src={d.signature_url} alt="signature" style={{ width: 90, height: 40, objectFit: "contain", background: "#fff", borderRadius: 6, border: `1px solid ${T.line}` }} />
                          </a>
                        )}
                        {d.receipt_url && (
                          <a href={d.receipt_url} target="_blank" rel="noreferrer">
                            <img src={d.receipt_url} alt="receipt" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.line}` }} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ background: "none", border: "none", color: page === 0 ? T.line : T.ink, fontSize: 18, cursor: page === 0 ? "default" : "pointer" }}
          >
            ‹
          </button>
          <span style={{ fontSize: 12, color: T.mute, fontWeight: 600 }}>
            {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ background: "none", border: "none", color: page >= totalPages - 1 ? T.line : T.ink, fontSize: 18, cursor: page >= totalPages - 1 ? "default" : "pointer" }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
