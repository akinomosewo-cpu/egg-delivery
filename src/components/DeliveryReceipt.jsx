// DeliveryReceipt.jsx — generates a clean branded receipt and shares it
// via the native share sheet (WhatsApp, email, Bluetooth, etc.)
// Called from DriverApp after a delivery is marked complete.

import { T, Btn } from "./ui";

const fmtMoney = (n) =>
  n ? "₦" + Number(n).toLocaleString("en-NG") : "₦0";

const fmtDate = (d) =>
  new Date(d || Date.now()).toLocaleDateString("en-NG", {
    day: "numeric", month: "long", year: "numeric",
  });

// Generates an HTML string for the receipt
function buildReceiptHTML({ customerName, driverName, delivery, sizes }) {
  const rows = [
    ["Big Large", delivery.big_large_assigned, delivery.big_large_delivered],
    ["Small Large", delivery.small_large_assigned, delivery.small_large_delivered],
    ["Medium", delivery.medium_assigned, delivery.medium_delivered],
    ["Pullet", delivery.pullet_assigned, delivery.pullet_delivered],
    ["Extra", delivery.extra_assigned || 0, delivery.extra_delivered || 0],
  ].filter(([, assigned]) => assigned > 0);

  const rowsHTML = rows.map(([label, assigned, delivered]) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;color:#555">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;text-align:right;color:#555">${assigned} crates</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0e8d8;text-align:right;font-weight:700">${delivered ?? assigned} crates</td>
    </tr>`).join("");

  const hasIssues = (delivery.missing_crates || 0) > 0 || (delivery.backorder_crates || 0) > 0;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CosNg Delivery Receipt</title>
</head>
<body style="margin:0;padding:0;background:#f7f3ee;font-family:system-ui,-apple-system,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#1a1a1a;padding:28px 24px 20px;text-align:center">
    <div style="color:#f5c842;font-size:22px;font-weight:900;letter-spacing:0.5px">🥚 CosNg</div>
    <div style="color:#fff;font-size:12px;opacity:0.7;margin-top:4px">NIGERIA ENTERPRISES LTD · RC7383025</div>
    <div style="color:#f5c842;font-size:13px;font-weight:700;margin-top:14px">DELIVERY RECEIPT</div>
  </div>

  <!-- Customer + Date -->
  <div style="padding:20px 24px;border-bottom:2px dashed #f0e8d8">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Delivered to</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px">${customerName}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">Date</div>
        <div style="font-size:13px;font-weight:700;margin-top:4px">${fmtDate(delivery.delivered_at || delivery.delivery_date)}</div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:12px;color:#777">Driver: <strong>${driverName}</strong></div>
  </div>

  <!-- Items -->
  <div style="padding:20px 24px">
    <div style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Items</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr>
          <th style="text-align:left;color:#999;font-size:11px;padding-bottom:8px;font-weight:600">Type</th>
          <th style="text-align:right;color:#999;font-size:11px;padding-bottom:8px;font-weight:600">Ordered</th>
          <th style="text-align:right;color:#999;font-size:11px;padding-bottom:8px;font-weight:600">Delivered</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>
  </div>

  <!-- Issues -->
  ${hasIssues ? `
  <div style="margin:0 24px;background:#fff3cd;border-radius:8px;padding:12px 14px;font-size:13px">
    ${(delivery.missing_crates || 0) > 0 ? `<div>⚠️ <strong>${delivery.missing_crates} crate${delivery.missing_crates !== 1 ? "s" : ""}</strong> returned cracked</div>` : ""}
    ${(delivery.backorder_crates || 0) > 0 ? `<div>📋 <strong>${delivery.backorder_crates} crate${delivery.backorder_crates !== 1 ? "s" : ""}</strong> still owed to customer</div>` : ""}
  </div>` : ""}

  <!-- Payment -->
  <div style="margin:20px 24px;background:#f7f3ee;border-radius:10px;padding:16px">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span style="color:#555;font-size:14px">Amount due</span>
      <span style="font-weight:700;font-size:14px">${fmtMoney(delivery.price_due)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #e8dcc8">
      <span style="color:#1a1a1a;font-weight:800;font-size:15px">Collected</span>
      <span style="color:#2e7d32;font-weight:900;font-size:18px">${fmtMoney(delivery.payment_collected)}</span>
    </div>
    ${Number(delivery.price_due || 0) > Number(delivery.payment_collected || 0) ? `
    <div style="display:flex;justify-content:space-between;margin-top:8px">
      <span style="color:#c62828;font-size:13px">Outstanding</span>
      <span style="color:#c62828;font-weight:700;font-size:13px">${fmtMoney(Number(delivery.price_due) - Number(delivery.payment_collected))}</span>
    </div>` : ""}
  </div>

  <!-- Footer -->
  <div style="background:#f7f3ee;padding:16px 24px;text-align:center;border-top:1px solid #e8dcc8">
    <div style="font-size:12px;color:#999">Thank you for your business!</div>
    <div style="font-size:11px;color:#bbb;margin-top:4px">CosNg Nigeria Enterprises Ltd · Abuja, Nigeria</div>
  </div>

</div>
</body>
</html>`;
}

// Share the receipt via native share sheet or fallback to copying text
export async function shareReceipt({ customerName, driverName, delivery }) {
  const html = buildReceiptHTML({ customerName, driverName, delivery });

  // Try native Web Share API first (works on Android/iOS via Capacitor)
  if (navigator.share) {
    try {
      // Share as a .html file the customer can open in their browser
      const blob = new Blob([html], { type: "text/html" });
      const file = new File([blob], `CosNg-Receipt-${customerName.replace(/\s+/g, "-")}.html`, { type: "text/html" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `CosNg Delivery Receipt — ${customerName}`,
          text: `Delivery receipt from CosNg Nigeria Enterprises Ltd`,
          files: [file],
        });
        return { ok: true };
      }

      // File sharing not supported, share as text summary
      const lines = [
        `🥚 CosNg Delivery Receipt`,
        `Customer: ${customerName}`,
        `Driver: ${driverName}`,
        `Date: ${fmtDate(delivery.delivered_at || delivery.delivery_date)}`,
        `Crates delivered: ${delivery.crates_delivered || delivery.crates_assigned}`,
        `Amount due: ${fmtMoney(delivery.price_due)}`,
        `Collected: ${fmtMoney(delivery.payment_collected)}`,
        ``,
        `CosNg Nigeria Enterprises Ltd · RC7383025`,
      ];
      await navigator.share({
        title: `CosNg Receipt — ${customerName}`,
        text: lines.join("\n"),
      });
      return { ok: true };
    } catch (e) {
      if (e.name === "AbortError") return { ok: false, reason: "cancelled" };
      console.warn("Share failed:", e.message);
    }
  }

  // Fallback: open receipt in a new tab/window
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    return { ok: true };
  }

  return { ok: false, reason: "unsupported" };
}

// In-app receipt preview card shown after delivery is marked complete
export function ReceiptShareButton({ customerName, driverName, delivery, style }) {
  return (
    <button
      onClick={() => shareReceipt({ customerName, driverName, delivery })}
      style={{
        width: "100%",
        padding: "13px 0",
        borderRadius: 10,
        border: `1.5px solid #f5c842`,
        background: "#fffbea",
        color: "#1a1a1a",
        fontWeight: 800,
        fontSize: 14,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...style,
      }}
    >
      📤 Share receipt with customer
    </button>
  );
}
