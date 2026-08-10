import { useState } from "react";
import { T, Tag } from "./ui";

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

  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name || "Unknown";
  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "a customer";

  const rows = events.map((e) => ({
    id: e.id,
    when: e.created_at,
    account: driverName(e.driver_id),
    type: e.event_type,
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

        {pageRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: showAccount ? "auto 1fr auto" : "1fr auto",
              gap: 10,
              padding: "10px 14px",
              borderTop: `1px solid ${T.line}`,
              alignItems: "center",
            }}
          >
            {showAccount && <div style={{ fontSize: 13, fontWeight: 700 }}>{r.account}</div>}
            <div style={{ fontSize: 13 }}>
              {r.description}
              <div style={{ marginTop: 2 }}>
                <Tag color={T.mute} bg={T.tan}>
                  {r.label}
                </Tag>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.mute, whiteSpace: "nowrap" }}>{fmtDateTime(r.when)}</div>
          </div>
        ))}
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
