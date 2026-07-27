import polyline from '@mapbox/polyline';
import { Coordinate, Place, PlaceDetails, PlaceSuggestion, RoutePlan, TravelMode } from './types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://t5jalxqqsb.execute-api.eu-west-2.amazonaws.com';
const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function geocode(address: string): Promise<Coordinate> {
  const result = await post<{ location: { lat: number; lng: number } }>('/geocode', { address });
  return { latitude: result.location.lat, longitude: result.location.lng };
}

async function nearby(path: '/places' | '/attractions', point: Coordinate, type: Place['stopType']): Promise<Place | undefined> {
  const response = await post<{ data: { results?: Omit<Place, 'stopType'>[] } | Omit<Place, 'stopType'>[] }>(path, { lat: point.latitude, lng: point.longitude });
  const places = Array.isArray(response.data) ? response.data : response.data?.results;
  const place = places?.[0];
  return place ? { ...place, stopType: type } : undefined;
}

function plotPoints(start: Coordinate, end: Coordinate, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const amount = (index + 1) / (count + 1);
    return { latitude: start.latitude + (end.latitude - start.latitude) * amount, longitude: start.longitude + (end.longitude - start.longitude) * amount };
  });
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await post<{ data: { result?: PlaceDetails } | PlaceDetails }>('/get-details', { place_id: placeId });
  const payload = response.data as PlaceDetails & { result?: PlaceDetails };
  return payload.result ?? payload;
}

export async function getPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  if (!MAPS_KEY || input.trim().length < 3) return [];
  const query = new URLSearchParams({ input: input.trim(), key: MAPS_KEY, components: 'country:gb' });
  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${query}`);
  const data = await response.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return [];
  return (data.predictions ?? []).map((item: any) => ({ place_id: item.place_id, description: item.description, main_text: item.structured_formatting?.main_text ?? item.description, secondary_text: item.structured_formatting?.secondary_text ?? '' }));
}

export function getPlacePhotoUrl(details: PlaceDetails | null, width = 900) {
  const reference = details?.photos?.[0]?.photo_reference;
  return reference && MAPS_KEY ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(reference)}&key=${MAPS_KEY}` : undefined;
}

export async function planRoute(startText: string, finishText: string, pubCount: number, attractionCount: number, mode: TravelMode): Promise<RoutePlan> {
  if (!MAPS_KEY) throw new Error('Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to .env before planning a route.');
  const [origin, destination] = await Promise.all([geocode(startText), geocode(finishText)]);
  const pubs = await Promise.all(plotPoints(origin, destination, pubCount).map((point) => nearby('/places', point, 'pub')));
  const attractions = await Promise.all(plotPoints(origin, destination, attractionCount).map((point) => nearby('/attractions', point, 'attraction')));
  const stops = [...pubs, ...attractions].filter((place): place is Place => Boolean(place)).filter((place, index, all) => all.findIndex((candidate) => candidate.place_id === place.place_id) === index);
  if (stops.length === 0) throw new Error('No pubs or attractions were found along this route. Try different locations or a longer route.');
  const waypoints = stops.map((place) => `${place.geometry.location.lat},${place.geometry.location.lng}`).join('|');
  const query = new URLSearchParams({ origin: `${origin.latitude},${origin.longitude}`, destination: `${destination.latitude},${destination.longitude}`, mode, key: MAPS_KEY, optimize: 'true' });
  if (waypoints) query.set('waypoints', `optimize:true|${waypoints}`);
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${query}`);
  const data = await response.json();
  if (data.status !== 'OK') throw new Error(data.error_message || `No viable ${mode} route was found.`);
  const route = data.routes[0];
  const orderedStops = (route.waypoint_order as number[]).map((index) => stops[index]);
  const legs = route.legs as { distance: { value: number }; duration: { value: number } }[];
  const metres = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const seconds = legs.reduce((sum, leg) => sum + leg.duration.value, 0);
  return {
    origin,
    destination,
    coordinates: polyline.decode(route.overview_polyline.points).map(([latitude, longitude]) => ({ latitude, longitude })),
    stops: orderedStops.length ? orderedStops : stops,
    distance: metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`,
    duration: seconds >= 3600 ? `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min` : `${Math.round(seconds / 60)} min`,
  };
}
