import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { geocodeAddress } from "../geocode";
import { T } from "./ui";

// Default Leaflet marker icons reference image files that don't resolve
// correctly under Vite's bundling — build our own simple colored pin instead.
const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
  });

const driverPin = pin("#4E8A00");
const customerPin = pin("#111111");

const ABUJA_CENTER = [9.0765, 7.3986];

export default function AdminMap({ drivers, customers, driverLocations, geocodeCustomer }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");

  // Set up the map once
  useEffect(() => {
    if (leafletMapRef.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView(ABUJA_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  const hasFittedRef = useRef(false);

  const fitToMarkers = () => {
    const map = leafletMapRef.current;
    if (!map || markersRef.current.length === 0) return;
    const group = L.featureGroup(markersRef.current);
    map.fitBounds(group.getBounds().pad(0.2));
  };

  // Redraw markers whenever data changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    driverLocations.forEach((loc) => {
      const drv = drivers.find((d) => d.id === loc.driver_id);
      if (!drv) return;
      const minsAgo = Math.round((Date.now() - new Date(loc.updated_at)) / 60000);
      const marker = L.marker([loc.lat, loc.lng], { icon: driverPin })
        .addTo(map)
        .bindPopup(`<b>${drv.name}</b><br/>Updated ${minsAgo < 1 ? "just now" : `${minsAgo} min ago`}`);
      markersRef.current.push(marker);
    });

    customers.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const marker = L.marker([c.lat, c.lng], { icon: customerPin })
        .addTo(map)
        .bindPopup(`<b>${c.name}</b>${c.address ? `<br/>${c.address}` : ""}`);
      markersRef.current.push(marker);
    });

    // The first time pins actually exist, zoom to show them —
    // after that, leave the view alone so it doesn't jump around
    // every time a driver's position updates.
    if (!hasFittedRef.current && markersRef.current.length > 0) {
      fitToMarkers();
      hasFittedRef.current = true;
    }
  }, [driverLocations, drivers, customers]);

  const geocodeMissing = async () => {
    const missing = customers.filter((c) => c.address && (c.lat == null || c.lng == null));
    if (missing.length === 0) {
      setGeocodeStatus("All customers with an address are already on the map.");
      return;
    }
    setGeocoding(true);
    let done = 0;
    for (const c of missing) {
      setGeocodeStatus(`Locating ${c.name}… (${done + 1}/${missing.length})`);
      try {
        const result = await geocodeAddress(c.address);
        if (result) await geocodeCustomer(c.id, result.lat, result.lng);
      } catch (e) {
        console.error("Geocode failed for", c.name, e);
      }
      done++;
      // Nominatim's usage policy asks for max ~1 request/second
      await new Promise((r) => setTimeout(r, 1100));
    }
    setGeocoding(false);
    setGeocodeStatus(`Done — placed ${done} customer${done !== 1 ? "s" : ""} on the map.`);
  };

  const activeDrivers = driverLocations.filter((loc) => Date.now() - new Date(loc.updated_at) < 30 * 60000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: T.mute, fontWeight: 600 }}>
          {activeDrivers.length} driver{activeDrivers.length !== 1 ? "s" : ""} live (last 30 min)
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button
            onClick={fitToMarkers}
            style={{
              background: "none",
              border: "none",
              color: T.ink,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "underline",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Recenter
          </button>
          <button
            onClick={geocodeMissing}
            disabled={geocoding}
            style={{
              background: "none",
              border: "none",
              color: T.ink,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "underline",
              cursor: geocoding ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {geocoding ? "Locating…" : "Place customers on map"}
          </button>
        </div>
      </div>
      {geocodeStatus && <div style={{ fontSize: 12, color: T.mute }}>{geocodeStatus}</div>}

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: 420,
          borderRadius: 12,
          border: `1.5px solid ${T.line}`,
          overflow: "hidden",
        }}
      />

      <div style={{ fontSize: 11, color: T.mute, textAlign: "center" }}>
        🟢 Drivers · ⚫ Customers — driver positions only update while their app is open and their phone is unlocked.
      </div>
    </div>
  );
}