async function tryGeocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

// Turns a text address into map coordinates (lat/lng) using OpenStreetMap's
// free Nominatim service. No API key needed. Their usage policy asks for a
// custom identifier and no more than ~1 request/second, which is fine for
// our scale (a handful of customers, geocoded once each and then cached).
// Pass restrictToAbuja: false for a free-form search (e.g. the map's search box).
export async function geocodeAddress(address, { restrictToAbuja = true } = {}) {
  if (!address) return null;

  if (!restrictToAbuja) {
    return tryGeocode(address);
  }

  // Don't append "Abuja, Nigeria" if it's already in the address —
  // that was producing malformed queries like "...Abuja, Abuja, Nigeria"
  const hasAbuja = /abuja/i.test(address);
  const enrichedQuery = hasAbuja ? `${address}, Nigeria` : `${address}, Abuja, Nigeria`;

  let result = await tryGeocode(enrichedQuery);
  if (!result) result = await tryGeocode(address); // fallback: try the raw address alone

  if (!result) return null;

  // Sanity check: reject anything outside the greater Abuja/FCT area.
  const inAbujaArea = result.lat > 8.4 && result.lat < 9.4 && result.lng > 6.8 && result.lng < 7.9;
  if (!inAbujaArea) return null;

  return result;
}

// General place search (for the map's search box) — biased to Nigeria but
// not locked to Abuja like geocodeAddress, since someone might search
// any place/landmark to jump the map there.
export async function searchPlace(query) {
  if (!query) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ng&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

// A location is only accepted as a real driver position if it's actually
// somewhere in Nigeria — rejects GPS/IP fallback glitches that report a
// wildly wrong location (e.g. a different continent).
export function isInNigeria(lat, lng) {
  return lat > 4 && lat < 14 && lng > 2 && lng < 15;
}