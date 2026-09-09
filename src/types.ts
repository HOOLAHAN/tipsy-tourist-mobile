export type Coordinate = { latitude: number; longitude: number };

export type StopCategory =
  | "landmarks"
  | "museums"
  | "galleries"
  | "parks"
  | "cafes"
  | "food"
  | "shopping"
  | "markets";

export type CategoryQuantities = Record<StopCategory, number>;

export type SearchCoveragePoint = Coordinate & {
  category: StopCategory | "local";
  radius: number;
};

export type SearchCoverage = {
  path: Coordinate[];
  points: SearchCoveragePoint[];
};

export type TravelMode = "walking" | "transit" | "driving" | "smart";
export type RouteLegMode = Exclude<TravelMode, "smart">;

export type Place = {
  place_id: string;
  name: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  business_status?: string;
  types?: string[];
  category: StopCategory;
  geometry: { location: { lat: number; lng: number } };
};

export type PlaceDetails = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  opening_hours?: { open_now?: boolean; weekday_text?: string[] };
  photos?: { photo_reference: string }[];
  vicinity?: string;
  price_level?: number;
  url?: string;
  editorial_summary?: { overview?: string };
  wheelchair_accessible_entrance?: boolean;
  reviews?: {
    author_name?: string;
    rating?: number;
    relative_time_description?: string;
    text?: string;
  }[];
};

export type PlaceSuggestion = {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
};

export type RoutePlan = {
  origin: Coordinate;
  destination: Coordinate;
  coordinates: Coordinate[];
  stops: Place[];
  distance: string;
  duration: string;
  legs: RouteLeg[];
};

export type RouteLeg = {
  distance: string;
  duration: string;
  midpoint: Coordinate;
  mode: RouteLegMode;
  coordinates: Coordinate[];
};
