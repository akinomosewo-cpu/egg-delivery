import { useState } from "react";
import { T, Btn, Tag, NumInput, fmtQty } from "./ui";

export default function AdminPlan({ drivers, customers, deliveries, addDelivery, removeDelivery }) {
  const [driverId, setDriverId] = useState(null);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [crates, setCrates] = useState("");
  const [eggs, setEggs] = useState("");
  const [saving, setSaving] = useState(false);

  const activeDriverId = driverId ?? (drivers[0] && drivers[0].id);

  const matches = search
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.area || "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const chosen = customers.find((c) => c.id === customerId);
  const totalCrates = deliveries.reduce((s, d) => s + d.crates_assigned, 0);
  const totalEggs = deliveries.reduce((s, d) => s + d.eggs_assigned, 0);

  const submit = async () => {
    if (!chosen || !activeDriverId || (crates || 0) === 0) return;
    setSaving(true);
    await addDelivery({
      driver_id: activeDriverId,
      customer_id: chosen.id,
      crates_assigned: crates || 0,
      eggs_assigned: 0,
    });
    setSaving(false);
    setSearch("");
    setCustomerId(null);
    setCrates("");
    setEggs("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: T.ink,
          color: T.paper,
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>Loading today</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.yolk }}>
          {fmtQty(totalCrates, totalEggs)} · {deliveries.length} stop{deliveries.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Add a delivery</div>

        <label style={{ display: "block", fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>
          Driver
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {drivers.map((d) => (
            <button
              key={d.id}
              onClick={() => setDriverId(d.id)}
              style={{
                flex: "1 0 30%",
                padding: "9px 0",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: "inherit",
                cursor: "pointer",
                border: `1.5px solid ${activeDriverId === d.id ? T.yolkDark : T.line}`,
                background: activeDriverId === d.id ? T.greenBg : "#fff",
                color: T.ink,
              }}
            >
              {d.name}
            </button>
          ))}
          {drivers.length === 0 && (
            <div style={{ fontSize: 13, color: T.mute }}>No drivers yet — add one in the Manage tab.</div>
          )}
        </div>

        <label style={{ display: "block", fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>
          Customer
        </label>
        {chosen ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: T.greenBg,
              border: `1.5px solid ${T.green}`,
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{chosen.name}</div>
              <div style={{ fontSize: 12, color: T.mute }}>{chosen.area}</div>
            </div>
            <Btn kind="ghost" small onClick={() => setCustomerId(null)}>
              Change
            </Btn>
          </div>
        ) : (
          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name or area…"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "11px 12px",
                fontSize: 15,
                border: `1.5px solid ${T.line}`,
                borderRadius: 8,
                fontFamily: "inherit",
                color: T.ink,
                background: "#fff",
              }}
            />
            {matches.length > 0 && (
              <div
                style={{
                  border: `1.5px solid ${T.line}`,
                  borderRadius: 8,
                  marginTop: 6,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                {matches.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomerId(c.id);
                      setSearch("");
                    }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "10px 12px",
                      border: "none",
                      borderBottom: `1px solid ${T.line}`,
                      background: "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 14,
                      color: T.ink,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{c.name}</span>
                    <span style={{ color: T.mute, fontSize: 12 }}>{c.area}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
          <NumInput label="Crates" value={crates} onChange={setCrates} width={120} />
        </div>

        <Btn
          full
          onClick={submit}
          disabled={saving || !chosen || !activeDriverId || (crates || 0) === 0}
        >
          {saving ? "Saving…" : "Add to route"}
        </Btn>
      </div>

      {deliveries.length > 0 && (
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          {deliveries.map((d) => {
            const c = customers.find((x) => x.id === d.customer_id);
            const drv = drivers.find((x) => x.id === d.driver_id);
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "11px 14px",
                  borderBottom: `1px solid ${T.line}`,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c ? c.name : "…"}</div>
                  <div style={{ fontSize: 12, color: T.mute }}>
                    {fmtQty(d.crates_assigned, d.eggs_assigned)} · {drv ? drv.name : "…"}
                  </div>
                </div>
                {d.status === "pending" ? (
                  <Btn kind="ghost" small onClick={() => removeDelivery(d.id)}>
                    ✕
                  </Btn>
                ) : (
                  <Tag color={T.green} bg={T.greenBg}>
                    delivered
                  </Tag>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
