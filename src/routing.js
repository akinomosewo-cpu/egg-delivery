// Gets a real road-following route between two points using OSRM's free
// public routing server. No API key needed. Returns an array of [lat, lng]
// points to draw as a line, or null if no route could be found.
export async function getRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing failed");
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) return null;
  // GeoJSON coordinates are [lng, lat] — flip to [lat, lng] for Leaflet
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}
