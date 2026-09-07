import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

// Converts a base64 data string (no data: prefix) into a File, so it can
// go through the exact same `upload(file)` path as a picked/gallery file.
const base64ToFile = (base64Data, filename, mimeType) => {
  const byteChars = atob(base64Data);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
};

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

export const NumInput = ({ label, value, onChange, width = 90, decimal = false, fractions = false }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: T.mute, fontWeight: 600 }}>
    {label}
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      pattern={decimal ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange("");
        // Filter to only what's valid — keeps the raw string while typing
        // (e.g. a trailing "5." mid-type) instead of parsing on every keystroke,
        // which is what was silently eating the decimal point on iPhone/Android.
        const re = decimal ? /^\d*\.?\d*$/ : /^\d*$/;
        if (re.test(raw)) onChange(raw);
      }}
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
    {fractions && (
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        {[
          ["½", 0.5],
          ["¼", 0.25],
          ["¾", 0.75],
        ].map(([label2, frac]) => (
          <button
            key={label2}
            type="button"
            onClick={() => {
              const whole = Math.floor(Number(value) || 0);
              onChange(String(whole + frac));
            }}
            style={{
              flex: 1,
              padding: "5px 0",
              fontSize: 13,
              fontWeight: 700,
              color: T.ink,
              background: T.tan,
              border: `1px solid ${T.line}`,
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {label2}
          </button>
        ))}
      </div>
    )}
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

// Media capture: up to N photos, no video (video support removed).
// Two ways in: "＋" tile opens the normal file/gallery picker; the
// "Take a photo now" button uses capture="environment" so it opens the
// rear camera directly. Any video/onSetVideo/onRemoveVideo props passed
// in by older callers are accepted and ignored — this component no
// longer does anything with video.
export const MediaCapture = ({
  photos,
  onAddPhoto,
  onRemovePhoto,
  upload,
  maxPhotos = 5,
  label = "Photos",
}) => {
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [err, setErr] = useState(null);

  const photoInputRef = useRef(null);

  const handlePhotoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // reset so picking the same file again still fires onChange
    if (!file) return;
    setBusyPhoto(true);
    setErr(null);
    try {
      const url = await upload(file);
      onAddPhoto(url);
    } catch (ex) {
      setErr(ex.message || "Upload failed — check network and retry");
      console.error(ex);
    } finally {
      setBusyPhoto(false);
    }
  };

  // Native camera capture — goes straight to Android's camera app via
  // Capacitor's Camera plugin. This is deliberately NOT a
  // <input type="file" capture="environment"> file picker: Capacitor's
  // Android WebView doesn't reliably honor the `capture` hint, so that
  // approach can silently fall back to the generic Camera/Files chooser
  // instead of opening the camera directly. The native plugin call
  // bypasses that entirely.
  const handleTakePhoto = async () => {
    setBusyPhoto(true);
    setErr(null);
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        saveToGallery: false,
      });
      const mimeType = `image/${photo.format || "jpeg"}`;
      const file = base64ToFile(photo.base64String, `photo-${Date.now()}.${photo.format || "jpg"}`, mimeType);
      const url = await upload(file);
      onAddPhoto(url);
    } catch (ex) {
      // User cancelling the camera also lands here — don't show an error for that.
      const cancelled = /cancel/i.test(ex && ex.message || "");
      if (!cancelled) {
        setErr(ex.message || "Camera capture failed — check camera permission and retry");
        console.error(ex);
      }
    } finally {
      setBusyPhoto(false);
    }
  };

  return (
    <div>
      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelected} style={{ display: "none" }} />

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
            onClick={() => !busyPhoto && photoInputRef.current && photoInputRef.current.click()}
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

      {/* Live camera button — opens rear camera directly, no file picker */}
      <div style={{ marginTop: 8 }}>
<<<<<<< HEAD
        <button
          onClick={() => !busyPhoto && handleTakePhoto()}
=======
        <input
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          ref={videoInputRef}
          onChange={handlePhotoSelected}
        />
        <button
          onClick={() => !busyPhoto && videoInputRef.current && videoInputRef.current.click()}
>>>>>>> 1ed71c833e4f529e3f6b44a5cd412f4e2e2f36d6
          style={{
            padding: "9px 14px", borderRadius: 8, border: `2px dashed ${T.line}`,
            background: "#fff", color: T.mute, fontSize: 13, fontWeight: 700,
            cursor: busyPhoto ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {busyPhoto ? "Uploading…" : "📷 Take a photo now"}
        </button>
      </div>

      {err && <div style={{ fontSize: 12, color: T.red, fontWeight: 700, marginTop: 6 }}>{err}</div>}
    </div>
  );
};

// Finger/mouse signature pad — draws to a canvas, uploads as a PNG on confirm
export const SignaturePad = ({ onCapture, upload }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0];
    const clientX = t ? t.clientX : e.clientX;
    const clientY = t ? t.clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const p = getPos(e, c);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    const p = getPos(e, c);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111111";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasDrawn.current = true;
  };
  const end = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  };

  const confirm = () => {
    if (!hasDrawn.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      setBusy(true);
      setErr(null);
      try {
        const file = new File([blob], "signature.png", { type: "image/png" });
        const url = await upload(file);
        onCapture(url);
      } catch (ex) {
        setErr(ex.message || "Could not save signature — try again");
        console.error(ex);
      } finally {
        setBusy(false);
      }
    }, "image/png");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        style={{
          width: "100%",
          height: 120,
          border: `1.5px solid ${T.line}`,
          borderRadius: 8,
          background: "#fff",
          touchAction: "none",
        }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Btn kind="ghost" small onClick={clear}>
          Clear
        </Btn>
        <Btn small onClick={confirm} disabled={busy}>
          {busy ? "Saving…" : "Use this signature"}
        </Btn>
      </div>
      {err && <div style={{ fontSize: 12, color: T.red, fontWeight: 700, marginTop: 6 }}>{err}</div>}
    </div>
  );
};