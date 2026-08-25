// Vercel serverless function. Runs server-side (Node.js), so this never hits
// browser CORS restrictions the way a direct client-side fetch to EbulkSMS
// does — and it also keeps the API key out of the public JS bundle, unlike
// a VITE_-prefixed variable which gets baked into client code anyone can
// read. Reachable at /api/send-sms from both the web app and the native
// app (as long as the native app calls the full https://your-domain/api/send-sms
// URL, not a relative path, since the app's own bundle has no server of its own).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { recipient, message } = req.body || {};
  if (!recipient || !message) {
    res.status(400).json({ error: "Missing recipient or message" });
    return;
  }

  const username = process.env.EBULKSMS_USERNAME;
  const apikey = process.env.EBULKSMS_APIKEY;
  const senderId = process.env.EBULKSMS_SENDER_ID || "COSNG";

  if (!username || !apikey) {
    console.warn("EbulkSMS credentials not configured on the server");
    res.status(500).json({ error: "SMS not configured" });
    return;
  }

  // Nigerian number -> the 234... international format EbulkSMS expects
  const digits = String(recipient).replace(/\D/g, "");
  const msidn = digits.startsWith("234") ? digits : digits.startsWith("0") ? "234" + digits.slice(1) : digits;

  try {
    const ebulkRes = await fetch("https://api.ebulksms.com/sendsms.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        SMS: {
          auth: { username, apikey },
          message: { sender: senderId, messagetext: message, flash: "0" },
          recipients: { gsm: [{ msidn, msgid: `del_${Date.now()}` }] },
          dndsender: 1,
        },
      }),
    });
    const data = await ebulkRes.json();
    res.status(200).json(data);
  } catch (e) {
    console.error("EbulkSMS call failed:", e);
    res.status(502).json({ error: "SMS provider unreachable" });
  }
}
