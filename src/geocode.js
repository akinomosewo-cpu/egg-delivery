// Turns a text address into map coordinates (lat/lng) using OpenStreetMap's
// free Nominatim service. No API key needed. Their usage policy asks for a
// custom identifier and no more than ~1 request/second, which is fine for
// our scale (a handful of customers, geocoded once each and then cached).
export async function geocodeAddress(address) {
  if (!address) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address + ", Abuja, Nigeria")}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
