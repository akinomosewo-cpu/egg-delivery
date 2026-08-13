import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "./supabase";

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });
const driverPin = pin("#4E8A00");
const customerPin = pin("#111111");

// This page is deliberately minimal: it only ever fetches the one delivery's
// status, the driver's current position, and the customer's position — no
// prices, no other customers, no admin data of any kind, ever.
export default function TrackingPage({ deliveryId }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [driverPos, setDriverPos] = useState(null);
  const [customerPos, setCustomerPos] = useState(null);
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: delivery, error } = await supabase
        .from("deliveries")
        .select("id, status, driver_id, customer_id")
        .eq("id", deliveryId)
        .single();

      if (cancelled) return;
      if (error || !delivery) {
        setStatus("notfound");
        return;
      }
      if (delivery.status === "delivered") {
        setStatus("delivered");
        return;
      }
      if (!delivery.driver_id) {
        setStatus("loading");
        return;
      }

      const [{ data: loc }, { data: customer }] = await Promise.all([
        supabase.from("driver_locations").select("lat, lng").eq("driver_id", delivery.driver_id).single(),
        supabase.from("customers").select("name, lat, lng").eq("id", delivery.customer_id).single(),
      ]);

      if (cancelled) return;
      if (customer) {
        setCustomerName(customer.name || "");
        if (customer.lat != null && customer.lng != null) setCustomerPos([customer.lat, customer.lng]);
      }
      if (loc) setDriverPos([loc.lat, loc.lng]);
      setStatus("tracking");
    };

    load();
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deliveryId]);

  useEffect(() => {
    if (status !== "tracking" || !mapRef.current || leafletMapRef.current) return;
    const center = driverPos || customerPos || [9.0765, 7.3986];
    const map = L.map(mapRef.current).setView(center, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
  }, [status, driverPos, customerPos]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    const points = [];
    if (driverPos) {
      L.marker(driverPos, { icon: driverPin }).addTo(map).bindPopup("Driver");
      points.push(driverPos);
    }
    if (customerPos) {
      L.marker(customerPos, { icon: customerPin }).addTo(map).bindPopup(customerName || "You");
      points.push(customerPos);
    }
    if (points.length === 2) {
      map.fitBounds(L.latLngBounds(points).pad(0.4), { maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [driverPos, customerPos, customerName]);

  const wrap = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "system-ui, sans-serif", background: "#FAFAF8" };

  if (status === "loading") {
    return <div style={wrap}><div style={{ fontSize: 15, color: "#75756E" }}>Getting things ready…</div></div>;
  }
  if (status === "notfound") {
    return <div style={wrap}><div style={{ fontSize: 15, color: "#75756E" }}>This tracking link isn't valid.</div></div>;
  }
  if (status === "delivered") {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Delivery completed</div>
        <div style={{ fontSize: 13, color: "#75756E", marginTop: 4 }}>This tracking link is no longer active.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF8", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "16px 16px 8px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Your delivery is on the way</div>
        <div style={{ fontSize: 13, color: "#75756E" }}>Updates automatically</div>
      </div>
      <div ref={mapRef} style={{ width: "100%", height: "70vh" }} />
    </div>
  );
}
