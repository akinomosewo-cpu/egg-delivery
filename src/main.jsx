import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import TrackingPage from "./TrackingPage.jsx";
import "./index.css";
import { initNotifications } from "./notifications";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW registration failed:", err));
  });
}

initNotifications();

// Simple path-based routing — no router library needed.
// /track/<delivery-id> shows the public tracking page; everything else
// shows the normal app (Admin/Driver).
const trackMatch = window.location.pathname.match(/^\/track\/([a-zA-Z0-9-]+)/);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {trackMatch ? <TrackingPage deliveryId={trackMatch[1]} /> : <App />}
  </React.StrictMode>
);

// Explicitly tell the boot-splash we're actually ready, rather than making
// it guess by watching for DOM changes — that inference was reliable on
// Android/web but noticeably slower on iOS's browser engine.
requestAnimationFrame(() => {
  if (window.__appBooted) window.__appBooted();
});
