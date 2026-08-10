import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { geocodeAddress, searchPlaces } from "../geocode";
import { getRoute } from "../routing";
import { T, Btn } from "./ui";

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(-45deg)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 16],
  });

// A driver actively en route gets a Google-Maps-style blue "current location" dot
const currentLocationIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2A7DE1;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const idleDriverPin = pin("#4E8A00");
const customerPin = pin("#111111");
const destinationPin = pin("#C0392B");
const searchPin = pin("#C77F0A");

const ABUJA_CENTER = [9.0765, 7.3986];
const ACTIVE_STATUSES = ["in_transit", "arrived"];

export default function AdminMap({ drivers, customers, driverLocations, deliveries, geocodeCustomer }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const customerMarkersRef = useRef([]);
  const driverMarkersRef = useRef([]);
  const routeLinesRef = useRef([]);
  const searchMarkerRef = useRef(null);
  const lastCustomerCountRef = useRef(0);
  const routeCacheRef = useRef({}); // key: "driverId:customerId" -> [[lat,lng], ...]
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [, forceRedraw] = useState(0); // bumped once a route finishes loading async
  const [placingId, setPlacingId] = useState(null);
  const [showManagePins, setShowManagePins] = useState(false);
  const [coordInputs, setCoordInputs] = useState({});
  const [coordErrors, setCoordErrors] = useState({});

  const submitCoordInput = (customerId) => {
    const raw = (coordInputs[customerId] || "").trim();
    // Accepts "9.0765, 7.3986" or "9.0765,7.3986" — the exact format Google Maps copies
    const match = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      setCoordErrors((prev) => ({ ...prev, [customerId]: "Format should be: latitude, longitude" }));
      return;
    }
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setCoordErrors((prev) => ({ ...prev, [customerId]: "Those numbers don't look like valid coordinates" }));
      return;
    }
    setCoordErrors((prev) => ({ ...prev, [customerId]: null }));
    geocodeCustomer(customerId, lat, lng);
    setCoordInputs((prev) => ({ ...prev, [customerId]: "" }));
  };

  const placingIdRef = useRef(null);
  useEffect(() => {
    placingIdRef.current = placingId;
  }, [placingId]);

  useEffect(() => {
    if (leafletMapRef.current || !mapRef.current) return;
    const map = L.map(mapRef.current).setView(ABUJA_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    map.on("click", (e) => {
      if (!placingIdRef.current) return;
      geocodeCustomer(placingIdRef.current, e.latlng.lat, e.latlng.lng);
      setPlacingId(null);
    });
    leafletMapRef.current = map;
    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // Frame around customers only — driver testing from anywhere in the
  // world never drags the default view away from Nigeria.
  const fitToCustomers = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (customerMarkersRef.current.length === 0) {
      map.setView(ABUJA_CENTER, 12);
      return;
    }
    const group = L.featureGroup(customerMarkersRef.current);
    map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 15 });
  };

  // Explicit opt-in: fit around everyone currently on the map, drivers included
  const fitToEveryone = () => {
    const map = leafletMapRef.current;
    const all = [...customerMarkersRef.current, ...driverMarkersRef.current];
    if (!map || all.length === 0) return;
    const group = L.featureGroup(all);
    map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 15 });
  };

  // Figure out which driver is actively headed to which customer right now
  const activePairs = drivers
    .map((drv) => {
      const loc = driverLocations.find((l) => l.driver_id === drv.id);
      const delivery = deliveries.find((d) => d.driver_id === drv.id && ACTIVE_STATUSES.includes(d.status));
      if (!loc || !delivery) return null;
      const customer = customers.find((c) => c.id === delivery.customer_id);
      if (!customer || customer.lat == null || customer.lng == null) return null;
      return { driver: drv, loc, customer };
    })
    .filter(Boolean);

  // Redraw markers + routes whenever data changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    driverMarkersRef.current.forEach((m) => map.removeLayer(m));
    driverMarkersRef.current = [];
    customerMarkersRef.current.forEach((m) => map.removeLayer(m));
    customerMarkersRef.current = [];
    routeLinesRef.current.forEach((l) => map.removeLayer(l));
    routeLinesRef.current = [];

    const activeDriverIds = new Set(activePairs.map((p) => p.driver.id));
    const destinationCustomerIds = new Set(activePairs.map((p) => p.customer.id));

    driverLocations.forEach((loc) => {
      const drv = drivers.find((d) => d.id === loc.driver_id);
      if (!drv) return;
      const minsAgo = Math.round((Date.now() - new Date(loc.updated_at)) / 60000);
      const isActive = activeDriverIds.has(drv.id);
      const activePair = activePairs.find((p) => p.driver.id === drv.id);
      const cachedRoute = activePair ? routeCacheRef.current[`${drv.id}:${activePair.customer.id}`] : null;
      const etaLine = cachedRoute ? `<br/>~${cachedRoute.durationMin} min away (${cachedRoute.distanceKm} km)` : "";
      const marker = L.marker([loc.lat, loc.lng], { icon: isActive ? currentLocationIcon : idleDriverPin })
        .addTo(map)
        .bindPopup(`<b>${drv.name}</b>${isActive ? " — on the way" : ""}${etaLine}<br/>Updated ${minsAgo < 1 ? "just now" : `${minsAgo} min ago`}`);
      driverMarkersRef.current.push(marker);
    });

    customers.forEach((c) => {
      if (c.lat == null || c.lng == null) return;
      const isDestination = destinationCustomerIds.has(c.id);
      const marker = L.marker([c.lat, c.lng], { icon: isDestination ? destinationPin : customerPin })
        .addTo(map)
        .bindPopup(`<b>${c.name}</b>${c.address ? `<br/>${c.address}` : ""}`);
      customerMarkersRef.current.push(marker);
    });

    // Draw a route line for each driver currently on their way to a stop
    activePairs.forEach(({ driver, loc, customer }) => {
      const key = `${driver.id}:${customer.id}`;
      const cached = routeCacheRef.current[key];
      if (cached) {
        const line = L.polyline(cached.points, { color: "#2A7DE1", weight: 5, opacity: 0.85 }).addTo(map);
        routeLinesRef.current.push(line);
      } else {
        getRoute({ lat: loc.lat, lng: loc.lng }, { lat: customer.lat, lng: customer.lng })
          .then((route) => {
            if (route) {
              routeCacheRef.current[key] = route;
              forceRedraw((n) => n + 1); // trigger a redraw now that the route is cached
            }
          })
          .catch((e) => console.error("Route lookup failed:", e));
      }
    });

    if (customerMarkersRef.current.length !== lastCustomerCountRef.current) {
      fitToCustomers();
      lastCustomerCountRef.current = customerMarkersRef.current.length;
    }
  }, [driverLocations, drivers, customers, deliveries]);

  const geocodeMissing = async () => {
    const missing = customers.filter((c) => c.address && (c.lat == null || c.lng == null));
    if (missing.length === 0) {
      setGeocodeStatus("All customers with an address are already on the map.");
      return;
    }
    setGeocoding(true);
    let done = 0;
    let skipped = 0;
    for (const c of missing) {
      setGeocodeStatus(`Locating ${c.name}… (${done + skipped + 1}/${missing.length})`);
      try {
        const result = await geocodeAddress(c.address);
        if (result) {
          await geocodeCustomer(c.id, result.lat, result.lng);
          done++;
        } else {
          skipped++;
        }
      } catch (e) {
        console.error("Geocode failed for", c.name, e);
        skipped++;
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    setGeocoding(false);
    setGeocodeStatus(
      `Done — placed ${done} customer${done !== 1 ? "s" : ""} on the map.` +
        (skipped > 0 ? ` (${skipped} couldn't be located — check the address.)` : "")
    );
  };

  const runSearch = async () => {
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const results = await searchPlaces(searchText.trim());
      if (results.length === 0) {
        setSearchError("Couldn't find that place.");
        return;
      }
      setSearchResults(results);
    } catch (e) {
      setSearchError("Search failed — check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  const pickSearchResult = (result) => {
    const map = leafletMapRef.current;
    if (searchMarkerRef.current) map.removeLayer(searchMarkerRef.current);
    const marker = L.marker([result.lat, result.lng], { icon: searchPin })
      .addTo(map)
      .bindPopup(result.label)
      .openPopup();
    searchMarkerRef.current = marker;
    map.flyTo([result.lat, result.lng], 15);
    setSearchResults(null);
  };

  const activeDrivers = driverLocations.filter((loc) => Date.now() - new Date(loc.updated_at) < 30 * 60000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Search a place or address…"
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 14,
            border: `1.5px solid ${T.line}`,
            borderRadius: 8,
            fontFamily: "inherit",
            color: T.ink,
            background: "#fff",
          }}
        />
        <Btn small onClick={runSearch} disabled={searching || !searchText.trim()}>
          {searching ? "…" : "Go"}
        </Btn>
      </div>
      {searchError && <div style={{ fontSize: 12, color: T.red, marginTop: -6 }}>{searchError}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: T.mute, fontWeight: 600 }}>
          {activeDrivers.length} driver{activeDrivers.length !== 1 ? "s" : ""} live · {activePairs.length} en route
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={fitToEveryone} style={linkBtnStyle}>
            Show all
          </button>
          <button onClick={fitToCustomers} style={linkBtnStyle}>
            Recenter
          </button>
          <button onClick={geocodeMissing} disabled={geocoding} style={{ ...linkBtnStyle, cursor: geocoding ? "wait" : "pointer" }}>
            {geocoding ? "Locating…" : "Place customers on map"}
          </button>
        </div>
      </div>
      {geocodeStatus && <div style={{ fontSize: 12, color: T.mute }}>{geocodeStatus}</div>}

      {(() => {
        const notOnMap = customers.filter((c) => c.lat == null || c.lng == null);
        if (notOnMap.length === 0) return null;
        return (
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              Not on the map yet ({notOnMap.length}) — the automatic lookup doesn't always find a match, so you can drop the pin yourself instead:
            </div>
            <div style={{ fontSize: 11, color: T.mute, marginBottom: 10 }}>
              Tip: in Google Maps, long-press a spot and tap the coordinates shown to copy them — then paste below.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notOnMap.map((c) => (
                <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    <Btn
                      small
                      kind={placingId === c.id ? "green" : "ghost"}
                      onClick={() => setPlacingId(placingId === c.id ? null : c.id)}
                    >
                      {placingId === c.id ? "Tap the map…" : "📍 Place manually"}
                    </Btn>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={coordInputs[c.id] || ""}
                      onChange={(e) => setCoordInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="9.0765, 7.3986"
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        fontSize: 12,
                        border: `1.5px solid ${T.line}`,
                        borderRadius: 6,
                        fontFamily: "inherit",
                        color: T.ink,
                        background: "#fff",
                      }}
                    />
                    <Btn small kind="ghost" onClick={() => submitCoordInput(c.id)}>
                      Save
                    </Btn>
                  </div>
                  {coordErrors[c.id] && <div style={{ fontSize: 11, color: T.red }}>{coordErrors[c.id]}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {(() => {
        const placed = customers.filter((c) => c.lat != null && c.lng != null);
        if (placed.length === 0) return null;
        return (
          <div style={{ background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 10, padding: 12 }}>
            <button
              onClick={() => setShowManagePins((v) => !v)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {showManagePins ? "▲" : "▼"} Manage pins ({placed.length} placed) — reset one if it's wrong
            </button>
            {showManagePins && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {placed.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    <Btn small kind="ghost" onClick={() => geocodeCustomer(c.id, null, null)}>
                      Reset
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {placingId && (
        <div style={{ background: "#F5FBE6", border: `1.5px solid ${T.ink}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
          Tap anywhere on the map to place {customers.find((c) => c.id === placingId)?.name}
        </div>
      )}

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
        🟢 Idle driver · 🔵 On the way · ⚫ Customer · 🔴 Current destination · 🟠 Search
      </div>
    </div>
  );
}

const linkBtnStyle = {
  background: "none",
  border: "none",
  color: T.ink,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "underline",
  cursor: "pointer",
  fontFamily: "inherit",
};