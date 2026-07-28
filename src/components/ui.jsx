import { useRef, useState } from "react";

export const T = {
  ink: "#111111",
  paper: "#FAFAF8",
  card: "#FFFFFF",
  line: "#E6E6E2",
  yolk: "#A6E838",
  yolkDark: "#4E8A00",
  green: "#3E7A1E",
  greenBg: "#E4F7C0",
  red: "#DD4A2F",
  mute: "#75756E",
  tan: "#F0F0EC",
};

export const fmtQty = (crates, eggs) => {
  const parts = [];
  if (crates > 0) parts.push(`${crates} crate${crates !== 1 ? "s" : ""}`);
  if (eggs > 0) parts.push(`${eggs} egg${eggs !== 1 ? "s" : ""}`);
  return parts.length ? parts.join(" + ") : "0";
};

export const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "";

export const fmtDateTime = (ts) =>
  ts
    ? new Date(ts).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

export const Btn = ({ children, onClick, kind = "primary", full, small, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      fontFamily: "inherit",
      cursor: disabled ? "not-allowed" : "pointer",
      border: "none",
      borderRadius: 14,
      fontWeight: 800,
      fontSize: small ? 13 : 15,
      padding: small ? "8px 14px" : "13px 18px",
      width: full ? "100%" : "auto",
      opacity: disabled ? 0.45 : 1,
      background:
        kind === "primary" ? T.yolk : kind === "green" ? T.green : kind === "ghost" ? "transparent" : kind === "danger" ? "#FBE7E2" : T.tan,
      color: kind === "green" ? "#fff" : kind === "ghost" ? T.mute : kind === "danger" ? T.red : T.ink,
      boxShadow: "none",
    }}
  >
    {children}
  </button>
);

export const Tag = ({ children, color, bg }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color,
      background: bg,
      padding: "3px 8px",
      borderRadius: 999,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

export const NumInput = ({ label, value, onChange, width = 90 }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.mute, fontWeight: 600 }}>
    {label}
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
      style={{
        width,
        padding: "10px 10px",
        fontSize: 16,
        fontWeight: 700,
        color: T.ink,
        border: `1.5px solid ${T.line}`,
        borderRadius: 8,
        background: "#fff",
        fontFamily: "inherit",
      }}
    />
  </label>
);

export const TextInput = ({ label, value, onChange, placeholder }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.mute, fontWeight: 600, flex: 1 }}>
    {label}
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        fontSize: 15,
        color: "#2A2118",
        border: `1.5px solid ${T.line}`,
        borderRadius: 8,
        background: "#fff",
        fontFamily: "inherit",
      }}
    />
  </label>
);

// Media capture: up to N photos + one optional video
export const MediaCapture = ({
  photos,
  onAddPhoto,
  onRemovePhoto,
  video,
  onSetVideo,
  onRemoveVideo,
  upload,
  maxPhotos = 5,
  label = "Photos",
}) => {
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [busyVideo, setBusyVideo] = useState(false);
  const [err, setErr] = useState(null);

  const handlePhoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusyPhoto(true);
    setErr(null);
    try {
      const url = await upload(f);
      onAddPhoto(url);
    } catch (ex) {
      setErr(ex.message || "Upload failed — check network and retry");
      console.error(ex);
    } finally {
      setBusyPhoto(false);
    }
  };

  const handleVideo = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusyVideo(true);
    setErr(null);
    try {
      const url = await upload(f);
      onSetVideo(url);
    } catch (ex) {
      setErr(ex.message || "Video upload failed — check network and retry");
      console.error(ex);
    } finally {
      setBusyVideo(false);
    }
  };

  return (
    <div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }} onChange={handleVideo} />

      <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 6 }}>
        {label} ({photos.length}/{maxPhotos})
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p} alt={`photo ${i + 1}`} style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} />
            <button
              onClick={() => onRemovePhoto(i)}
              style={{
                position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99,
                border: "none", background: T.red, color: "#fff", fontSize: 12, fontWeight: 800,
                cursor: "pointer", lineHeight: "20px", padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < maxPhotos && (
          <button
            onClick={() => !busyPhoto && photoRef.current && photoRef.current.click()}
            style={{
              width: 54, height: 54, borderRadius: 8, border: `2px dashed ${T.ink}`,
              background: "#F5FBE6", color: T.ink, fontSize: busyPhoto ? 12 : 22, fontWeight: 700,
              cursor: busyPhoto ? "wait" : "pointer", fontFamily: "inherit",
            }}
          >
            {busyPhoto ? "…" : "📷"}
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: T.mute, fontWeight: 600, marginBottom: 6 }}>Video (optional)</div>
      {video ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <video src={video} style={{ width: 90, height: 54, objectFit: "cover", borderRadius: 8, border: `1.5px solid ${T.line}` }} muted />
          <Btn kind="danger" small onClick={onRemoveVideo}>Remove video</Btn>
        </div>
      ) : (
        <button
          onClick={() => !busyVideo && videoRef.current && videoRef.current.click()}
          style={{
            padding: "9px 14px", borderRadius: 8, border: `2px dashed ${T.line}`, background: "#fff",
            color: T.mute, fontSize: 13, fontWeight: 700, cursor: busyVideo ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {busyVideo ? "Uploading… (large videos can take a while)" : "＋ Add a short video"}
        </button>
      )}

      {err && <div style={{ fontSize: 12, color: T.red, fontWeight: 700, marginTop: 6 }}>{err}</div>}
    </div>
  );
};
