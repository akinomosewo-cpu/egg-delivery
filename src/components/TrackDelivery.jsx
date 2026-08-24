import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "../supabase";
import { getRoute } from "../routing";

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#2A7DE1;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});
const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#111;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 16],
});
const ABUJA_CENTER = [9.0765, 7.3986];
const POLL_MS = 15000;

// The public link a customer gets by SMS when a driver starts their route.
// No login, no account — just this token in the URL. It works only while
// the delivery is actively in_transit/arrived; once marked delivered (or if
// the token is wrong/made up), the lookup simply returns nothing and this
// shows a plain "not active" message instead of ever erroring or leaking
// data about some other delivery.
export default function TrackDelivery({ token }) {
  const [info, setInfo] = useState(undefined); // undefined = loading, null = not found/expired
  const [route, setRoute] = useState(null);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_tracking_info", { p_token: token });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setInfo(null);
        return;
      }
      setInfo(data[0]);
    };
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!info || !mapRef.current || leafletMapRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: false }).setView(ABUJA_CENTER, 13);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
  }, [info]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !info || info.driver_lat == null) return;

    if (driverMarkerRef.current) map.removeLayer(driverMarkerRef.current);
    driverMarkerRef.current = L.marker([info.driver_lat, info.driver_lng], { icon: driverIcon }).addTo(map);

    if (info.customer_lat != null) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = L.marker([info.customer_lat, info.customer_lng], { icon: destinationIcon }).addTo(map);
      }
      const bounds = L.latLngBounds([
        [info.driver_lat, info.driver_lng],
        [info.customer_lat, info.customer_lng],
      ]);
      map.fitBounds(bounds.pad(0.4), { maxZoom: 15 });

      getRoute({ lat: info.driver_lat, lng: info.driver_lng }, { lat: info.customer_lat, lng: info.customer_lng })
        .then((r) => {
          if (!r) return;
          setRoute(r);
          if (routeLineRef.current) map.removeLayer(routeLineRef.current);
          routeLineRef.current = L.polyline(r.points, { color: "#2A7DE1", weight: 4, opacity: 0.8 }).addTo(map);
        })
        .catch((e) => console.error("Route lookup failed:", e));
    } else {
      map.setView([info.driver_lat, info.driver_lng], 14);
    }
  }, [info]);

  const wrap = (children) => (
    <div style={{ minHeight: "100vh", background: "#F5F2EA", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "16px 20px", background: "#1A1A1A", color: "#fff" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>CosNg Delivery Tracking</div>
      </div>
      {children}
    </div>
  );

  if (info === undefined) {
    return wrap(
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        Loading…
      </div>
    );
  }

  if (info === null) {
    return wrap(
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>This delivery has been completed</div>
        <div style={{ color: "#666", fontSize: 14 }}>This tracking link is no longer active. Thank you for your order!</div>
      </div>
    );
  }

  return wrap(
    <>
      <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid #ddd" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {info.status === "arrived" ? "Your driver has arrived" : "Your driver is on the way"}
        </div>
        {route && info.status !== "arrived" && (
          <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>Estimated arrival: ~{route.durationMin} min</div>
        )}
      </div>
      <div ref={mapRef} style={{ flex: 1, minHeight: 400 }} />
    </>
  );
}
