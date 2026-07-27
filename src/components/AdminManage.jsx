import { useState } from "react";
import { T, Btn, TextInput } from "./ui";

export default function AdminManage({ drivers, customers, addDriver, deactivateDriver, addCustomer, deactivateCustomer }) {
  const [dName, setDName] = useState("");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cArea, setCArea] = useState("");
  const [busy, setBusy] = useState(false);

  const saveDriver = async () => {
    if (!dName.trim()) return;
    setBusy(true);
    await addDriver(dName.trim());
    setDName("");
    setBusy(false);
  };

  const saveCustomer = async () => {
    if (!cName.trim()) return;
    setBusy(true);
    await addCustomer({ name: cName.trim(), phone: cPhone.trim() || null, area: cArea.trim() || null });
    setCName("");
    setCPhone("");
    setCArea("");
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
          <Btn onClick={saveCustomer} disabled={busy || !cName.trim()}>
            Add customer
          </Btn>
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.mute, textAlign: "center" }}>
        "Remove" hides them from new deliveries — past records are kept.
      </div>
    </div>
  );
}
