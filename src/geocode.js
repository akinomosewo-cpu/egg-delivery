// Abuja/FCT bounding box, used as a soft search bias — nudges ambiguous
// results toward here first without ruling out a real match elsewhere.
const ABUJA_VIEWBOX = "6.6,9.6,8.1,8.2"; // left,top,right,bottom

async function tryGeocode(query, limit = 1) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&viewbox=${ABUJA_VIEWBOX}&bounded=0&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  return data || [];
}

// Turns a text address into map coordinates (lat/lng) using OpenStreetMap's
// free Nominatim service. No API key needed. Their usage policy asks for a
// custom identifier and no more than ~1 request/second, which is fine for
// our scale (a handful of customers, geocoded once each and then cached).
// Used for auto-placing a customer — takes the single top match and
// validates it's actually in Abuja before accepting it.
export async function geocodeAddress(address, { restrictToAbuja = true } = {}) {
  if (!address) return null;

  if (!restrictToAbuja) {
    const results = await tryGeocode(address, 1);
    if (results.length === 0) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), label: results[0].display_name };
  }

  const hasAbuja = /abuja/i.test(address);
  const enrichedQuery = hasAbuja ? `${address}, Nigeria` : `${address}, Abuja, Nigeria`;

  let results = await tryGeocode(enrichedQuery, 1);
  if (results.length === 0) results = await tryGeocode(address, 1); // fallback: try the raw address alone
  if (results.length === 0) return null;

  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  const inAbujaArea = lat > 8.4 && lat < 9.4 && lng > 6.8 && lng < 7.9;
  if (!inAbujaArea) return null;

  return { lat, lng, label: results[0].display_name };
}

// Used by the map's search box — returns several candidate matches instead
// of blindly picking the top one, since a single guess is often wrong for
// ambiguous or repeated place names. The person picks which one is right.
export async function searchPlaces(query) {
  if (!query) return [];
  const results = await tryGeocode(query, 5);
  return results.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    label: r.display_name,
  }));
}