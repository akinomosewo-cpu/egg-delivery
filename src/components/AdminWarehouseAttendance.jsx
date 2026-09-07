import { useEffect, useMemo, useState } from "react";
import { T } from "./ui";
import { fetchEmployees, fetchAttendanceForEmployee } from "../warehouseSupabase";

const DAYS_SHOWN = 30;

// Warehouse is in Abuja (WAT, UTC+1, no DST) — attendance always renders in
// that timezone, regardless of what timezone the admin's own device is set to.
const TZ = "Africa/Lagos";

const fmtTime = (ts) =>
  ts
    ? new Date(ts)
        .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ })
        .toLowerCase()
        .replace(" ", "")
    : "—";

const abujaDateKey = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: TZ });

const abujaDatePartsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", weekday: "short" });
function abujaDateParts(ts) {
  const parts = Object.fromEntries(abujaDatePartsFmt.formatToParts(new Date(ts)).map((p) => [p.type, p.value]));
  return { day: Number(parts.day), month: parts.month, weekday: parts.weekday };
}

const fmtHoursShort = (inMs, outMs) => {
  if (inMs == null || outMs == null) return "—";
  const totalMin = Math.max(0, Math.round((outMs - inMs) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const fmtDuration = (ms) => {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} hour${h !== 1 ? "s" : ""} and ${m} min${m !== 1 ? "s" : ""}`;
};

const initials = (name) =>
  (name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

// Builds the last DAYS_SHOWN local-calendar days (most recent first), each
// paired with that day's clock-in/out if any — Sundays and days with no
// event render as "Absent" rows, same as the mockup.
function buildDayRows(events) {
  const byDay = {};
  for (const e of events) {
    const at = new Date(e.occurred_at).getTime();
    const key = abujaDateKey(at);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push({ type: e.event_type, at });
  }

  const rows = [];
  const nowMs = Date.now();

  // Lagos/Abuja has a fixed UTC+1 offset year-round (no DST), so walking
  // back in exact 24h steps from "now" never skips or repeats a calendar day.
  for (let i = 0; i < DAYS_SHOWN; i++) {
    const dayMs = nowMs - i * 86400000;
    const key = abujaDateKey(dayMs);
    const { day, month, weekday } = abujaDateParts(dayMs);
    const dayEvents = (byDay[key] || []).sort((a, b) => a.at - b.at);
    const inEvt = dayEvents.find((e) => e.type === "in");
    const outEvt = [...dayEvents].reverse().find((e) => e.type === "out");
    rows.push({
      key,
      date: day,
      month,
      dayName: weekday,
      present: !!inEvt,
      inAt: inEvt ? inEvt.at : null,
      outAt: outEvt ? outEvt.at : null,
      isToday: i === 0,
    });
  }
  return rows;
}

function StatCard({ label, value, accent }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: T.card,
        border: `1.5px solid ${T.line}`,
        borderRadius: 14,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: T.mute, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent || T.ink, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

function StatusDot({ present }) {
  const color = present ? T.green : T.red;
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: 99,
        background: color,
        marginRight: 7,
        flexShrink: 0,
      }}
    />
  );
}

export default function AdminWarehouseAttendance() {
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  // Ticks the "on shift now" banner forward while a worker is clocked in,
  // so the duration keeps counting up instead of freezing at the clock-in time.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchEmployees()
      .then((data) => {
        setEmployees(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch((e) => setError(e.message || "Could not load employees"))
      .finally(() => setLoadingEmployees(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingAttendance(true);
    setError(null);
    const since = new Date();
    since.setDate(since.getDate() - DAYS_SHOWN);
    fetchAttendanceForEmployee(selectedId, since.toISOString())
      .then((events) => setRows(buildDayRows(events)))
      .catch((e) => setError(e.message || "Could not load attendance"))
      .finally(() => setLoadingAttendance(false));
  }, [selectedId]);

  const selectedEmployee = employees.find((e) => e.id === selectedId);

  const todayRow = rows.find((r) => r.isToday);
  const todayStatus =
    todayRow && todayRow.inAt != null
      ? todayRow.outAt != null
        ? { label: "Today", detail: fmtDuration(todayRow.outAt - todayRow.inAt), live: false }
        : { label: "On shift now", detail: fmtDuration(now - todayRow.inAt), live: true }
      : { label: "Today", detail: "Not clocked in yet", live: false, idle: true };

  const stats = useMemo(() => {
    const presentDays = rows.filter((r) => r.present);
    const absentDays = rows.length - presentDays.length;
    const completedShifts = rows.filter((r) => r.inAt != null && r.outAt != null);
    const totalMin = completedShifts.reduce((s, r) => s + (r.outAt - r.inAt) / 60000, 0);
    const avgMin = completedShifts.length ? totalMin / completedShifts.length : 0;
    const rate = rows.length ? Math.round((presentDays.length / rows.length) * 100) : 0;
    return {
      presentDays: presentDays.length,
      absentDays,
      avgHours: completedShifts.length ? fmtHoursShort(0, avgMin * 60000) : "—",
      rate,
    };
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .wh-row:hover { background: ${T.tan} !important; }
        @keyframes wh-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 19 }}>Warehouse Attendance</div>
          <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginTop: 1 }}>Last {DAYS_SHOWN} days</div>
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px 6px 6px",
              border: `1.5px solid ${T.line}`,
              borderRadius: 99,
              background: T.card,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                background: T.greenBg,
                color: T.green,
                fontSize: 12,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(selectedEmployee?.name)}
            </span>
            <select
              value={selectedId || ""}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={loadingEmployees || employees.length === 0}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 14,
                fontWeight: 800,
                color: T.ink,
                fontFamily: "inherit",
                cursor: "pointer",
                appearance: "none",
                paddingRight: 4,
              }}
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: "#FBEAE6", color: T.red, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}>
          ⚠ {error}
        </div>
      )}

      {loadingEmployees ? (
        <div style={{ textAlign: "center", color: T.mute, padding: 40 }}>Loading employees…</div>
      ) : employees.length === 0 ? (
        <div style={{ textAlign: "center", color: T.mute, padding: 40 }}>No active employees found.</div>
      ) : (
        <>
          <div
            style={{
              background: `linear-gradient(135deg, ${T.ink}, #26261F)`,
              borderRadius: 16,
              padding: "20px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {todayStatus.live && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 99,
                      background: T.yolk,
                      display: "inline-block",
                      animation: "wh-pulse 1.6s infinite",
                    }}
                  />
                )}
                <span style={{ fontSize: 12, color: "#C9C9C0", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {todayStatus.label}
                </span>
              </div>
              <div style={{ fontSize: 24, color: todayStatus.idle ? "#8A8A80" : T.yolk, fontWeight: 900, lineHeight: 1.15 }}>
                {todayStatus.detail}
              </div>
            </div>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 99,
                background: "rgba(166,232,56,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              🕒
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <StatCard label="Present" value={stats.presentDays} accent={T.green} />
            <StatCard label="Absent" value={stats.absentDays} accent={T.red} />
          </div>

          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "0.9fr 1.1fr 0.9fr 0.9fr 0.8fr",
                padding: "11px 16px",
                background: T.tan,
                borderBottom: `1px solid ${T.line}`,
                fontSize: 11,
                fontWeight: 800,
                color: T.mute,
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              <span>Date</span>
              <span>Status</span>
              <span>In</span>
              <span>Out</span>
              <span style={{ textAlign: "right" }}>Hours</span>
            </div>

            {loadingAttendance ? (
              <div style={{ textAlign: "center", color: T.mute, padding: 30, fontSize: 13 }}>Loading attendance…</div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.key}
                  className="wh-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "0.9fr 1.1fr 0.9fr 0.9fr 0.8fr",
                    padding: "11px 16px",
                    borderBottom: `1px solid ${T.line}`,
                    borderLeft: r.isToday ? `3px solid ${T.yolk}` : "3px solid transparent",
                    fontSize: 13,
                    fontWeight: 600,
                    color: T.ink,
                    alignItems: "center",
                    transition: "background 0.1s",
                  }}
                >
                  <span>
                    <span style={{ fontWeight: 800 }}>{r.date}</span>{" "}
                    <span style={{ color: T.mute, fontWeight: 600 }}>
                      {r.dayName}
                      {r.isToday ? " · Today" : ""}
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <StatusDot present={r.present} />
                    {r.present ? "Present" : "Absent"}
                  </span>
                  <span style={{ color: r.inAt ? T.ink : T.mute }}>{fmtTime(r.inAt)}</span>
                  <span style={{ color: r.outAt ? T.ink : T.mute }}>{fmtTime(r.outAt)}</span>
                  <span style={{ textAlign: "right", fontWeight: 800, color: r.inAt && r.outAt ? T.ink : T.mute }}>
                    {fmtHoursShort(r.inAt, r.outAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
