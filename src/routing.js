// Gets a real road-following route between two points using OSRM's free
// public routing server. No API key needed. Returns the line to draw plus
// the estimated travel time/distance, or null if no route could be found.
export async function getRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Routing failed");
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) return null;
  const route = data.routes[0];
  return {
    // GeoJSON coordinates are [lng, lat] — flip to [lat, lng] for Leaflet
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    durationMin: Math.round(route.duration / 60),
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
  };
}