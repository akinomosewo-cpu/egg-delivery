import { useState } from "react";
import { T, Btn, TextInput } from "./ui";
import { getStorageUsage } from "../supabase";

export default function AdminManage({ drivers, customers, helpers, addDriver, deactivateDriver, addCustomer, deactivateCustomer, addHelper, deactivateHelper }) {
  const [dName, setDName] = useState("");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cArea, setCArea] = useState("");
  const [cAddress, setCAddress] = useState("");
  const [hName, setHName] = useState("");
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(null); // { totalBytes, fileCount }
  const [storageChecking, setStorageChecking] = useState(false);
  const [storageError, setStorageError] = useState(null);

  const FREE_TIER_BYTES = 1024 * 1024 * 1024; // 1GB — Supabase free tier default

  const checkStorage = async () => {
    setStorageChecking(true);
    setStorageError(null);
    try {
      const usage = await getStorageUsage();
      setStorage(usage);
    } catch (e) {
      setStorageError(e.message || "Could not check storage");
    } finally {
      setStorageChecking(false);
    }
  };

  const saveDriver = async () => {
    if (!dName.trim()) return;
    setBusy(true);
    await addDriver(dName.trim());
    setDName("");
    setBusy(false);
  };

  const saveHelper = async () => {
    if (!hName.trim()) return;
    setBusy(true);
    await addHelper(hName.trim());
    setHName("");
    setBusy(false);
  };

  const saveCustomer = async () => {
    if (!cName.trim()) return;
    setBusy(true);
    await addCustomer({ name: cName.trim(), phone: cPhone.trim() || null, area: cArea.trim() || null, address: cAddress.trim() || null });
    setCName("");
    setCPhone("");
    setCArea("");
    setCAddress("");
    setBusy(false);
  };

  const section = { background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 16 };
  const row = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "9px 0",
    borderBottom: `1px solid ${T.line}`,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Drivers */}
      <div style={section}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Drivers</div>
        {drivers.map((d) => (
          <div key={d.id} style={row}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</span>
            <Btn kind="danger" small onClick={() => deactivateDriver(d.id)}>
              Remove
            </Btn>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
          <TextInput label="New driver name" value={dName} onChange={setDName} placeholder="e.g. Ibrahim" />
          <Btn onClick={saveDriver} disabled={busy || !dName.trim()}>
            Add
          </Btn>
        </div>
      </div>

      {/* Customers */}
      <div style={section}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
          Customers <span style={{ color: T.mute, fontWeight: 600, fontSize: 12 }}>({customers.length})</span>
        </div>
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {customers.map((c) => (
            <div key={c.id} style={row}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: T.mute }}>
                  {[c.area, c.phone].filter(Boolean).join(" · ")}
                </div>
                {c.address && <div style={{ fontSize: 11, color: T.mute, fontStyle: "italic" }}>{c.address}</div>}
              </div>
              <Btn kind="danger" small onClick={() => deactivateCustomer(c.id)}>
                Remove
              </Btn>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <TextInput label="Customer name" value={cName} onChange={setCName} placeholder="e.g. Mama Blessing Stores" />
          <div style={{ display: "flex", gap: 10 }}>
            <TextInput label="Phone (optional)" value={cPhone} onChange={setCPhone} placeholder="080…" />
            <TextInput label="Area (optional)" value={cArea} onChange={setCArea} placeholder="e.g. Wuse" />
          </div>
          <TextInput label="Full address (optional)" value={cAddress} onChange={setCAddress} placeholder="e.g. Plot 113, Sector S, Life Camp" />
          <Btn onClick={saveCustomer} disabled={busy || !cName.trim()}>
            Add customer
          </Btn>
        </div>
      </div>

      {/* Helpers */}
      <div style={section}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
          Helpers <span style={{ color: T.mute, fontWeight: 600, fontSize: 12 }}>({helpers.length})</span>
        </div>
        <div style={{ fontSize: 12, color: T.mute, marginBottom: 10 }}>
          People drivers can bring along — they'll show up as options when a driver claims a delivery.
        </div>
        {helpers.map((h) => (
          <div key={h.id} style={row}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{h.name}</span>
            <Btn kind="danger" small onClick={() => deactivateHelper(h.id)}>
              Remove
            </Btn>
          </div>
        ))}
        {helpers.length === 0 && (
          <div style={{ fontSize: 13, color: T.mute, padding: "6px 0" }}>No helpers added yet.</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
          <TextInput label="New helper name" value={hName} onChange={setHName} placeholder="e.g. Emeka" />
          <Btn onClick={saveHelper} disabled={busy || !hName.trim()}>
            Add
          </Btn>
        </div>
      </div>

      {/* Storage usage */}
      <div style={section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Storage (photos &amp; videos)</div>
          <Btn kind="ghost" small onClick={checkStorage} disabled={storageChecking}>
            {storageChecking ? "Checking…" : "Check now"}
          </Btn>
        </div>

        {storageError && <div style={{ fontSize: 13, color: T.red, fontWeight: 700 }}>{storageError}</div>}

        {!storage && !storageError && (
          <div style={{ fontSize: 13, color: T.mute }}>Tap "Check now" to see how much space is used.</div>
        )}

        {storage && (() => {
          const usedMb = storage.totalBytes / (1024 * 1024);
          const pct = Math.min(100, (storage.totalBytes / FREE_TIER_BYTES) * 100);
          const nearFull = pct >= 80;
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <span>{usedMb.toFixed(1)} MB used · {storage.fileCount} files</span>
                <span style={{ color: nearFull ? T.red : T.mute }}>{pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: T.tan, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: nearFull ? T.red : T.yolk,
                    borderRadius: 99,
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: T.mute, marginTop: 6 }}>
                Estimate against Supabase's free-tier 1GB limit — actual limit may differ if you're on a paid plan.
              </div>
              {nearFull && (
                <div style={{ fontSize: 12, color: T.red, fontWeight: 700, marginTop: 6 }}>
                  ⚠ Getting close to the free-tier limit — consider upgrading or clearing old photos/videos.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div style={{ fontSize: 12, color: T.mute, textAlign: "center" }}>
        "Remove" hides them from new deliveries — past records are kept.
      </div>
    </div>
  );
}
