import { useState } from "react";
import { T, Btn, Tag, NumInput, fmtQty } from "./ui";

export default function AdminPlan({ drivers, customers, helpers, deliveries, addDelivery, removeDelivery, availableStock }) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [deliveryDate, setDeliveryDate] = useState(todayStr);
  const [bigLarge, setBigLarge] = useState("");
  const [smallLarge, setSmallLarge] = useState("");
  const [medium, setMedium] = useState("");
  const [pullet, setPullet] = useState("");
  const [extra, setExtra] = useState("");
  const [priceBigLarge, setPriceBigLarge] = useState("");
  const [priceSmallLarge, setPriceSmallLarge] = useState("");
  const [priceMedium, setPriceMedium] = useState("");
  const [pricePullet, setPricePullet] = useState("");
  const [priceExtra, setPriceExtra] = useState("");
  const [saving, setSaving] = useState(false);

  const matches = search
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.area || "").toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const chosen = customers.find((c) => c.id === customerId);
  const totalCrates = deliveries.reduce((s, d) => s + d.crates_assigned, 0);

  // Crates are auto-calculated: sum of the size categories in crates (Extra excluded)
  const crates = (Number(bigLarge) || 0) + (Number(smallLarge) || 0) + (Number(medium) || 0) + (Number(pullet) || 0);

  // Total price is auto-calculated: each category's quantity × its price
  const totalPrice =
    (Number(bigLarge) || 0) * (Number(priceBigLarge) || 0) +
    (Number(smallLarge) || 0) * (Number(priceSmallLarge) || 0) +
    (Number(medium) || 0) * (Number(priceMedium) || 0) +
    (Number(pullet) || 0) * (Number(pricePullet) || 0) +
    (Number(extra) || 0) * (Number(priceExtra) || 0);

  const submit = async () => {
    if (!chosen || crates === 0) return;
    setSaving(true);
    await addDelivery({
      customer_id: chosen.id,
      crates_assigned: crates,
      eggs_assigned: 0,
      big_large_assigned: Number(bigLarge) || 0,
      small_large_assigned: Number(smallLarge) || 0,
      medium_assigned: Number(medium) || 0,
      pullet_assigned: Number(pullet) || 0,
      extra_assigned: Number(extra) || 0,
      price_due: totalPrice,
      delivery_date: deliveryDate,
    });
    setSaving(false);
    setSearch("");
    setCustomerId(null);
    setDeliveryDate(todayStr);
    setBigLarge("");
    setSmallLarge("");
    setMedium("");
    setPullet("");
    setExtra("");
    setPriceBigLarge("");
    setPriceSmallLarge("");
    setPriceMedium("");
    setPricePullet("");
    setPriceExtra("");
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
        <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>Posted today</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.yolk }}>
          {fmtQty(totalCrates, 0)} · {deliveries.length} stop{deliveries.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Post a delivery</div>
        <div style={{ fontSize: 12, color: T.mute, marginBottom: 12, fontWeight: 600 }}>
          Any driver can claim it from their app — no need to assign one here.
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 8 }}>
            Crate breakdown by size — Crates total fills in automatically (Extra not counted)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Big large", bigLarge, setBigLarge, priceBigLarge, setPriceBigLarge],
              ["Small large", smallLarge, setSmallLarge, priceSmallLarge, setPriceSmallLarge],
              ["Medium", medium, setMedium, priceMedium, setPriceMedium],
              ["Pullet", pullet, setPullet, pricePullet, setPricePullet],
            ].map(([label, qty, setQty, pr, setPr]) => (
              <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <NumInput label={label} value={qty} onChange={setQty} width={90} />
                <NumInput label="Price per crate (₦)" value={pr} onChange={setPr} width={130} decimal />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <NumInput label="Extra" value={extra} onChange={setExtra} width={90} decimal fractions />
              <NumInput label="Price per crate (₦)" value={priceExtra} onChange={setPriceExtra} width={130} decimal />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>Crates (auto-calculated)</div>
            <div
              style={{
                padding: "10px 10px",
                fontSize: 16,
                fontWeight: 800,
                color: T.ink,
                border: `1.5px solid ${T.line}`,
                borderRadius: 8,
                background: T.tan,
              }}
            >
              {crates}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 4 }}>Total price (auto-calculated)</div>
            <div
              style={{
                padding: "10px 10px",
                fontSize: 16,
                fontWeight: 800,
                color: T.ink,
                border: `1.5px solid ${T.line}`,
                borderRadius: 8,
                background: T.tan,
              }}
            >
              ₦{totalPrice.toLocaleString("en-NG")}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.mute, display: "block", marginBottom: 4 }}>
              Delivery date
            </label>
            <input
              type="date"
              value={deliveryDate}
              min={todayStr}
              onChange={(e) => setDeliveryDate(e.target.value)}
              style={{
                padding: "8px 10px",
                fontSize: 14,
                border: `1.5px solid ${T.line}`,
                borderRadius: 8,
                fontFamily: "inherit",
                color: T.ink,
                background: "#fff",
              }}
            />
            {deliveryDate !== todayStr && (
              <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>
                Scheduling for a future date — won't show up for drivers to claim until that day.
              </div>
            )}
          </div>
        </div>

        {crates > 0 && typeof availableStock === "number" && crates > availableStock && (
          <div
            style={{
              background: "#FBEAE6",
              border: `1.5px solid ${T.red}`,
              borderRadius: 8,
              padding: "10px 12px",
              marginTop: 12,
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 700,
              color: T.red,
            }}
          >
            ⚠ Only {availableStock} crates in stock — posting anyway, since stock counts may be estimated.
          </div>
        )}

        <Btn full onClick={submit} disabled={saving || !chosen || crates === 0}>
          {saving ? "Posting…" : "Post delivery"}
        </Btn>
      </div>

      {deliveries.length > 0 && (
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          {deliveries.map((d) => {
            const c = customers.find((x) => x.id === d.customer_id);
            const drv = drivers.find((x) => x.id === d.driver_id);
            const helperNames = (d.helper_ids || [])
              .map((id) => (helpers.find((h) => h.id === id) || {}).name)
              .filter(Boolean);
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
                    {fmtQty(d.crates_assigned, d.eggs_assigned)} ·{" "}
                    {drv ? drv.name : <span style={{ color: T.yolkDark, fontWeight: 700 }}>Unclaimed</span>}
                    {helperNames.length > 0 && ` · with ${helperNames.join(", ")}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {d.status === "pending" && !d.driver_id ? (
                    <Btn kind="ghost" small onClick={() => removeDelivery(d.id)}>
                      ✕
                    </Btn>
                  ) : d.status === "delivered" ? (
                    <Tag color={T.green} bg={T.greenBg}>
                      delivered
                    </Tag>
                  ) : (
                    <Tag color={T.mute} bg={T.tan}>
                      claimed
                    </Tag>
                  )}
                  {d.status === "delivered" && d.missing_crates > 0 && !d.missing_crates_resolved && (
                    <Tag color={T.red} bg="#FBEAE6">
                      ⚠ missing
                    </Tag>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
