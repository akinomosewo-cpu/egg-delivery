import { useState } from "react";
import { T, Btn, NumInput, TextInput } from "./ui";

// Available stock is computed live: everything ever logged as "added",
// minus every crate ever committed to a posted delivery. Nothing to get
// out of sync — no manual increment/decrement bookkeeping anywhere.
export default function AdminStock({ stockEntries, deliveries, addStockEntry, drivers, stockCounts }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const totalAdded = stockEntries.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalCommitted = deliveries.reduce((s, d) => s + Number(d.crates_assigned || 0), 0);
  const available = totalAdded - totalCommitted;

  const submit = async () => {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    await addStockEntry(Number(amount), note.trim() || null);
    setBusy(false);
    setAmount("");
    setNote("");
  };

  const recent = [...stockEntries].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: T.ink,
          borderRadius: 12,
          padding: "16px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "#C9C9C0", fontWeight: 600 }}>Available stock right now</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: available < 0 ? T.red : T.yolk, marginTop: 4 }}>
          {available} crates
        </div>
        <div style={{ fontSize: 11, color: "#8A8A80", marginTop: 4 }}>
          {totalAdded} added all-time · {totalCommitted} committed to deliveries
        </div>
      </div>

      <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Log crates coming in</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <NumInput label="Crates added" value={amount} onChange={setAmount} width={120} />
          <div style={{ flex: 1 }}>
            <TextInput label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. Morning collection" />
          </div>
        </div>
        <Btn full onClick={submit} disabled={busy || !amount || Number(amount) <= 0}>
          {busy ? "Saving…" : "Add to stock"}
        </Btn>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.mute, marginBottom: 8 }}>Recent additions</div>
        {recent.length === 0 && (
          <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 20 }}>
            Nothing logged yet.
          </div>
        )}
        <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          {recent.map((e) => (
            <div key={e.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>+{e.amount} crates</div>
                {e.note && <div style={{ fontSize: 12, color: T.mute }}>{e.note}</div>}
                <div style={{ fontSize: 11, color: T.mute }}>
                  {e.driver_id ? `Logged by ${(drivers.find((d) => d.id === e.driver_id) || {}).name || "a driver"}` : "Logged by Admin"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: T.mute }}>
                {new Date(e.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.mute, textAlign: "center" }}>
        This is a running total across all time, not reset daily. Posting a delivery counts against it the moment it's created.
      </div>

      {stockCounts && stockCounts.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.mute, marginBottom: 8 }}>
            Morning counts reported by drivers
          </div>
          <div style={{ fontSize: 11, color: T.mute, marginBottom: 8 }}>
            What drivers physically saw in the warehouse — a reference to compare against the computed number above, not part of the running total.
          </div>
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
            {stockCounts.slice(0, 15).map((c) => (
              <div key={c.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {c.photo_url && (
                    <a href={c.photo_url} target="_blank" rel="noreferrer">
                      <img
                        src={c.photo_url}
                        alt="warehouse proof"
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: `1.5px solid ${T.line}` }}
                      />
                    </a>
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.amount} crates</div>
                    <div style={{ fontSize: 12, color: T.mute }}>
                      {(drivers.find((d) => d.id === c.driver_id) || {}).name || "A driver"}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.mute, whiteSpace: "nowrap" }}>
                  {new Date(c.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}