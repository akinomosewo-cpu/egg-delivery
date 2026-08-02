import { useState } from "react";
import { supabase, uploadPhoto } from "../supabase";
import { T, Btn, Tag, NumInput, MediaCapture, fmtDateTime } from "./ui";

export default function AdminMissingCrates({ customers, drivers, openDebts, collectMissingCrates }) {
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [collectingId, setCollectingId] = useState(null);
  const [amount, setAmount] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const customerName = (id) => (customers.find((c) => c.id === id) || {}).name || "…";
  const driverName = (id) => (drivers.find((d) => d.id === id) || {}).name || "…";

  const totalOwed = openDebts.reduce((s, d) => s + (d.missing_crates || 0), 0);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("deliveries")
      .select("*")
      .eq("missing_crates_resolved", true)
      .order("missing_crates_resolved_at", { ascending: false })
      .limit(50);
    if (!error) setHistory(data);
    setLoadingHistory(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: T.ink,
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 13, color: "#C9C9C0", fontWeight: 600 }}>Crates still owed</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: T.yolk }}>
          {totalOwed} crate{totalOwed !== 1 ? "s" : ""} · {openDebts.length} customer stop{openDebts.length !== 1 ? "s" : ""}
        </div>
      </div>

      {openDebts.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          Nobody owes crates right now.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {openDebts.map((d) => {
          const isCollecting = collectingId === d.id;
          return (
            <div key={d.id} style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{customerName(d.customer_id)}</div>
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                    Delivered by {driverName(d.driver_id)} ·{" "}
                    {new Date(d.delivery_date + "T00:00:00").toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <Tag color={T.red} bg="#FBEAE6">
                  {d.missing_crates} crate{d.missing_crates !== 1 ? "s" : ""} owed
                </Tag>
              </div>

              {!isCollecting ? (
                <Btn
                  small
                  kind="green"
                  full
                  onClick={() => {
                    setCollectingId(d.id);
                    setAmount("");
                    setPhoto(null);
                  }}
                >
                  Mark crates collected back
                </Btn>
              ) : (
                <div style={{ background: T.paper, borderRadius: 10, padding: 12, border: `1.5px solid ${T.line}`, marginTop: 10 }}>
                  <div style={{ marginBottom: 10 }}>
                    <NumInput
                      label={`How many crates? (${d.missing_crates} owed)`}
                      value={amount}
                      onChange={setAmount}
                      width={120}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <MediaCapture
                      photos={photo ? [photo] : []}
                      onAddPhoto={(url) => setPhoto(url)}
                      onRemovePhoto={() => setPhoto(null)}
                      video={null}
                      onSetVideo={() => {}}
                      onRemoveVideo={() => {}}
                      upload={uploadPhoto}
                      maxPhotos={1}
                      label="Photo of the crates (required)"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn kind="ghost" small onClick={() => setCollectingId(null)}>
                      Cancel
                    </Btn>
                    <Btn
                      small
                      full
                      kind="green"
                      disabled={busy || amount === "" || Number(amount) <= 0 || !photo}
                      onClick={async () => {
                        setBusy(true);
                        await collectMissingCrates(d.id, d.driver_id, Number(amount), photo);
                        setBusy(false);
                        setCollectingId(null);
                        setAmount("");
                        setPhoto(null);
                      }}
                    >
                      {busy ? "Saving…" : "Confirm collected"}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resolved history — loaded on demand */}
      <div>
        {!history ? (
          <Btn kind="ghost" small onClick={loadHistory} disabled={loadingHistory}>
            {loadingHistory ? "Loading…" : "Show recently resolved"}
          </Btn>
        ) : (
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: T.tan, fontWeight: 800, fontSize: 13 }}>
              Recently collected
            </div>
            {history.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: T.mute, textAlign: "center" }}>Nothing resolved yet.</div>
            )}
            {history.map((d) => (
              <div key={d.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {customerName(d.customer_id)} · {d.missing_crates} crate{d.missing_crates !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, color: T.mute }}>{fmtDateTime(d.missing_crates_resolved_at)}</span>
                </div>
                {d.missing_crates_photos && d.missing_crates_photos.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {d.missing_crates_photos.map((p, i) => (
                      <a key={i} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt={`proof ${i + 1}`} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: `1.5px solid ${T.line}` }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
