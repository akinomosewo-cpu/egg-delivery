import { T, Tag, fmtQty, fmtTime, fmtDateTime } from "./ui";

export default function AdminDashboard({ drivers, customers, deliveries, crateReturns }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: T.green,
            display: "inline-block",
            animation: "pulse 1.6s infinite",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>
          Live — updates as drivers work
        </span>
      </div>

      {drivers.map((drv) => {
        const list = deliveries.filter((d) => d.driver_id === drv.id);
        const done = list.filter((d) => d.status === "delivered");
        const ret = crateReturns.find((r) => r.driver_id === drv.id);
        if (list.length === 0 && !ret) return null;
        return (
          <div
            key={drv.id}
            style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                background: T.tan,
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15 }}>{drv.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.mute }}>
                {done.length}/{list.length} stops done
              </span>
            </div>

            {list.map((d) => {
              const c = customers.find((x) => x.id === d.customer_id);
              const short =
                d.status === "delivered" &&
                (d.crates_delivered !== d.crates_assigned || d.eggs_delivered !== d.eggs_assigned);
              return (
                <div key={d.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c ? c.name : "…"}</div>
                    {d.status === "delivered" ? (
                      <Tag color={T.green} bg={T.greenBg}>
                        ✓ {fmtDateTime(d.delivered_at)}
                      </Tag>
                    ) : d.status === "arrived" ? (
                      <Tag color={T.yolkDark} bg={T.greenBg}>
                        Arrived
                      </Tag>
                    ) : d.status === "in_transit" ? (
                      <Tag color={T.yolkDark} bg={T.tan}>
                        On the way
                      </Tag>
                    ) : (
                      <Tag color={T.mute} bg={T.tan}>
                        pending
                      </Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>
                    Assigned {fmtQty(d.crates_assigned, d.eggs_assigned)}
                    {d.status === "delivered" && (
                      <>
                        {" · "}
                        <span style={{ color: short ? T.red : T.green, fontWeight: 700 }}>
                          Delivered {fmtQty(d.crates_delivered || 0, d.eggs_delivered || 0)}
                          {short && " ⚠ mismatch"}
                        </span>
                      </>
                    )}
                  </div>
                  {((d.photo_urls && d.photo_urls.length > 0) || d.video_url) && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      {(d.photo_urls || []).map((p, i) => (
                        <a key={i} href={p} target="_blank" rel="noreferrer">
                          <img
                            src={p}
                            alt={`delivery proof ${i + 1}`}
                            style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }}
                          />
                        </a>
                      ))}
                      {d.video_url && (
                        <a href={d.video_url} target="_blank" rel="noreferrer">
                          <video src={d.video_url} style={{ width: 90, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {ret && (
              <div style={{ padding: "12px 14px", background: "#F5FBE6" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: T.yolkDark }}>
                  Crates returned: {ret.crate_count} · {fmtDateTime(ret.submitted_at)}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  {(ret.photo_urls || []).map((p, i) => (
                    <a key={i} href={p} target="_blank" rel="noreferrer">
                      <img
                        src={p}
                        alt={`crates ${i + 1}`}
                        style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }}
                      />
                    </a>
                  ))}
                  {ret.video_url && (
                    <a href={ret.video_url} target="_blank" rel="noreferrer">
                      <video src={ret.video_url} style={{ width: 90, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {deliveries.length === 0 && crateReturns.length === 0 && (
        <div style={{ textAlign: "center", color: T.mute, fontSize: 14, padding: 30 }}>
          No deliveries yet today. Add stops in the Plan tab.
        </div>
      )}
    </div>
  );
}
