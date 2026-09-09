import polyline from "@mapbox/polyline";
import {
  CategoryQuantities,
  Coordinate,
  Place,
  PlaceDetails,
  PlaceSuggestion,
  RoutePlan,
  RouteLeg,
  RouteLegMode,
  SearchCoverage,
  StopCategory,
  TravelMode,
} from "./types";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://t5jalxqqsb.execute-api.eu-west-2.amazonaws.com";

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function geocode(address: string): Promise<Coordinate> {
  const result = await post<{ location: { lat: number; lng: number } }>(
    "/geocode",
    { address },
  );
  return { latitude: result.location.lat, longitude: result.location.lng };
}

function distanceSquared(place: Omit<Place, "category">, point: Coordinate) {
  const latitude = place.geometry.location.lat - point.latitude;
  const longitude = place.geometry.location.lng - point.longitude;
  return latitude * latitude + longitude * longitude;
}

function candidateScore(
  place: Omit<Place, "category">,
  point: Coordinate,
  category: StopCategory,
) {
  const rating = place.rating ?? 0;
  const reviews = place.user_ratings_total ?? 0;
  const quality = rating * 2.2 + Math.log10(reviews + 1) * 1.4;
  const proximity = Math.min(
    2.5,
    Math.sqrt(distanceSquared(place, point)) * 150,
  );
  const expectedTypes: Partial<Record<StopCategory, string[]>> = {
    landmarks: ["tourist_attraction"],
    museums: ["museum"],
    galleries: ["art_gallery"],
    parks: ["park"],
    cafes: ["cafe"],
    food: ["restaurant"],
    shopping: ["store", "shopping_mall"],
  };
  const specificity = place.types?.some((item) =>
    expectedTypes[category]?.includes(item),
  ) ? 0.6 : 0;
  return quality + specificity - proximity;
}

function isQualityCandidate(
  place: Omit<Place, "category">,
  category: StopCategory,
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
  const unsuitable = types.some((item) =>
    ["lodging", "travel_agency", "real_estate_agency"].includes(item),
  );
  return (
    !unsuitable &&
    rating >= 4 &&
    reviews >= (["cafes", "food", "shopping"].includes(category) ? 20 : 10)
  );
}

function isUsableCandidate(place: Omit<Place, "category">) {
  return Boolean(
    place.place_id &&
      place.geometry?.location &&
      place.business_status !== "CLOSED_PERMANENTLY",
  );
}

async function nearbyCandidates(
  point: Coordinate,
  category: StopCategory,
  radius?: number,
): Promise<Place[]> {
  const response = await post<{
    data: { results?: Omit<Place, "category">[] } | Omit<Place, "category">[];
  }>("/discover", { lat: point.latitude, lng: point.longitude, category, radius });
  const results = Array.isArray(response.data)
    ? response.data
    : response.data?.results;
  const available = results ?? [];
  const quality = available.filter((place) => isQualityCandidate(place, category));
  // Prefer established, well-reviewed places, but retain a fallback in quieter areas.
  return (
    quality.length
      ? quality
      : available.filter(
          (item) => isUsableCandidate(item) && (item.rating ?? 0) >= 3.8,
        )
  )
    .sort(
      (a, b) => candidateScore(b, point, category) - candidateScore(a, point, category),
    )
    .map((place) => ({ ...place, category }));
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

function plainText(value = "") {
  return value
    .replace(/<div[^>]*>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function metricDistance(metres: number) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;
}

function minuteDuration(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function adaptiveSearchRadius(
  start: Coordinate,
  end: Coordinate,
  searchCount: number,
  mode: TravelMode,
) {
  const routeDistance = distanceInMetres(start, end);
  if (routeDistance < LOCAL_SEARCH_THRESHOLD_METRES) {
    return LOCAL_SEARCH_RADIUS_METRES;
  }
  const gaps = Math.max(searchCount - 1, 1);
  const transportEnabled = mode !== "walking";
  const overlappingRadius =
    (routeDistance / gaps) * (transportEnabled ? 0.85 : 0.6);
  return Math.round(
    Math.min(
      transportEnabled ? 7500 : 3000,
      Math.max(transportEnabled ? 750 : 400, overlappingRadius),
    ),
  );
}

function distributedCategories(quantities: CategoryQuantities) {
  const remaining = Object.entries(quantities).map(([category, quantity]) => ({
    category: category as StopCategory,
    quantity: Math.min(5, Math.max(0, Math.floor(quantity))),
  }));
  const categories: StopCategory[] = [];
  while (categories.length < 10 && remaining.some(({ quantity }) => quantity > 0)) {
    for (const item of remaining) {
      if (item.quantity > 0 && categories.length < 10) {
        categories.push(item.category);
        item.quantity -= 1;
      }
    }
  }
  return categories;
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
  if (input.trim().length < 3) return [];
  const data = await post<{
    status: string;
    predictions?: any[];
  }>("/autocomplete", { input: input.trim() });
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
  return reference
    ? `${API_URL}/place-photo?maxwidth=${width}&photo_reference=${encodeURIComponent(reference)}`
    : undefined;
}

export async function routeThroughStops(
  origin: Coordinate,
  destination: Coordinate,
  stops: Place[],
  mode: TravelMode,
): Promise<RoutePlan> {
  const points = [
    origin,
    ...stops.map((place) => ({
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    })),
    destination,
  ];
  const requestedModes: RouteLegMode[] = points.slice(1).map((point, index) => {
    if (mode !== "smart") return mode;
    return distanceInMetres(points[index], point) <= 1600 ? "walking" : "transit";
  });
  const requestLeg = async (index: number, requestedMode: RouteLegMode) => {
    const data = await post<any>("/directions", {
      origin: points[index],
      destination: points[index + 1],
      mode: requestedMode,
      waypoints: [],
    });
    if (data.status !== "OK" || !data.routes?.[0]) {
      if (mode === "smart" && requestedMode === "transit") {
        return requestLeg(index, "driving");
      }
      throw new Error(data.error_message || `No viable ${requestedMode} route was found.`);
    }
    return { route: data.routes[0], mode: requestedMode };
  };
  const responses = await Promise.all(
    requestedModes.map((requestedMode, index) => requestLeg(index, requestedMode)),
  );
  const rawLegs = responses.map(({ route }) => route.legs[0] as {
    distance: { value: number };
    duration: { value: number };
    start_location: { lat: number; lng: number };
    end_location: { lat: number; lng: number };
    steps?: {
      travel_mode?: string;
      html_instructions?: string;
      distance?: { value: number };
      duration?: { value: number };
      polyline?: { points?: string };
      transit_details?: {
        departure_stop?: { name?: string };
        arrival_stop?: { name?: string };
        departure_time?: { text?: string };
        arrival_time?: { text?: string };
        headsign?: string;
        num_stops?: number;
        line?: {
          name?: string;
          short_name?: string;
          vehicle?: { name?: string; type?: string };
        };
      };
    }[];
  });
  const metres = rawLegs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const seconds = rawLegs.reduce((sum, leg) => sum + leg.duration.value, 0);
  const routeLegs: RouteLeg[] = rawLegs.map((leg, legIndex) => {
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
      distance: metricDistance(leg.distance.value),
      duration: minuteDuration(leg.duration.value),
      distanceMetres: leg.distance.value,
      durationSeconds: leg.duration.value,
      midpoint,
      mode: responses[legIndex].mode,
      coordinates,
      steps: (leg.steps ?? []).map((step) => {
        const transit = step.transit_details;
        const stepMode = (step.travel_mode ?? responses[legIndex].mode).toLowerCase();
        return {
          mode: (["walking", "transit", "driving"].includes(stepMode)
            ? stepMode
            : responses[legIndex].mode) as RouteLegMode,
          instruction: plainText(step.html_instructions),
          distance: metricDistance(step.distance?.value ?? 0),
          duration: minuteDuration(step.duration?.value ?? 0),
          coordinates: step.polyline?.points
            ? polyline.decode(step.polyline.points).map(([latitude, longitude]) => ({ latitude, longitude }))
            : [],
          lineName: transit?.line?.name,
          lineShortName: transit?.line?.short_name,
          vehicleName: transit?.line?.vehicle?.name,
          vehicleType: transit?.line?.vehicle?.type,
          departureStop: transit?.departure_stop?.name,
          arrivalStop: transit?.arrival_stop?.name,
          departureTime: transit?.departure_time?.text,
          arrivalTime: transit?.arrival_time?.text,
          headsign: transit?.headsign,
          stopCount: transit?.num_stops,
        };
      }),
    };
  });
  return {
    origin,
    destination,
    coordinates: routeLegs.flatMap((leg) => leg.coordinates),
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

export async function replaceRouteLeg(
  route: RoutePlan,
  index: number,
  mode: RouteLegMode,
): Promise<RoutePlan> {
  const points = [
    route.origin,
    ...route.stops.map((place) => ({
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
    })),
    route.destination,
  ];
  if (!points[index] || !points[index + 1]) {
    throw new Error("That journey leg is no longer available.");
  }
  const replacement = await routeThroughStops(points[index], points[index + 1], [], mode);
  const legs = [...route.legs];
  legs[index] = replacement.legs[0];
  const metres = legs.reduce((total, leg) => total + leg.distanceMetres, 0);
  const seconds = legs.reduce((total, leg) => total + leg.durationSeconds, 0);
  return {
    ...route,
    legs,
    coordinates: legs.flatMap((leg) => leg.coordinates),
    distance: metricDistance(metres),
    duration:
      seconds >= 3600
        ? `${Math.floor(seconds / 3600)} hr ${Math.round((seconds % 3600) / 60)} min`
        : `${Math.round(seconds / 60)} min`,
  };
}

export async function planRoute(
  startText: string,
  finishText: string,
  quantities: CategoryQuantities,
  mode: TravelMode,
  onSearchCoverage?: (coverage: SearchCoverage) => void,
): Promise<RoutePlan> {
  const [origin, destination] = await Promise.all([
    geocode(startText),
    geocode(finishText),
  ]);
  const stopCategories = distributedCategories(quantities);
  const routeDistance = distanceInMetres(origin, destination);
  const points = plotPoints(
    origin,
    destination,
    stopCategories.length,
    routeDistance,
  );
  const searchRadius = adaptiveSearchRadius(
    origin,
    destination,
    stopCategories.length,
    mode,
  );
  onSearchCoverage?.({
    path: [origin, destination],
    points: points.map((point, index) => ({
      ...point,
      category: stopCategories[index],
      radius: searchRadius,
    })),
  });
  const stops: Place[] = [];
  const selectedIds = new Set<string>();
  const candidateGroups = await Promise.all(
    stopCategories.map((category, index) =>
      nearbyCandidates(points[index], category, searchRadius),
    ),
  );
  // Select in journey order after fetching in parallel, rejecting duplicates between areas.
  for (let index = 0; index < stopCategories.length; index += 1) {
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
      "No suitable places were found along this route. Try different interests, locations or a longer route.",
    );
  if (stops.length !== stopCategories.length) {
    throw new Error(
      "We couldn't find enough suitable places along this route. Try fewer stops, different interests or nearby locations.",
    );
  }
  return routeThroughStops(origin, destination, stops, mode);
}

export async function planLocalTour(
  locationText: string,
  radius: number,
  quantities: CategoryQuantities,
  mode: TravelMode,
  onSearchCoverage?: (coverage: SearchCoverage) => void,
): Promise<RoutePlan> {
  const centre = await geocode(locationText);
  const maximumRadius = mode === "walking" ? 5000 : 15000;
  const searchRadius = Math.round(Math.min(maximumRadius, Math.max(500, radius)));
  const stopCategories = distributedCategories(quantities);
  const categories = [...new Set(stopCategories)];
  onSearchCoverage?.({
    path: [centre, centre],
    points: [{
      ...centre,
      category: "local",
      radius: searchRadius,
    }],
  });

  const categoryCandidates = new Map(
    await Promise.all(
      categories.map(async (category) => [
        category,
        await nearbyCandidates(centre, category, searchRadius),
      ] as const),
    ),
  );
  const categoryIndices = new Map<StopCategory, number>();
  const selectedIds = new Set<string>();
  const stops = stopCategories
    .map((category) => {
      const candidates = categoryCandidates.get(category) ?? [];
      let index = categoryIndices.get(category) ?? 0;
      while (index < candidates.length && selectedIds.has(candidates[index].place_id)) {
        index += 1;
      }
      categoryIndices.set(category, index + 1);
      const place = candidates[index];
      if (place) selectedIds.add(place.place_id);
      return place;
    })
    .filter((place): place is Place => Boolean(place));

  if (stops.length !== stopCategories.length) {
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
    point,
    stop.category,
  );
  const excluded = new Set(excludedPlaceIds);
  const replacement = candidates.find(
    (candidate) => !excluded.has(candidate.place_id),
  );
  if (!replacement)
    throw new Error(`No different ${stop.category} place was found nearby.`);
  return replacement;
}

export async function findAdditionalStop(
  category: StopCategory,
  point: Coordinate,
  excludedPlaceIds: string[],
): Promise<Place> {
  const candidates = await nearbyCandidates(
    point,
    category,
  );
  const excluded = new Set(excludedPlaceIds);
  const place = candidates.find(
    (candidate) => !excluded.has(candidate.place_id),
  );
  if (!place)
    throw new Error(
      `No suitable ${category} place was found in that part of the route.`,
    );
  return place;
}
