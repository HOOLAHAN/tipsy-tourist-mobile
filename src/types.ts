export type Coordinate = { latitude: number; longitude: number };

export type TravelMode = 'walking' | 'bicycling' | 'driving';

export type Place = {
  place_id: string;
  name: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  stopType: 'pub' | 'attraction';
  geometry: { location: { lat: number; lng: number } };
};

export type PlaceDetails = {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  opening_hours?: { open_now?: boolean; weekday_text?: string[] };
};

export type RoutePlan = {
  origin: Coordinate;
  destination: Coordinate;
  coordinates: Coordinate[];
  stops: Place[];
  distance: string;
  duration: string;
};
