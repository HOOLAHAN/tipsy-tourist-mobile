import polyline from "@mapbox/polyline";
import { Platform } from "react-native";
import {
  Coordinate,
  Place,
  PlaceDetails,
  PlaceSuggestion,
  RoutePlan,
  RouteLeg,
  SearchCoverage,
  TravelMode,
} from "./types";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://t5jalxqqsb.execute-api.eu-west-2.amazonaws.com";
const production =
  process.env.EXPO_PUBLIC_TIPSY_TOURIST_ENVIRONMENT === "production";
const MAPS_KEY = production
  ? process.env.EXPO_PUBLIC_TIPSY_TOURIST_MOBILE_SERVICES_PRODUCTION
  : process.env.EXPO_PUBLIC_TIPSY_TOURIST_MOBILE_SERVICES_DEVELOPMENT;
const GOOGLE_MAPS_HEADERS =
  Platform.OS === "ios"
    ? {
        "X-Ios-Bundle-Identifier": production
          ? "com.tipsytourist.mobile"
          : "com.tipsytourist.mobile.dev",
      }
    : undefined;

export function getGoogleMapsRequestHeaders() {
  return GOOGLE_MAPS_HEADERS;
}

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function geocode(address: string): Promise<Coordinate> {
  const result = await post<{ location: { lat: number; lng: number } }>(
    "/geocode",
    { address },
  );
  return { latitude: result.location.lat, longitude: result.location.lng };
}

function distanceSquared(place: Omit<Place, "stopType">, point: Coordinate) {
  const latitude = place.geometry.location.lat - point.latitude;
  const longitude = place.geometry.location.lng - point.longitude;
  return latitude * latitude + longitude * longitude;
}

function candidateScore(
  place: Omit<Place, "stopType">,
  point: Coordinate,
  type: Place["stopType"],
) {
  const rating = place.rating ?? 0;
  const reviews = place.user_ratings_total ?? 0;
  const quality = rating * 2.2 + Math.log10(reviews + 1) * 1.4;
  const proximity = Math.min(
    2.5,
    Math.sqrt(distanceSquared(place, point)) * 150,
  );
  const specificity =
    type === "attraction" &&
    place.types?.some((item) =>
      ["museum", "art_gallery", "tourist_attraction", "park"].includes(item),
    )
      ? 0.6
      : 0;
  return quality + specificity - proximity;
}

function isQualityCandidate(
  place: Omit<Place, "stopType">,
  type: Place["stopType"],
) {
  if (
    !place.place_id ||
    !place.geometry?.location ||
    place.business_status === "CLOSED_PERMANENTLY"
  )
    return false;
  const rating = place.rating ?? 0;
  const reviews = place.user_ratings_total ?? 0;
  const types = place.types ?? [];
  const unsuitableAttraction =
    type === "attraction" &&
    types.some((item) =>
      [
        "lodging",
        "travel_agency",
        "real_estate_agency",
        "local_government_office",
      ].includes(item),
    );
  return (
    !unsuitableAttraction &&
    rating >= 4 &&
    reviews >= (type === "pub" ? 20 : 10)
  );
}

function isUsableCandidate(place: Omit<Place, "stopType">) {
  return Boolean(
    place.place_id &&
      place.geometry?.location &&
      place.business_status !== "CLOSED_PERMANENTLY",
  );
}

async function nearbyCandidates(
  path: "/places" | "/attractions",
  point: Coordinate,
  type: Place["stopType"],
  radius?: number,
): Promise<Place[]> {
  const response = await post<{
    data: { results?: Omit<Place, "stopType">[] } | Omit<Place, "stopType">[];
  }>(path, { lat: point.latitude, lng: point.longitude, radius });
  const results = Array.isArray(response.data)
    ? response.data
    : response.data?.results;
  const available = results ?? [];
  const quality = available.filter((place) => isQualityCandidate(place, type));
  // Prefer established, well-reviewed places, but retain a fallback in quieter areas.
  return (
    quality.length
      ? quality
      : available.filter(
          (item) => isUsableCandidate(item) && (item.rating ?? 0) >= 3.8,
        )
  )
    .sort(
      (a, b) => candidateScore(b, point, type) - candidateScore(a, point, type),
    )
    .map((place) => ({ ...place, stopType: type }));
}

const LOCAL_SEARCH_THRESHOLD_METRES = 1000;
const LOCAL_SEARCH_RADIUS_METRES = 750;
const LOCAL_SEARCH_POINT_OFFSET_METRES = 300;

function plotPoints(
  start: Coordinate,
  end: Coordinate,
  count: number,
  routeDistance: number,
) {
  if (count <= 0) return [];
  const midpoint = {
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2,
  };
  if (count === 1) {
    return [midpoint];
  }
  if (routeDistance < LOCAL_SEARCH_THRESHOLD_METRES) {
    const latitudeOffset = LOCAL_SEARCH_POINT_OFFSET_METRES / 111320;
    const longitudeOffset =
      LOCAL_SEARCH_POINT_OFFSET_METRES /
      (111320 * Math.max(Math.cos((midpoint.latitude * Math.PI) / 180), 0.2));
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      return {
        latitude: midpoint.latitude + Math.cos(angle) * latitudeOffset,
        longitude: midpoint.longitude + Math.sin(angle) * longitudeOffset,
      };
    });
  }
  return Array.from({ length: count }, (_, index) => {
    const amount = index / (count - 1);
    return {
      latitude: start.latitude + (end.latitude - start.latitude) * amount,
      longitude: start.longitude + (end.longitude - start.longitude) * amount,
    };
  });
}

function distanceInMetres(start: Coordinate, end: Coordinate) {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function adaptiveSearchRadius(
  start: Coordinate,
  end: Coordinate,
  searchCount: number,
) {
  const routeDistance = distanceInMetres(start, end);
  if (routeDistance < LOCAL_SEARCH_THRESHOLD_METRES) {
    return LOCAL_SEARCH_RADIUS_METRES;
  }
  const gaps = Math.max(searchCount - 1, 1);
  const overlappingRadius = (routeDistance / gaps) * 0.6;
  return Math.round(Math.min(3000, Math.max(400, overlappingRadius)));
}

function mixedStopTypes(
  pubCount: number,
  attractionCount: number,
): Place["stopType"][] {
  const total = pubCount + attractionCount;
  let pubsUsed = 0;
  let attractionsUsed = 0;
  return Array.from({ length: total }, (_, index) => {
    if (pubsUsed >= pubCount) {
      attractionsUsed += 1;
      return "attraction";
    }
    if (attractionsUsed >= attractionCount) {
      pubsUsed += 1;
      return "pub";
    }
    const pubDeficit = ((index + 1) * pubCount) / total - pubsUsed;
    const attractionDeficit =
      ((index + 1) * attractionCount) / total - attractionsUsed;
    if (pubDeficit >= attractionDeficit) {
      pubsUsed += 1;
      return "pub";
    }
    attractionsUsed += 1;
    return "attraction";
  });
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await post<{
    data: { result?: PlaceDetails } | PlaceDetails;
  }>("/get-details", { place_id: placeId });
  const payload = response.data as PlaceDetails & { result?: PlaceDetails };
  return payload.result ?? payload;
}

export async function getPlaceSuggestions(
  input: string,
): Promise<PlaceSuggestion[]> {
  if (!MAPS_KEY || input.trim().length < 3) return [];
  const query = new URLSearchParams({
    input: input.trim(),
    key: MAPS_KEY,
    components: "country:gb",
  });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${query}`,
    { headers: GOOGLE_MAPS_HEADERS },
  );
  const data = await response.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return (data.predictions ?? []).map((item: any) => ({
    place_id: item.place_id,
    description: item.description,
    main_text: item.structured_formatting?.main_text ?? item.description,
    secondary_text: item.structured_formatting?.secondary_text ?? "",
  }));
}

export function getPlacePhotoUrl(details: PlaceDetails | null, width = 900) {
  const reference = details?.photos?.[0]?.photo_reference;
  return reference && MAPS_KEY
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(reference)}&key=${MAPS_KEY}`
    : undefined;
}

export async function routeThroughStops(
  origin: Coordinate,
  destination: Coordinate,
  stops: Place[],
  mode: TravelMode,
): Promise<RoutePlan> {
  if (!MAPS_KEY)
    throw new Error(
      "Add the Tipsy Tourist mobile services key to your environment before planning a route.",
    );
  const waypoints = stops
    .map(
      (place) =>
        `${place.geometry.location.lat},${place.geometry.location.lng}`,
    )
    .join("|");
  const query = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode,
    key: MAPS_KEY,
  });
  if (waypoints) query.set("waypoints", waypoints);
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${query}`,
    { headers: GOOGLE_MAPS_HEADERS },
  );
  const data = await response.json();
  if (data.status !== "OK")
    throw new Error(data.error_message || `No viable ${mode} route was found.`);
  const route = data.routes[0];
  const legs = route.legs as {
    distance: { value: number };
    duration: { value: number };
    start_location: { lat: number; lng: number };
    end_location: { lat: number; lng: number };
    steps?: { polyline?: { points?: string } }[];
  }[];
  const metres = legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const seconds = legs.reduce((sum, leg) => sum + leg.duration.value, 0);
  const routeLegs: RouteLeg[] = legs.map((leg) => {
    const stepCoordinates = (leg.steps ?? []).flatMap((step) =>
      step.polyline?.points
        ? polyline
            .decode(step.polyline.points)
            .map(([latitude, longitude]) => ({ latitude, longitude }))
        : [],
    );
    const coordinates = stepCoordinates.length > 1
      ? stepCoordinates
      : [
          { latitude: leg.start_location.lat, longitude: leg.start_location.lng },
          { latitude: leg.end_location.lat, longitude: leg.end_location.lng },
        ];
    const segmentDistances = coordinates.slice(1).map((point, index) =>
      distanceInMetres(coordinates[index], point),
    );
    const halfway = segmentDistances.reduce((sum, value) => sum + value, 0) / 2;
    let covered = 0;
    let midpoint = coordinates[Math.floor(coordinates.length / 2)];
    for (let index = 0; index < segmentDistances.length; index += 1) {
      const segmentDistance = segmentDistances[index];
      if (covered + segmentDistance >= halfway) {
        const amount = segmentDistance
          ? (halfway - covered) / segmentDistance
          : 0;
        midpoint = {
          latitude:
            coordinates[index].latitude +
            (coordinates[index + 1].latitude - coordinates[index].latitude) * amount,
          longitude:
            coordinates[index].longitude +
            (coordinates[index + 1].longitude - coordinates[index].longitude) * amount,
        };
        break;
      }
      covered += segmentDistance;
    }
    return {
      distance:
        leg.distance.value >= 1000
          ? `${(leg.distance.value / 1000).toFixed(1)} km`
          : `${leg.distance.value} m`,
      duration: `${Math.max(1, Math.round(leg.duration.value / 60))} min`,
      midpoint,
    };
  });
  return {
    origin,
    destination,
    coordinates: polyline
      .decode(route.overview_polyline.points)
      .map(([latitude, longitude]) => ({ latitude, longitude })),
    stops,
    distance:
      metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`,
    duration:
      seconds >= 3600
        ? `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`
        : `${Math.round(seconds / 60)} min`,
    legs: routeLegs,
  };
}

export async function planRoute(
  startText: string,
  finishText: string,
  pubCount: number,
  attractionCount: number,
  mode: TravelMode,
  onSearchCoverage?: (coverage: SearchCoverage) => void,
): Promise<RoutePlan> {
  if (!MAPS_KEY)
    throw new Error(
      "Add the Tipsy Tourist mobile services key to your environment before planning a route.",
    );
  const [origin, destination] = await Promise.all([
    geocode(startText),
    geocode(finishText),
  ]);
  const stopTypes = mixedStopTypes(pubCount, attractionCount);
  const routeDistance = distanceInMetres(origin, destination);
  const points = plotPoints(
    origin,
    destination,
    stopTypes.length,
    routeDistance,
  );
  const searchRadius = adaptiveSearchRadius(
    origin,
    destination,
    stopTypes.length,
  );
  onSearchCoverage?.({
    path: [origin, destination],
    points: points.map((point, index) => ({
      ...point,
      stopType: stopTypes[index],
      radius: searchRadius,
    })),
  });
  const stops: Place[] = [];
  const selectedIds = new Set<string>();
  const candidateGroups = await Promise.all(
    stopTypes.map((type, index) =>
      nearbyCandidates(
        type === "pub" ? "/places" : "/attractions",
        points[index],
        type,
        searchRadius,
      ),
    ),
  );
  // Select in journey order after fetching in parallel, rejecting duplicates between areas.
  for (let index = 0; index < stopTypes.length; index += 1) {
    const place = candidateGroups[index].find(
      (candidate) => !selectedIds.has(candidate.place_id),
    );
    if (place) {
      stops.push(place);
      selectedIds.add(place.place_id);
    }
  }
  if (stops.length === 0)
    throw new Error(
      "No pubs or attractions were found along this route. Try different locations or a longer route.",
    );
  if (stops.length !== stopTypes.length) {
    const missingPubs =
      pubCount - stops.filter((stop) => stop.stopType === "pub").length;
    const missingAttractions =
      attractionCount -
      stops.filter((stop) => stop.stopType === "attraction").length;
    const missing = [
      missingPubs > 0
        ? `${missingPubs} ${missingPubs === 1 ? "pub" : "pubs"}`
        : null,
      missingAttractions > 0
        ? `${missingAttractions} ${missingAttractions === 1 ? "attraction" : "attractions"}`
        : null,
    ]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `We couldn't find ${missing} of a suitable standard along this route. Try a longer route or nearby locations.`,
    );
  }
  return routeThroughStops(origin, destination, stops, mode);
}

export async function planLocalTour(
  locationText: string,
  radius: number,
  pubCount: number,
  attractionCount: number,
  mode: TravelMode,
  onSearchCoverage?: (coverage: SearchCoverage) => void,
): Promise<RoutePlan> {
  if (!MAPS_KEY)
    throw new Error(
      "Add the Tipsy Tourist mobile services key to your environment before planning a route.",
    );
  const centre = await geocode(locationText);
  const searchRadius = Math.round(Math.min(5000, Math.max(500, radius)));
  const stopTypes = mixedStopTypes(pubCount, attractionCount);
  onSearchCoverage?.({
    path: [centre, centre],
    points: [{
      ...centre,
      stopType: "local",
      radius: searchRadius,
    }],
  });

  const [pubCandidates, attractionCandidates] = await Promise.all([
    pubCount > 0
      ? nearbyCandidates("/places", centre, "pub", searchRadius)
      : Promise.resolve([]),
    attractionCount > 0
      ? nearbyCandidates("/attractions", centre, "attraction", searchRadius)
      : Promise.resolve([]),
  ]);
  let pubIndex = 0;
  let attractionIndex = 0;
  const selectedIds = new Set<string>();
  const stops = stopTypes
    .map((type) => {
      const candidates = type === "pub" ? pubCandidates : attractionCandidates;
      let index = type === "pub" ? pubIndex : attractionIndex;
      while (index < candidates.length && selectedIds.has(candidates[index].place_id)) {
        index += 1;
      }
      if (type === "pub") pubIndex = index + 1;
      else attractionIndex = index + 1;
      const place = candidates[index];
      if (place) selectedIds.add(place.place_id);
      return place;
    })
    .filter((place): place is Place => Boolean(place));

  if (stops.length !== stopTypes.length) {
    throw new Error(
      "We couldn't find enough suitable stops within this area. Increase the search radius or reduce the number of stops.",
    );
  }

  const orderedStops = [...stops].sort((a, b) => {
    const aAngle = Math.atan2(
      a.geometry.location.lng - centre.longitude,
      a.geometry.location.lat - centre.latitude,
    );
    const bAngle = Math.atan2(
      b.geometry.location.lng - centre.longitude,
      b.geometry.location.lat - centre.latitude,
    );
    return aAngle - bAngle;
  });
  return routeThroughStops(centre, centre, orderedStops, mode);
}

export async function findReplacementStop(
  stop: Place,
  excludedPlaceIds: string[],
): Promise<Place> {
  const point = {
    latitude: stop.geometry.location.lat,
    longitude: stop.geometry.location.lng,
  };
  const candidates = await nearbyCandidates(
    stop.stopType === "pub" ? "/places" : "/attractions",
    point,
    stop.stopType,
  );
  const excluded = new Set(excludedPlaceIds);
  const replacement = candidates.find(
    (candidate) => !excluded.has(candidate.place_id),
  );
  if (!replacement)
    throw new Error(`No different ${stop.stopType} was found nearby.`);
  return replacement;
}

export async function findAdditionalStop(
  stopType: Place["stopType"],
  point: Coordinate,
  excludedPlaceIds: string[],
): Promise<Place> {
  const candidates = await nearbyCandidates(
    stopType === "pub" ? "/places" : "/attractions",
    point,
    stopType,
  );
  const excluded = new Set(excludedPlaceIds);
  const place = candidates.find(
    (candidate) => !excluded.has(candidate.place_id),
  );
  if (!place)
    throw new Error(
      `No suitable ${stopType} was found in that part of the route.`,
    );
  return place;
}
