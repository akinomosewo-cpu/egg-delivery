import { useState } from "react";
import { T, Btn, Tag, NumInput, TextInput, MediaCapture } from "./ui";
import { uploadPhoto } from "../supabase";

export default function AdminBalances({ customers, allDeliveries, customerPayments, recordPayment }) {
  const [expandedId, setExpandedId] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payPhoto, setPayPhoto] = useState(null);
  const [payBusy, setPayBusy] = useState(false);

  const balances = customers
    .map((c) => {
      const theirs = allDeliveries.filter((d) => d.customer_id === c.id);
      const theirPayments = (customerPayments || []).filter((p) => p.customer_id === c.id);
      const totalDue = theirs.reduce((s, d) => s + Number(d.price_due || 0), 0);
      const totalPaidAtDelivery = theirs.reduce((s, d) => s + Number(d.payment_collected || 0), 0);
      const totalPaidLater = theirPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const moneyOwed = Math.max(0, totalDue - totalPaidAtDelivery - totalPaidLater);
      const cratesOwed = theirs.reduce(
        (s, d) => s + (d.missing_crates_resolved ? 0 : Number(d.missing_crates || 0)),
        0
      );
      return { customer: c, moneyOwed, cratesOwed, deliveryCount: theirs.length, theirs, theirPayments };
    })
    .filter((b) => b.moneyOwed > 0 || b.cratesOwed > 0)
    .sort((a, b) => b.moneyOwed - a.moneyOwed);

  const totalMoneyOwed = balances.reduce((s, b) => s + b.moneyOwed, 0);
  const totalCratesOwed = balances.reduce((s, b) => s + b.cratesOwed, 0);

  const submitPayment = async (customerId) => {
    if (!payAmount || Number(payAmount) <= 0 || !payPhoto) return;
    setPayBusy(true);
    await recordPayment(customerId, Number(payAmount), payPhoto, payNote.trim() || null);
    setPayBusy(false);
    setPayingId(null);
    setPayAmount("");
    setPayNote("");
    setPayPhoto(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: T.ink, borderRadius: 12, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#C9C9C0", fontWeight: 600 }}>Total outstanding</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: T.yolk, marginTop: 4 }}>
          ₦{totalMoneyOwed.toLocaleString("en-NG")}
        </div>
        <div style={{ fontSize: 12, color: "#8A8A80", marginTop: 4 }}>
          across {balances.length} customer{balances.length !== 1 ? "s" : ""}
          {totalCratesOwed > 0 ? ` · ${totalCratesOwed} crates also owed` : ""}
        </div>
      </div>

      {balances.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          Nobody owes anything right now.
        </div>
      )}

      {balances.map((b) => {
        const isOpen = expandedId === b.customer.id;
        const isPaying = payingId === b.customer.id;
        const unpaidDeliveries = b.theirs
          .filter((d) => Number(d.price_due || 0) > Number(d.payment_collected || 0))
          .sort((x, y) => new Date(y.delivery_date) - new Date(x.delivery_date));

        return (
          <div key={b.customer.id} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
            <button
              onClick={() => setExpandedId(isOpen ? null : b.customer.id)}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "12px 14px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{b.customer.name}</span>
                {b.moneyOwed > 0 && (
                  <span style={{ fontWeight: 800, fontSize: 16, color: T.red }}>
                    ₦{b.moneyOwed.toLocaleString("en-NG")}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {b.cratesOwed > 0 && (
                  <Tag color={T.red} bg="#FBEAE6">
                    {b.cratesOwed} crates owed
                  </Tag>
                )}
                <span style={{ fontSize: 12, color: T.mute }}>{b.deliveryCount} deliveries total</span>
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: "0 14px 14px" }}>
                {unpaidDeliveries.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.mute, marginBottom: 6, textTransform: "uppercase" }}>
                      Deliveries with a balance
                    </div>
                    {unpaidDeliveries.map((d) => (
                      <div
                        key={d.delivery_date + Math.random()}
                        style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.line}` }}
                      >
                        <span style={{ color: T.mute }}>
                          {new Date(d.delivery_date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                        </span>
                        <span>
                          ₦{Number(d.payment_collected || 0).toLocaleString("en-NG")} / ₦{Number(d.price_due || 0).toLocaleString("en-NG")}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {b.theirPayments.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.mute, margin: "10px 0 6px", textTransform: "uppercase" }}>
                      Payments received later
                    </div>
                    {b.theirPayments.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: `1px solid ${T.line}` }}>
                        <div>
                          <span style={{ color: T.green, fontWeight: 700 }}>₦{Number(p.amount).toLocaleString("en-NG")}</span>
                          {p.note && <span style={{ color: T.mute }}> — {p.note}</span>}
                        </div>
                        <a href={p.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.ink, textDecoration: "underline" }}>
                          Proof
                        </a>
                      </div>
                    ))}
                  </>
                )}

                {b.moneyOwed > 0 && !isPaying && (
                  <Btn small full onClick={() => setPayingId(b.customer.id)} style={{ marginTop: 12 }}>
                    Record payment received
                  </Btn>
                )}

                {isPaying && (
                  <div style={{ marginTop: 12, background: T.tan, borderRadius: 8, padding: 12 }}>
                    <div style={{ marginBottom: 10 }}>
                      <NumInput label="Amount received" value={payAmount} onChange={setPayAmount} width={140} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <TextInput label="Note (optional)" value={payNote} onChange={setPayNote} placeholder="e.g. Bank transfer" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <MediaCapture
                        photos={payPhoto ? [payPhoto] : []}
                        onAddPhoto={(url) => setPayPhoto(url)}
                        onRemovePhoto={() => setPayPhoto(null)}
                        video={null}
                        onSetVideo={() => {}}
                        onRemoveVideo={() => {}}
                        upload={uploadPhoto}
                        maxPhotos={1}
                        label="Proof (receipt, transfer screenshot — required)"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn
                        small
                        full
                        onClick={() => submitPayment(b.customer.id)}
                        disabled={payBusy || !payAmount || Number(payAmount) <= 0 || !payPhoto}
                      >
                        {payBusy ? "Saving…" : "Save payment"}
                      </Btn>
                      <Btn small kind="ghost" onClick={() => setPayingId(null)}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 11, color: T.mute, textAlign: "center" }}>
        This is a running total across all time. Customers marked "don't require a receipt" often carry a balance by design.
      </div>
    </div>
  );
}
