import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import MapView, {
  Marker,
  Polyline,
  Circle,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import { captureRef } from "react-native-view-shot";
import {
  getPlaceDetails,
  getPlacePhotoUrl,
  getGoogleMapsRequestHeaders,
  getPlaceSuggestions,
  findAdditionalStop,
  findReplacementStop,
  planRoute,
  planLocalTour,
  routeThroughStops,
} from "./src/api";
import { ThemeName, themes } from "./src/theme";
import {
  Place,
  PlaceDetails,
  PlaceSuggestion,
  RoutePlan,
  RouteLeg,
  SearchCoverage,
} from "./src/types";

const LONDON: Region = {
  latitude: 51.5033,
  longitude: -0.1196,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const BLUE = "#4285f4";
const SUPPORT_BASE_URL =
  process.env.EXPO_PUBLIC_SUPPORT_URL ??
  "https://d3pbhrkalr09t8.cloudfront.net";
const SHARE_MAP_ASPECT = 1080 / 600;
function RainbowTitle() {
  const colors = ["#ea4335", "#fbbc05", "#4285f4", "#34a853"];
  return (
    <Text style={styles.brandTitle}>
      {"Tipsy Tourist".split("").map((letter, index) => (
        <Text
          key={index}
          style={{
            color: letter === " " ? undefined : colors[index % colors.length],
          }}
        >
          {letter}
        </Text>
      ))}
    </Text>
  );
}

function RoutePin({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.pinContainer}>
      <View style={[styles.pinShape, { backgroundColor: color }]} />
      <Text style={styles.pinLabel}>{label}</Text>
    </View>
  );
}

function SummaryChip({
  label,
  backgroundColor,
  color,
}: {
  label: string;
  backgroundColor: string;
  color: string;
}) {
  return (
    <View style={[styles.summaryChip, { backgroundColor }]}>
      <Text style={[styles.summaryChipText, { color }]}>{label}</Text>
    </View>
  );
}

function shareMapRegion(route: RoutePlan): Region {
  const points = [route.origin, ...route.coordinates, route.destination];
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitude = (minLatitude + maxLatitude) / 2;
  const longitude = (minLongitude + maxLongitude) / 2;
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.002);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.002);
  const latitudeCosine = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  const projectedLongitudeSpan = longitudeSpan * latitudeCosine;
  // The limiting axis occupies 80% of the landscape export, leaving 10% each side.
  const latitudeDelta = Math.max(
    latitudeSpan / 0.8,
    projectedLongitudeSpan / (SHARE_MAP_ASPECT * 0.8),
  );
  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta: (latitudeDelta * SHARE_MAP_ASPECT) / latitudeCosine,
  };
}

function sharePinPosition(
  coordinate: { latitude: number; longitude: number },
  region: Region,
) {
  const left =
    ((coordinate.longitude - (region.longitude - region.longitudeDelta / 2)) /
      region.longitudeDelta) *
    100;
  const top =
    ((region.latitude + region.latitudeDelta / 2 - coordinate.latitude) /
      region.latitudeDelta) *
    100;
  return {
    left: `${Math.max(0, Math.min(100, left))}%` as const,
    top: `${Math.max(0, Math.min(100, top))}%` as const,
  };
}

function AutocompleteInput({
  value,
  onChange,
  placeholder,
  onLocate,
  colors,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onLocate: () => void;
  colors: (typeof themes)[ThemeName];
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        getPlaceSuggestions(value)
          .then(setSuggestions)
          .catch(() => setSuggestions([])),
      300,
    );
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <View style={styles.autocompleteWrap}>
      <View style={styles.locationRow}>
        <TextInput
          value={value}
          onChangeText={(next) => {
            onChange(next);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={[
            styles.locationInput,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        />
        <Pressable
          accessibilityLabel={`Choose ${placeholder} on map`}
          onPress={onLocate}
          style={[
            styles.pinButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="location" size={22} color={colors.primary} />
        </Pressable>
      </View>
      {focused && suggestions.length > 0 && (
        <View
          style={[
            styles.suggestions,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {suggestions.slice(0, 5).map((item) => (
            <Pressable
              key={item.place_id}
              onPress={() => {
                onChange(item.description);
                setSuggestions([]);
                setFocused(false);
                Keyboard.dismiss();
              }}
              style={[
                styles.suggestionRow,
                { borderBottomColor: colors.border },
              ]}
            >
              <Ionicons name="location-sharp" size={20} color={colors.muted} />
              <Text
                numberOfLines={1}
                style={[styles.suggestionText, { color: colors.text }]}
              >
                <Text style={{ fontWeight: "800" }}>{item.main_text}</Text>
                {item.secondary_text ? ` ${item.secondary_text}` : ""}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function StopCounter({
  label,
  max,
  value,
  icon,
  onChange,
  colors,
}: {
  label: string;
  max: number;
  value: number;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onChange: (value: number) => void;
  colors: (typeof themes)[ThemeName];
}) {
  return (
    <View
      style={[
        styles.stopCounter,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.counterHeading}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
        <Text style={[styles.counterTitle, { color: colors.text }]}>
          {label}
        </Text>
        <Text style={[styles.maxLabel, { color: colors.muted }]}>
          Max {max}
        </Text>
      </View>
      <View style={styles.counterButtons}>
        <Pressable
          disabled={value <= 1}
          onPress={() => onChange(Math.max(1, value - 1))}
          style={[
            styles.counterCircle,
            {
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: value <= 1 ? 0.35 : 1,
            },
          ]}
        >
          <Text style={[styles.counterSymbol, { color: colors.primary }]}>
            −
          </Text>
        </Pressable>
        <View
          style={[
            styles.counterValue,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Text style={[styles.counterNumber, { color: colors.text }]}>
            {value}
          </Text>
        </View>
        <Pressable
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={[
            styles.counterCircle,
            styles.counterCircleFilled,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              opacity: value >= max ? 0.35 : 1,
            },
          ]}
        >
          <Text style={[styles.counterSymbol, { color: "#fff" }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailRows({
  details,
  colors,
}: {
  details: PlaceDetails;
  colors: (typeof themes)[ThemeName];
}) {
  const [showHours, setShowHours] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const hours = details.opening_hours?.weekday_text?.[today];
  const mapsUrl =
    details.url ??
    (details.place_id
      ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(details.place_id)}&query=${encodeURIComponent(details.name ?? "Place")}`
      : undefined);
  const directionsUrl = details.place_id
    ? `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(details.place_id)}&destination=${encodeURIComponent(details.name ?? "Place")}`
    : undefined;
  return (
    <View style={styles.detailRows}>
      <View style={styles.detailRow}>
        <Ionicons name="home" size={23} color={colors.text} />
        <Text style={[styles.detailText, { color: colors.text }]}>
          {details.formatted_address ??
            details.vicinity ??
            "Address unavailable"}
        </Text>
      </View>
      {details.price_level !== undefined && (
        <View style={styles.detailRow}>
          <Ionicons name="cash-outline" size={23} color={colors.text} />
          <Text style={[styles.detailText, { color: colors.text }]}>
            Price level {"£".repeat(Math.max(1, details.price_level))}
          </Text>
        </View>
      )}
      {details.formatted_phone_number && (
        <Pressable
          style={styles.detailRow}
          onPress={() =>
            Linking.openURL(`tel:${details.formatted_phone_number}`)
          }
        >
          <Ionicons name="call" size={23} color={colors.text} />
          <Text style={[styles.detailText, { color: colors.text }]}>
            {details.formatted_phone_number}
          </Text>
        </Pressable>
      )}
      {details.website && (
        <Pressable
          style={styles.detailRow}
          onPress={() => Linking.openURL(details.website!)}
        >
          <Ionicons name="link" size={23} color={colors.text} />
          <Text
            style={[styles.detailLink, { color: "#58aff0" }]}
            numberOfLines={1}
          >
            {details.name} – website
          </Text>
        </Pressable>
      )}
      <View style={styles.detailRow}>
        <View style={styles.stars}>
          {Array.from({ length: 5 }, (_, index) => (
            <Ionicons
              key={index}
              name={
                index < Math.round(details.rating ?? 0)
                  ? "star"
                  : "star-outline"
              }
              size={20}
              color={
                index < Math.round(details.rating ?? 0)
                  ? "#fbbf24"
                  : colors.muted
              }
            />
          ))}
        </View>
        <Text style={[styles.ratingText, { color: colors.text }]}>
          {details.rating
            ? `${details.rating} (${details.user_ratings_total ?? 0})`
            : "No rating"}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="calendar" size={23} color={colors.text} />
        <Text
          style={[
            styles.detailText,
            !hours && { fontStyle: "italic", color: colors.muted },
            { color: hours ? colors.text : colors.muted },
          ]}
        >
          {hours
            ? details.opening_hours?.open_now
              ? `Open – ${hours.split("–")[1]?.trim() ? `Closes at ${hours.split("–")[1].trim()}` : hours}`
              : "Closed"
            : "No opening hours info"}
        </Text>
      </View>
      {!!details.opening_hours?.weekday_text?.length && (
        <>
          <Pressable
            style={styles.detailDisclosure}
            onPress={() => setShowHours((value) => !value)}
          >
            <Text
              style={[styles.detailDisclosureText, { color: colors.primary }]}
            >
              {showHours ? "Hide weekly hours" : "View weekly hours"}
            </Text>
            <Ionicons
              name={showHours ? "chevron-up" : "chevron-down"}
              size={17}
              color={colors.primary}
            />
          </Pressable>
          {showHours && (
            <View
              style={[styles.detailInset, { backgroundColor: colors.card }]}
            >
              {details.opening_hours.weekday_text.map((line) => (
                <Text
                  key={line}
                  style={[styles.detailInsetText, { color: colors.text }]}
                >
                  {line}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
      {details.editorial_summary?.overview && (
        <Text style={[styles.detailDescription, { color: colors.muted }]}>
          {details.editorial_summary.overview}
        </Text>
      )}
      {details.wheelchair_accessible_entrance !== undefined && (
        <View style={styles.detailRow}>
          <MaterialCommunityIcons
            name="wheelchair-accessibility"
            size={23}
            color={colors.text}
          />
          <Text style={[styles.detailText, { color: colors.text }]}>
            {details.wheelchair_accessible_entrance
              ? "Wheelchair-accessible entrance"
              : "Entrance not marked as wheelchair accessible"}
          </Text>
        </View>
      )}
      {(mapsUrl || directionsUrl) && (
        <View style={styles.mapActionRow}>
          {mapsUrl && (
            <Pressable
              style={[styles.mapAction, { backgroundColor: colors.card }]}
              onPress={() => Linking.openURL(mapsUrl)}
            >
              <Ionicons name="map-outline" size={18} color={colors.primary} />
              <Text style={[styles.mapActionText, { color: colors.primary }]}>
                Open in Maps
              </Text>
            </Pressable>
          )}
          {directionsUrl && (
            <Pressable
              style={[styles.mapAction, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openURL(directionsUrl)}
            >
              <Ionicons name="navigate-outline" size={18} color="#fff" />
              <Text style={[styles.mapActionText, { color: "#fff" }]}>
                Directions
              </Text>
            </Pressable>
          )}
        </View>
      )}
      {!!details.reviews?.length && (
        <>
          <Pressable
            style={styles.detailDisclosure}
            onPress={() => setShowReviews((value) => !value)}
          >
            <Text
              style={[styles.detailDisclosureText, { color: colors.primary }]}
            >
              {showReviews
                ? "Hide reviews"
                : `Recent reviews (${Math.min(2, details.reviews.length)})`}
            </Text>
            <Ionicons
              name={showReviews ? "chevron-up" : "chevron-down"}
              size={17}
              color={colors.primary}
            />
          </Pressable>
          {showReviews &&
            details.reviews.slice(0, 2).map((review, index) => (
              <View
                key={`${review.author_name}-${index}`}
                style={[styles.reviewCard, { backgroundColor: colors.card }]}
              >
                <View style={styles.reviewHeading}>
                  <Text style={[styles.reviewAuthor, { color: colors.text }]}>
                    {review.author_name ?? "Google user"}
                  </Text>
                  <Text style={[styles.reviewMeta, { color: colors.muted }]}>
                    {review.rating ? `★ ${review.rating}` : ""}{" "}
                    {review.relative_time_description}
                  </Text>
                </View>
                <Text
                  style={[styles.reviewText, { color: colors.muted }]}
                  numberOfLines={4}
                >
                  {review.text}
                </Text>
              </View>
            ))}
        </>
      )}
    </View>
  );
}

function PlaceCard({
  place,
  index,
  colors,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
  onRegenerate,
  updating,
  leg,
}: {
  place: Place;
  index: number;
  colors: (typeof themes)[ThemeName];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (amount: number) => void;
  onRemove?: () => void;
  onRegenerate?: () => void;
  updating?: boolean;
  leg?: RouteLeg;
}) {
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  useEffect(() => {
    getPlaceDetails(place.place_id)
      .then(setDetails)
      .catch(() => setDetails({ name: place.name, vicinity: place.vicinity }));
  }, [place.place_id]);
  const photo = getPlacePhotoUrl(details);
  return (
    <View
      style={[
        styles.placeCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.placeHeading}>
        <View style={styles.stopBadge}>
          <Text style={styles.stopBadgeText}>{index + 1}</Text>
        </View>
        <Text
          style={[styles.placeName, { color: colors.text }]}
          numberOfLines={2}
        >
          {details?.name ?? place.name}
        </Text>
        <View
          style={[
            styles.typeBadge,
            {
              backgroundColor: place.stopType === "pub" ? "#ffd9db" : "#e9d5ff",
            },
          ]}
        >
          <Text
            style={{
              color: place.stopType === "pub" ? "#9f3034" : "#6b21a8",
              fontWeight: "700",
            }}
          >
            {place.stopType.toUpperCase()}
          </Text>
        </View>
      </View>
      {onMove && (
        <View style={styles.moveButtons}>
          <Pressable
            disabled={!canMoveUp}
            onPress={() => onMove(-1)}
            style={[styles.moveButton, { opacity: canMoveUp ? 1 : 0.35 }]}
          >
            <Ionicons name="chevron-up" size={18} color="#fff" />
            <Text style={styles.moveText}>Earlier</Text>
          </Pressable>
          <Pressable
            disabled={!canMoveDown}
            onPress={() => onMove(1)}
            style={[styles.moveButton, { opacity: canMoveDown ? 1 : 0.35 }]}
          >
            <Ionicons name="chevron-down" size={18} color="#fff" />
            <Text style={styles.moveText}>Later</Text>
          </Pressable>
        </View>
      )}
      {(onRemove || onRegenerate) && (
        <View style={styles.stopActionBar}>
          <Pressable
            disabled={updating}
            onPress={onRegenerate}
            style={[styles.stopActionButton, { backgroundColor: colors.card }]}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
            <Text style={[styles.stopActionText, { color: colors.primary }]}>
              {updating ? "Replacing…" : "Replace stop"}
            </Text>
          </Pressable>
          <Pressable
            disabled={updating}
            onPress={onRemove}
            style={[styles.stopActionButton, { backgroundColor: colors.card }]}
          >
            <Ionicons name="trash-outline" size={18} color="#e11d48" />
            <Text style={[styles.stopActionText, { color: "#e11d48" }]}>
              Remove
            </Text>
          </Pressable>
        </View>
      )}
      {!details ? (
        <ActivityIndicator style={{ margin: 30 }} color={BLUE} />
      ) : (
        <>
          {photo && (
            <Image
              source={{ uri: photo, headers: getGoogleMapsRequestHeaders() }}
              style={styles.placeImage}
              resizeMode="cover"
            />
          )}
          <DetailRows details={details} colors={colors} />
        </>
      )}
    </View>
  );
}

function ItineraryRow({
  place,
  index,
  total,
  isLast,
  colors,
  onOpen,
  onDrop,
  onDragChange,
  onRemove,
  onRegenerate,
  updating,
  leg,
}: {
  place: Place;
  index: number;
  total: number;
  isLast: boolean;
  colors: (typeof themes)[ThemeName];
  onOpen: () => void;
  onDrop: (from: number, to: number) => void;
  onDragChange: (dragging: boolean) => void;
  onRemove: () => void;
  onRegenerate: () => void;
  updating?: boolean;
  leg?: RouteLeg;
}) {
  const stopColor = place.stopType === "pub" ? "#e11d48" : "#7c3aed";
  const translateY = useRef(new Animated.Value(0)).current;
  const activeRef = useRef(false);
  const capturedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: () => {
          if (activeRef.current) capturedRef.current = true;
          return activeRef.current;
        },
        onMoveShouldSetPanResponder: () => activeRef.current,
        onPanResponderMove: (_, gesture) => {
          if (activeRef.current) {
            capturedRef.current = true;
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const target = Math.max(
            0,
            Math.min(total - 1, index + Math.round(gesture.dy / 106)),
          );
          activeRef.current = false;
          capturedRef.current = false;
          setDragging(false);
          onDragChange(false);
          Animated.spring(translateY, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
          if (target !== index) {
            Haptics.selectionAsync();
            onDrop(index, target);
          }
        },
        onPanResponderTerminate: () => {
          activeRef.current = false;
          capturedRef.current = false;
          setDragging(false);
          onDragChange(false);
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [index, total, translateY, onDrop, onDragChange],
  );
  const activateDrag = () => {
    activeRef.current = true;
    capturedRef.current = false;
    setDragging(true);
    onDragChange(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(translateY, { toValue: -5, useNativeDriver: true }).start();
  };
  const endStationaryHold = () => {
    if (activeRef.current && !capturedRef.current) {
      activeRef.current = false;
      setDragging(false);
      onDragChange(false);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }
  };
  return (
    <Animated.View
      {...dragResponder.panHandlers}
      style={[
        styles.timelineRow,
        dragging && styles.draggingRow,
        { transform: [{ translateY }, { scale: dragging ? 1.025 : 1 }] },
      ]}
    >
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: stopColor }]}>
          <Text style={styles.timelineNumber}>{index + 1}</Text>
        </View>
        {!isLast && (
          <View
            style={[styles.timelineLine, { backgroundColor: colors.border }]}
          />
        )}
      </View>
      <Pressable
        delayLongPress={350}
        onLongPress={activateDrag}
        onPressOut={endStationaryHold}
        onPress={() => {
          if (!activeRef.current) onOpen();
        }}
        style={[
          styles.itineraryCard,
          dragging && styles.itineraryCardDragging,
          {
            backgroundColor: dragging ? colors.card : colors.surface,
            borderColor: dragging ? colors.primary : colors.border,
          },
        ]}
      >
        <View style={styles.itineraryCopy}>
          <View style={styles.itineraryMeta}>
            <MaterialCommunityIcons
              name={place.stopType === "pub" ? "glass-mug-variant" : "camera"}
              size={15}
              color={stopColor}
            />
            <Text style={[styles.itineraryType, { color: stopColor }]}>
              {place.stopType === "pub" ? "PUB" : "ATTRACTION"}
            </Text>
          </View>
          <Text
            style={[styles.itineraryName, { color: colors.text }]}
            numberOfLines={2}
          >
            {place.name}
          </Text>
          <Text
            style={[styles.itineraryAddress, { color: colors.muted }]}
            numberOfLines={1}
          >
            {dragging
              ? "Move up or down, then release"
              : (place.vicinity ?? "Tap for place details")}
          </Text>
          {leg && !dragging && (
            <View style={styles.itineraryLeg}>
              <MaterialCommunityIcons
                name="walk"
                size={14}
                color={colors.primary}
              />
              <Text style={[styles.itineraryLegText, { color: colors.primary }]}>
                {index === 0 ? "From start" : "From previous stop"} · {leg.duration} · {leg.distance}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rowActions}>
          <Pressable
            disabled={updating}
            onPress={onRegenerate}
            style={styles.rowAction}
          >
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
          <Pressable
            disabled={updating}
            onPress={onRemove}
            style={styles.rowAction}
          >
            <Ionicons name="trash-outline" size={18} color="#e11d48" />
          </Pressable>
          <MaterialCommunityIcons
            name={dragging ? "drag-vertical" : "gesture-tap-hold"}
            size={21}
            color={dragging ? colors.primary : colors.muted}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const ShareCard = forwardRef<
  View,
  {
    route: RoutePlan;
    start: string;
    finish: string;
    travelLabel: string;
    mapUri: string;
    onMapLoaded: () => void;
  }
>(function ShareCard(
  { route, start, finish, travelLabel, mapUri, onMapLoaded },
  ref,
) {
  const exportRegion = shareMapRegion(route);
  const mapPins = [
    { key: "start", coordinate: route.origin, label: "S", color: "#2563eb" },
    ...route.stops.map((place, index) => ({
      key: place.place_id,
      coordinate: {
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
      },
      label: String(index + 1),
      color: place.stopType === "pub" ? "#e11d48" : "#7c3aed",
    })),
    {
      key: "finish",
      coordinate: route.destination,
      label: "F",
      color: "#16a34a",
    },
  ];
  return (
    <View ref={ref} collapsable={false} style={styles.shareCard}>
      <View style={styles.shareBrandRow}>
        <Image
          source={require("./assets/tipsy-logo.png")}
          style={styles.shareLogo}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }}>
          <RainbowTitle />
          <Text style={styles.shareStrapline}>
            Your pub-and-sights adventure
          </Text>
        </View>
      </View>
      <View style={styles.shareStats}>
        <Text style={styles.shareStat}>{route.stops.length} STOPS</Text>
        <Text style={styles.shareStat}>{route.distance.toUpperCase()}</Text>
        <Text style={styles.shareStat}>{route.duration.toUpperCase()}</Text>
        <Text style={[styles.shareStat, styles.shareMode]}>
          {travelLabel.toUpperCase()}
        </Text>
      </View>
      <View style={styles.shareMapFrame}>
        <Image
          source={{ uri: mapUri }}
          onLoad={onMapLoaded}
          style={styles.shareMap}
          resizeMode="cover"
        />
        {mapPins.map((pin) => (
          <View
            key={pin.key}
            style={[
              styles.shareMapPin,
              sharePinPosition(pin.coordinate, exportRegion),
            ]}
          >
            <View
              style={[styles.shareMapPinShape, { backgroundColor: pin.color }]}
            />
            <Text style={styles.shareMapPinLabel}>{pin.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.shareEndpoints}>
        <View style={[styles.shareEndpointDot, { backgroundColor: "#2563eb" }]}>
          <Text style={styles.shareEndpointLetter}>S</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareEndpointLabel}>START</Text>
          <Text numberOfLines={1} style={styles.shareEndpointText}>
            {start}
          </Text>
        </View>
      </View>
      <View style={styles.shareStopGrid}>
        {route.stops.map((place, index) => {
          const color = place.stopType === "pub" ? "#e11d48" : "#7c3aed";
          return (
            <View key={place.place_id} style={styles.shareStop}>
              <View
                style={[styles.shareStopNumber, { backgroundColor: color }]}
              >
                <Text style={styles.shareStopNumberText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.shareStopName}>
                  {place.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.shareStopType, { color }]}
                >
                  {place.stopType === "pub" ? "PUB" : "ATTRACTION"}
                  {place.rating ? ` · ★ ${place.rating}` : ""}
                </Text>
                {!!place.vicinity && (
                  <Text numberOfLines={1} style={styles.shareStopAddress}>
                    {place.vicinity}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.shareEndpoints}>
        <View style={[styles.shareEndpointDot, { backgroundColor: "#16a34a" }]}>
          <Text style={styles.shareEndpointLetter}>F</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareEndpointLabel}>FINISH</Text>
          <Text numberOfLines={1} style={styles.shareEndpointText}>
            {finish}
          </Text>
        </View>
      </View>
      <Text style={styles.shareFooter}>Planned with Tipsy Tourist</Text>
    </View>
  );
});

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const shareCardRef = useRef<View>(null);
  const shareImageLoadedRef = useRef<(() => void) | null>(null);
  const [themeName, setThemeName] = useState<ThemeName>("light");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoSection, setInfoSection] = useState<string | null>("safety");
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsFromItinerary, setDetailsFromItinerary] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [plannerMode, setPlannerMode] = useState<"journey" | "local">("journey");
  const [localRadius, setLocalRadius] = useState(1500);
  const [pubs, setPubs] = useState(1);
  const [attractions, setAttractions] = useState(1);
  const mode = "walking" as const;
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [searchCoverage, setSearchCoverage] = useState<SearchCoverage | null>(null);
  const [showSearchCoverage, setShowSearchCoverage] = useState(true);
  const [showWalkingLegs, setShowWalkingLegs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [updatingStopId, setUpdatingStopId] = useState<string | null>(null);
  const [capturingShareMap, setCapturingShareMap] = useState(false);
  const [shareMapUri, setShareMapUri] = useState<string | null>(null);
  const colors = themes[themeName];
  const plannerTranslateY = useRef(new Animated.Value(0)).current;
  const itineraryTranslateY = useRef(new Animated.Value(0)).current;
  const infoTranslateY = useRef(new Animated.Value(0)).current;
  const plannerClosingRef = useRef(false);
  const itineraryClosingRef = useRef(false);
  const infoClosingRef = useRef(false);
  const detailTranslateX = useRef(new Animated.Value(420)).current;

  const openPlanner = () => {
    plannerClosingRef.current = false;
    plannerTranslateY.stopAnimation();
    plannerTranslateY.setValue(0);
    setPlannerOpen(true);
  };
  const dismissPlanner = () => {
    if (plannerClosingRef.current) return;
    plannerClosingRef.current = true;
    Animated.timing(plannerTranslateY, {
      toValue: 700,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setPlannerOpen(false);
    });
  };
  const plannerPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dy > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) =>
          plannerTranslateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.8) dismissPlanner();
          else
            Animated.spring(plannerTranslateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              useNativeDriver: true,
            }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(plannerTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [plannerTranslateY],
  );

  const openItinerary = () => {
    itineraryClosingRef.current = false;
    itineraryTranslateY.stopAnimation();
    itineraryTranslateY.setValue(0);
    setItineraryOpen(true);
  };
  const closeItinerary = () => {
    if (itineraryClosingRef.current) return;
    itineraryClosingRef.current = true;
    Animated.timing(itineraryTranslateY, {
      toValue: 800,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setItineraryOpen(false);
      setDetailsFromItinerary(false);
      setSelectedPlace(null);
      detailTranslateX.setValue(420);
    });
  };
  const itineraryPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dy > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) =>
          itineraryTranslateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 70 || gesture.vy > 0.65) closeItinerary();
          else
            Animated.spring(itineraryTranslateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              useNativeDriver: true,
            }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(itineraryTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [itineraryTranslateY],
  );

  const openInfo = () => {
    infoClosingRef.current = false;
    infoTranslateY.stopAnimation();
    infoTranslateY.setValue(0);
    setInfoOpen(true);
  };
  const closeInfo = () => {
    if (infoClosingRef.current) return;
    infoClosingRef.current = true;
    Animated.timing(infoTranslateY, {
      toValue: 800,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setInfoOpen(false);
    });
  };
  const infoPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dy > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 2 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) =>
          infoTranslateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 70 || gesture.vy > 0.65) closeInfo();
          else
            Animated.spring(infoTranslateY, {
              toValue: 0,
              damping: 18,
              stiffness: 220,
              useNativeDriver: true,
            }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(infoTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start(),
      }),
    [infoTranslateY],
  );
  const openSupportPage = (path: string) =>
    Linking.openURL(`${SUPPORT_BASE_URL}/#${path}`);

  const openItineraryPlace = (place: Place) => {
    Haptics.selectionAsync();
    setSelectedPlace(place);
    setDetailsFromItinerary(true);
    itineraryClosingRef.current = false;
    setItineraryOpen(true);
    itineraryTranslateY.setValue(0);
    detailTranslateX.setValue(420);
    requestAnimationFrame(() =>
      Animated.spring(detailTranslateX, {
        toValue: 0,
        damping: 20,
        stiffness: 190,
        useNativeDriver: true,
      }).start(),
    );
  };
  const closeItineraryPlace = () =>
    Animated.timing(detailTranslateX, {
      toValue: 420,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setDetailsFromItinerary(false);
      setSelectedPlace(null);
    });

  useEffect(() => {
    AsyncStorage.getItem("tipsy-theme").then((value) =>
      setThemeName(value === "dark" ? "dark" : "light"),
    );
  }, []);
  useEffect(() => {
    AsyncStorage.setItem("tipsy-theme", themeName);
  }, [themeName]);

  const locateMe = async (target: "start" | "finish" | "map" = "map") => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Location permission needed",
        "Enable location access to use your current position.",
      );
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const coordinate = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
    mapRef.current?.animateToRegion({
      ...coordinate,
      latitudeDelta: 0.025,
      longitudeDelta: 0.025,
    });
    if (target !== "map")
      (target === "start" ? setStart : setFinish)(
        `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
      );
  };
  const submit = async () => {
    if (!start.trim() || (plannerMode === "journey" && !finish.trim()))
      return Alert.alert(
        plannerMode === "local" ? "Choose a location" : "Choose both locations",
        plannerMode === "local"
          ? "Choose the area where you want to take your local tour."
          : "Choose both a start and finish location.",
      );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchCoverage(null);
    setLoading(true);
    try {
      const next = plannerMode === "local"
        ? await planLocalTour(
            start,
            localRadius,
            pubs,
            attractions,
            mode,
            setSearchCoverage,
          )
        : await planRoute(
            start,
            finish,
            pubs,
            attractions,
            mode,
            setSearchCoverage,
          );
      setRoute(next);
      setPlannerOpen(false);
      requestAnimationFrame(() =>
        mapRef.current?.fitToCoordinates(next.coordinates, {
          edgePadding: { top: 170, right: 50, bottom: 130, left: 50 },
          animated: true,
        }),
      );
    } catch (error) {
      Alert.alert(
        "Could not plan route",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const clear = () => {
    setRoute(null);
    setSearchCoverage(null);
    setStart("");
    setFinish("");
    openPlanner();
  };
  const toggleTheme = () =>
    setThemeName((current) => (current === "light" ? "dark" : "light"));
  const moveStop = async (index: number, amount: number) => {
    if (!route || index + amount < 0 || index + amount >= route.stops.length)
      return;
    const previous = route;
    const stops = [...route.stops];
    const [item] = stops.splice(index, 1);
    stops.splice(index + amount, 0, item);
    const stopOrder = stops.map((place) => place.place_id).join("|");

    // Update the itinerary immediately, then replace the map geometry when Directions responds.
    setRoute({ ...route, stops });
    try {
      const updated = await routeThroughStops(
        route.origin,
        route.destination,
        stops,
        mode,
      );
      setRoute((current) =>
        current?.stops.map((place) => place.place_id).join("|") === stopOrder
          ? updated
          : current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setRoute((current) =>
        current?.stops.map((place) => place.place_id).join("|") === stopOrder
          ? previous
          : current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not update route",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };
  const applyStops = async (stops: Place[], previous: RoutePlan) => {
    const stopOrder = stops.map((place) => place.place_id).join("|");
    setRoute({ ...previous, stops });
    try {
      const updated = await routeThroughStops(
        previous.origin,
        previous.destination,
        stops,
        mode,
      );
      setRoute((current) =>
        current?.stops.map((place) => place.place_id).join("|") === stopOrder
          ? updated
          : current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (error) {
      setRoute((current) =>
        current?.stops.map((place) => place.place_id).join("|") === stopOrder
          ? previous
          : current,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not update route",
        error instanceof Error ? error.message : "Please try again.",
      );
      return false;
    }
  };
  const removeStop = (place: Place) => {
    if (!route || updatingStopId) return;
    Alert.alert(
      "Remove this stop?",
      `${place.name} will be removed and the route recalculated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setUpdatingStopId(place.place_id);
            const succeeded = await applyStops(
              route.stops.filter((item) => item.place_id !== place.place_id),
              route,
            );
            setUpdatingStopId(null);
            if (succeeded && selectedPlace?.place_id === place.place_id)
              closeItineraryPlace();
          },
        },
      ],
    );
  };
  const regenerateStop = async (place: Place) => {
    if (!route || updatingStopId) return;
    setUpdatingStopId(place.place_id);
    try {
      const replacement = await findReplacementStop(
        place,
        route.stops.map((item) => item.place_id),
      );
      const stops = route.stops.map((item) =>
        item.place_id === place.place_id ? replacement : item,
      );
      const succeeded = await applyStops(stops, route);
      if (succeeded && selectedPlace?.place_id === place.place_id)
        setSelectedPlace(replacement);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not replace stop",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setUpdatingStopId(null);
    }
  };
  const addStop = async (stopType: Place["stopType"]) => {
    if (!route || updatingStopId) return;
    const typeCount = route.stops.filter(
      (stop) => stop.stopType === stopType,
    ).length;
    if (typeCount >= 10) {
      Alert.alert(
        "Stop limit reached",
        `A route can contain up to 10 ${stopType === "pub" ? "pubs" : "attractions"}.`,
      );
      return;
    }

    const coordinates = [
      route.origin,
      ...route.stops.map((stop) => ({
        latitude: stop.geometry.location.lat,
        longitude: stop.geometry.location.lng,
      })),
      route.destination,
    ];
    let insertionIndex = 0;
    let largestGap = -1;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const latitude = coordinates[index + 1].latitude - coordinates[index].latitude;
      const longitude =
        coordinates[index + 1].longitude - coordinates[index].longitude;
      const gap = latitude * latitude + longitude * longitude;
      if (gap > largestGap) {
        largestGap = gap;
        insertionIndex = index;
      }
    }
    const before = coordinates[insertionIndex];
    const after = coordinates[insertionIndex + 1];
    const point = {
      latitude: (before.latitude + after.latitude) / 2,
      longitude: (before.longitude + after.longitude) / 2,
    };

    setUpdatingStopId("__adding__");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const place = await findAdditionalStop(
        stopType,
        point,
        route.stops.map((stop) => stop.place_id),
      );
      const stops = [...route.stops];
      stops.splice(insertionIndex, 0, place);
      await applyStops(stops, route);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not add stop",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setUpdatingStopId(null);
    }
  };
  const chooseStopToAdd = () => {
    if (!route || updatingStopId) return;
    Alert.alert("Add a stop", "What would you like along the route?", [
      { text: "Cancel", style: "cancel" },
      { text: "Pub", onPress: () => addStop("pub") },
      { text: "Attraction", onPress: () => addStop("attraction") },
    ]);
  };
  const travelLabel = "walking";
  const shareItinerary = async () => {
    if (!route || !mapRef.current || sharing) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Sharing is not available on this device.");
      const exportRegion = shareMapRegion(route);
      mapRef.current.animateToRegion(exportRegion, 0);
      await new Promise((resolve) => setTimeout(resolve, 250));
      setCapturingShareMap(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      let mapUri: string;
      try {
        mapUri = await mapRef.current.takeSnapshot({
          width: 1080,
          height: 600,
          region: exportRegion,
          format: "png",
          quality: 1,
          result: "file",
        });
      } finally {
        setCapturingShareMap(false);
      }
      const mapLoaded = new Promise<void>((resolve) => {
        shareImageLoadedRef.current = resolve;
      });
      setShareMapUri(mapUri);
      await Promise.race([
        mapLoaded,
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const cardUri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      await Sharing.shareAsync(cardUri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: "Share your Tipsy Tour",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Could not share itinerary",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      shareImageLoadedRef.current = null;
      setShareMapUri(null);
      setSharing(false);
    }
  };

  return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={themeName === "light" ? "dark" : "light"} />
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={LONDON}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          customMapStyle={colors.map as any}
          userInterfaceStyle={themeName}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {route && (
            <>
              <Polyline
                key="planned-route"
                coordinates={route.coordinates}
                strokeColor={colors.primary}
                strokeWidth={6}
                zIndex={5}
              />
              {!capturingShareMap && (
                <>
                  <Marker
                    coordinate={route.origin}
                    title="Start"
                    anchor={{ x: 0.5, y: 1 }}
                    zIndex={20}
                  >
                    <RoutePin label="S" color="#2563eb" />
                  </Marker>
                  {route.stops.map((place, index) => (
                    <Marker
                      key={place.place_id}
                      coordinate={{
                        latitude: place.geometry.location.lat,
                        longitude: place.geometry.location.lng,
                      }}
                      anchor={{ x: 0.5, y: 1 }}
                      zIndex={10 + index}
                      onPress={() => openItineraryPlace(place)}
                    >
                      <RoutePin
                        label={String(index + 1)}
                        color={place.stopType === "pub" ? "#e11d48" : "#7c3aed"}
                      />
                    </Marker>
                  ))}
                  <Marker
                    coordinate={route.destination}
                    title="Finish"
                    anchor={{ x: 0.5, y: 1 }}
                    zIndex={20}
                  >
                    <RoutePin label="F" color="#16a34a" />
                  </Marker>
                </>
              )}
            </>
          )}
          {!capturingShareMap && searchCoverage && (
            <>
              <Polyline
                key="search-path"
                coordinates={searchCoverage.path}
                strokeColor={showSearchCoverage
                  ? themeName === "light"
                    ? "rgba(15,23,42,0.42)"
                    : "rgba(226,232,240,0.42)"
                  : "rgba(0,0,0,0)"}
                strokeWidth={showSearchCoverage ? 2 : 0}
                lineDashPattern={[2, 9]}
                zIndex={2}
              />
              {searchCoverage.points.map((point, index) => {
                const isPub = point.stopType === "pub";
                const isLocal = point.stopType === "local";
                return (
                  <Circle
                    key={`search-area-${index}`}
                    center={point}
                    radius={point.radius}
                    fillColor={showSearchCoverage
                      ? isLocal
                        ? "rgba(59,130,246,0.05)"
                        : isPub
                          ? "rgba(225,29,72,0.035)"
                          : "rgba(124,58,237,0.035)"
                      : "rgba(0,0,0,0)"}
                    strokeColor={showSearchCoverage
                      ? isLocal
                        ? "rgba(59,130,246,0.42)"
                        : isPub
                          ? "rgba(225,29,72,0.34)"
                          : "rgba(124,58,237,0.34)"
                      : "rgba(0,0,0,0)"}
                    strokeWidth={showSearchCoverage ? 2 : 0}
                    zIndex={1}
                  />
                );
              })}
              {searchCoverage.points.map((point, index) => (
                <Circle
                  key={`search-centre-${index}`}
                  center={point}
                  radius={14}
                  fillColor={showSearchCoverage && !route
                    ? point.stopType === "local"
                      ? "#3b82f6"
                      : point.stopType === "pub"
                        ? "#e11d48"
                        : "#7c3aed"
                    : "rgba(0,0,0,0)"}
                  strokeColor={showSearchCoverage && !route ? "#ffffff" : "rgba(0,0,0,0)"}
                  strokeWidth={showSearchCoverage && !route ? 1 : 0}
                  zIndex={2}
                />
              ))}
            </>
          )}
          {!capturingShareMap && route?.legs.map((leg, index) => (
            <Marker
              key={`walking-leg-${index}`}
              coordinate={leg.midpoint}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={6}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.mapLegLabel,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.primary,
                    opacity: showWalkingLegs ? 1 : 0,
                    transform: [{ translateY: index % 2 === 0 ? -18 : 18 }],
                  },
                ]}
              >
                <MaterialCommunityIcons name="walk" size={11} color={colors.primary} />
                <Text style={[styles.mapLegText, { color: colors.text }]}>
                  {leg.duration.replace(" min", "m")} · {leg.distance
                    .replace(" km", "km")
                    .replace(" m", "m")}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>

        <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={styles.headerWrap}>
            <View
              style={[
                styles.topCard,
                styles.headerPill,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <View style={styles.headerRow}>
                <View style={styles.logoBox}>
                  <Image
                    source={require("./assets/tipsy-logo.png")}
                    style={styles.brandLogo}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <RainbowTitle />
                  <View style={styles.taglineRow}>
                    <MaterialCommunityIcons
                      name="map-marker-path"
                      size={19}
                      color={colors.muted}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.tagline, { color: colors.muted }]}
                    >
                      {route
                        ? `${route.distance} · ${route.duration} · ${travelLabel}`
                        : "Pubs, sights, one brilliant route"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Open route planner"
                  onPress={openPlanner}
                  style={[
                    styles.menuButton,
                    styles.filterButton,
                    { backgroundColor: colors.surface },
                  ]}
                >
                  <Ionicons
                    name="options-outline"
                    size={23}
                    color={colors.primary}
                  />
                </Pressable>
              </View>
            </View>
          </View>
          <View
            style={[
              styles.actionDock,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: colors.shadow,
              },
            ]}
          >
            <Pressable
              accessibilityLabel="Centre map on me"
              onPress={() => locateMe()}
              style={[styles.dockButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="navigate" size={24} color="#fff" />
            </Pressable>
            <Pressable
              accessibilityLabel="About and support"
              onPress={openInfo}
              style={[styles.dockButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons
                name="information-circle-outline"
                size={26}
                color={colors.text}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={`Use ${themeName === "light" ? "dark" : "light"} mode`}
              onPress={toggleTheme}
              style={[styles.dockButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons
                name={themeName === "light" ? "moon" : "sunny"}
                size={23}
                color={themeName === "light" ? "#475569" : "#fbbf24"}
              />
            </Pressable>
            {searchCoverage && (
              <Pressable
                accessibilityLabel={`${showSearchCoverage ? "Hide" : "Show"} search coverage`}
                accessibilityState={{ selected: showSearchCoverage }}
                onPress={() => setShowSearchCoverage((visible) => !visible)}
                style={[
                  styles.dockButton,
                  { backgroundColor: showSearchCoverage ? colors.accent : colors.surface },
                ]}
              >
                <MaterialCommunityIcons
                  name="map-marker-radius-outline"
                  size={25}
                  color={showSearchCoverage ? "#fff" : colors.text}
                />
              </Pressable>
            )}
            {route && (
              <Pressable
                accessibilityLabel={`${showWalkingLegs ? "Hide" : "Show"} walking times and distances`}
                accessibilityState={{ selected: showWalkingLegs }}
                onPress={() => setShowWalkingLegs((visible) => !visible)}
                style={[
                  styles.dockButton,
                  { backgroundColor: showWalkingLegs ? colors.accent : colors.surface },
                ]}
              >
                <MaterialCommunityIcons
                  name="walk"
                  size={24}
                  color={showWalkingLegs ? "#fff" : colors.text}
                />
              </Pressable>
            )}
            {route && (
              <Pressable
                accessibilityLabel="Clear route"
                onPress={clear}
                style={[styles.dockButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={27} color={colors.text} />
              </Pressable>
            )}
            {route && (
              <Pressable
                accessibilityLabel="View itinerary"
                onPress={openItinerary}
                style={[styles.dockButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="list" size={26} color={colors.text} />
              </Pressable>
            )}
          </View>
        </SafeAreaView>

        <Modal
          visible={plannerOpen}
          transparent
          animationType="none"
          onRequestClose={dismissPlanner}
        >
          <KeyboardAvoidingView
            style={styles.sheetOverlay}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable style={styles.sheetDismiss} onPress={dismissPlanner} />
            <Animated.View
              style={[
                styles.plannerSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  transform: [{ translateY: plannerTranslateY }],
                },
              ]}
            >
              <View
                style={styles.dragZone}
                {...plannerPanResponder.panHandlers}
              >
                <View style={styles.sheetHandle} />
                <Text style={[styles.dragHint, { color: colors.muted }]}>
                  Swipe down to close
                </Text>
              </View>
              <View style={styles.sheetHeader}>
                <View>
                  <Text
                    style={[styles.sheetEyebrow, { color: colors.primary }]}
                  >
                    BUILD A ROUTE
                  </Text>
                  <Text style={[styles.sheetTitle, { color: colors.text }]}>
                    {plannerMode === "local" ? "Explore nearby" : "Where are we going?"}
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                    {plannerMode === "local"
                      ? "Pick an area and we’ll create a circular tour."
                      : "Choose your route and we’ll find the stops."}
                  </Text>
                </View>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.plannerContent}
              >
                <View
                  style={[
                    styles.plannerModeSwitch,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  {([
                    ["journey", "Start to finish", "map-marker-path"],
                    ["local", "Local tour", "map-marker-radius-outline"],
                  ] as const).map(([value, label, icon]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: plannerMode === value }}
                      onPress={() => setPlannerMode(value)}
                      style={[
                        styles.plannerModeButton,
                        plannerMode === value && { backgroundColor: colors.primary },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={icon}
                        size={19}
                        color={plannerMode === value ? "#fff" : colors.muted}
                      />
                      <Text
                        style={[
                          styles.plannerModeText,
                          { color: plannerMode === value ? "#fff" : colors.text },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.routeInputs}>
                  <AutocompleteInput
                    value={start}
                    onChange={setStart}
                    placeholder={plannerMode === "local" ? "Tour location" : "Start location"}
                    onLocate={() => locateMe("start")}
                    colors={colors}
                  />
                  {plannerMode === "journey" && (
                    <>
                      <View
                        style={[
                          styles.routeConnector,
                          { backgroundColor: colors.border },
                        ]}
                      />
                      <AutocompleteInput
                        value={finish}
                        onChange={setFinish}
                        placeholder="Finish location"
                        onLocate={() => locateMe("finish")}
                        colors={colors}
                      />
                    </>
                  )}
                </View>
                {plannerMode === "local" && (
                  <View
                    style={[
                      styles.radiusCard,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.radiusHeading}>
                      <View>
                        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0 }]}>SEARCH RADIUS</Text>
                        <Text style={[styles.radiusHelp, { color: colors.muted }]}>How far from your chosen location?</Text>
                      </View>
                      <Text style={[styles.radiusValue, { color: colors.primary }]}>
                        {localRadius >= 1000
                          ? `${(localRadius / 1000).toFixed(localRadius % 1000 ? 2 : 0)} km`
                          : `${localRadius} m`}
                      </Text>
                    </View>
                    <Slider
                      accessibilityLabel="Local tour search radius"
                      minimumValue={500}
                      maximumValue={5000}
                      step={250}
                      value={localRadius}
                      onValueChange={setLocalRadius}
                      minimumTrackTintColor={colors.primary}
                      maximumTrackTintColor={colors.border}
                      thumbTintColor={colors.primary}
                    />
                    <View style={styles.radiusRangeLabels}>
                      <Text style={[styles.radiusRangeText, { color: colors.muted }]}>500 m</Text>
                      <Text style={[styles.radiusRangeText, { color: colors.muted }]}>5 km</Text>
                    </View>
                  </View>
                )}
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  STOPS ALONG THE WAY
                </Text>
                <View style={styles.countersRow}>
                  <StopCounter
                    label="Pubs"
                    max={10}
                    value={pubs}
                    icon="glass-cocktail"
                    onChange={setPubs}
                    colors={colors}
                  />
                  <StopCounter
                    label="Sights"
                    max={10}
                    value={attractions}
                    icon="camera"
                    onChange={setAttractions}
                    colors={colors}
                  />
                </View>
                <Pressable
                  disabled={loading}
                  onPress={submit}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                    loading && { opacity: 0.65 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="glass-mug-variant"
                        size={21}
                        color="#fff"
                      />
                      <Text style={styles.primaryButtonText}>
                        {route
                          ? "Update my route"
                          : plannerMode === "local"
                            ? "Plan my local tour"
                            : "Plan my Tipsy Tour"}
                      </Text>
                      <Ionicons name="arrow-forward" size={21} color="#fff" />
                    </>
                  )}
                </Pressable>
                {route && (
                  <Pressable onPress={clear} style={styles.sheetClear}>
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.muted}
                    />
                    <Text
                      style={[styles.sheetClearText, { color: colors.muted }]}
                    >
                      Clear current route
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={infoOpen}
          transparent
          animationType="none"
          onRequestClose={closeInfo}
        >
          <View style={[styles.modalOverlay, styles.bottomModalOverlay]}>
            <Pressable style={styles.modalDismiss} onPress={closeInfo} />
            <SafeAreaView
              edges={["left", "right"]}
              style={[styles.modalSafe, styles.bottomModalSafe]}
            >
              <Animated.View
                style={[
                  styles.modalPanel,
                  styles.bottomModalPanel,
                  styles.itineraryPanel,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    paddingBottom: safeAreaInsets.bottom,
                    transform: [{ translateY: infoTranslateY }],
                  },
                ]}
              >
                <View
                  style={styles.modalDragZone}
                  {...infoPanResponder.panHandlers}
                >
                  <View style={styles.modalHandle} />
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.infoContent}
                >
                  <View style={styles.infoBrand}>
                    <Image
                      source={require("./assets/tipsy-logo.png")}
                      style={styles.infoLogo}
                      resizeMode="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <RainbowTitle />
                      <Text
                        style={[styles.infoVersion, { color: colors.muted }]}
                      >
                        Version 1.0.0
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.infoIntro, { color: colors.text }]}>
                    Plan mixed pub-and-sights routes, reorder stops and share
                    your trip.
                  </Text>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                    QUICK INFORMATION
                  </Text>
                  <View
                    style={[styles.infoLinks, { borderColor: colors.border }]}
                  >
                    {[
                      [
                        "help",
                        "Help",
                        "help-buoy-outline",
                        "Choose start and finish points or a local area, select your stops, then plan your walking tour. Tap pins for venue details or open the itinerary to review and reorder stops.",
                      ],
                      [
                        "safety",
                        "Safety",
                        "shield-checkmark-outline",
                        "For people of legal drinking age. Drink responsibly, check venue and travel information, and never drive or cycle while impaired.",
                      ],
                      [
                        "privacy",
                        "Privacy summary",
                        "lock-closed-outline",
                        "No account is required. Route locations are shared with the services needed to build your trip, while app preferences remain on your device.",
                      ],
                    ].map(([key, label, icon, copy]) => {
                      const expanded = infoSection === key;
                      return (
                        <View
                          key={key}
                          style={{
                            borderBottomColor: colors.border,
                            borderBottomWidth: 1,
                          }}
                        >
                          <Pressable
                            onPress={() =>
                              setInfoSection(expanded ? null : key)
                            }
                            style={styles.infoLink}
                          >
                            <Ionicons
                              name={icon as any}
                              size={21}
                              color={colors.primary}
                            />
                            <Text
                              style={[
                                styles.infoLinkText,
                                { color: colors.text },
                              ]}
                            >
                              {label}
                            </Text>
                            <Ionicons
                              name={expanded ? "chevron-up" : "chevron-down"}
                              size={18}
                              color={colors.muted}
                            />
                          </Pressable>
                          {expanded && (
                            <Text
                              style={[
                                styles.infoSectionCopy,
                                { color: colors.muted },
                              ]}
                            >
                              {copy}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                    FULL POLICIES
                  </Text>
                  <View
                    style={[
                      styles.infoPolicyLinks,
                      { borderColor: colors.border },
                    ]}
                  >
                    {[
                      ["Privacy", "/privacy"],
                      ["Terms", "/terms"],
                      ["Your data", "/data-deletion"],
                    ].map(([label, path]) => (
                      <Pressable
                        key={path}
                        onPress={() => openSupportPage(path)}
                        style={styles.infoPolicyLink}
                      >
                        <Text
                          style={[
                            styles.infoPolicyText,
                            { color: colors.primary },
                          ]}
                        >
                          {label}
                        </Text>
                        <Ionicons
                          name="open-outline"
                          size={15}
                          color={colors.primary}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={() =>
                      Linking.openURL(
                        "mailto:info@ijrhservices.co.uk?subject=Tipsy%20Tourist%20support",
                      )
                    }
                    style={[
                      styles.infoContact,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Ionicons name="mail-outline" size={20} color="#fff" />
                    <Text style={styles.infoContactText}>Contact support</Text>
                  </Pressable>
                  <Text style={[styles.infoFinePrint, { color: colors.muted }]}>
                    Google Maps information may change. Check venue details and
                    local conditions.
                  </Text>
                </ScrollView>
              </Animated.View>
            </SafeAreaView>
          </View>
        </Modal>

        <Modal
          visible={itineraryOpen}
          transparent
          animationType="none"
          onRequestClose={
            detailsFromItinerary ? closeItineraryPlace : closeItinerary
          }
        >
          <View style={[styles.modalOverlay, styles.bottomModalOverlay]}>
            <Pressable style={styles.modalDismiss} onPress={closeItinerary} />
            <SafeAreaView
              edges={["left", "right"]}
              style={[styles.modalSafe, styles.bottomModalSafe]}
            >
              <Animated.View
                style={[
                  styles.modalPanel,
                  styles.bottomModalPanel,
                  styles.itineraryPanel,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    paddingBottom: safeAreaInsets.bottom,
                    transform: [{ translateY: itineraryTranslateY }],
                  },
                ]}
              >
                <View
                  style={styles.modalDragZone}
                  {...itineraryPanResponder.panHandlers}
                >
                  <View style={styles.modalHandle} />
                </View>
                {detailsFromItinerary && selectedPlace ? (
                  <Animated.View
                    style={[
                      styles.drawerPage,
                      { transform: [{ translateX: detailTranslateX }] },
                    ]}
                  >
                    <View style={styles.modalHeader}>
                      <View style={styles.drawerTitleRow}>
                        <Pressable
                          style={[
                            styles.backButton,
                            { backgroundColor: colors.surface },
                          ]}
                          onPress={closeItineraryPlace}
                        >
                          <Ionicons
                            name="arrow-back"
                            size={22}
                            color={colors.text}
                          />
                        </Pressable>
                        <View>
                          <Text
                            style={[styles.modalTitle, { color: colors.text }]}
                          >
                            Location details
                          </Text>
                          <Text
                            style={[
                              styles.modalSubtitle,
                              { color: colors.muted },
                            ]}
                          >
                            Stop{" "}
                            {(route?.stops.findIndex(
                              (item) =>
                                item.place_id === selectedPlace.place_id,
                            ) ?? 0) + 1}{" "}
                            of {route?.stops.length}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <ScrollView
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.locationContent}
                    >
                      <PlaceCard
                        place={selectedPlace}
                        index={
                          route?.stops.findIndex(
                            (item) => item.place_id === selectedPlace.place_id,
                          ) ?? 0
                        }
                        colors={colors}
                        updating={updatingStopId === selectedPlace.place_id}
                        onRegenerate={() => regenerateStop(selectedPlace)}
                        onRemove={() => removeStop(selectedPlace)}
                      />
                    </ScrollView>
                  </Animated.View>
                ) : (
                  <View style={styles.drawerPage}>
                    <View style={styles.modalHeader}>
                      <View>
                        <Text
                          style={[styles.modalTitle, { color: colors.text }]}
                        >
                          Your itinerary
                        </Text>
                        <Text
                          style={[
                            styles.modalSubtitle,
                            { color: colors.muted },
                          ]}
                        >
                          Hold a stop to reorder · tap for details
                        </Text>
                      </View>
                      <View style={styles.itineraryHeaderActions}>
                        <Pressable
                          accessibilityLabel="Add a stop"
                          disabled={!!updatingStopId}
                          onPress={chooseStopToAdd}
                          style={[
                            styles.shareButton,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          {updatingStopId === "__adding__" ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.primary}
                            />
                          ) : (
                            <Ionicons
                              name="add"
                              size={25}
                              color={colors.primary}
                            />
                          )}
                        </Pressable>
                        <Pressable
                          accessibilityLabel="Share itinerary as an image"
                          disabled={sharing}
                          onPress={shareItinerary}
                          style={[
                            styles.shareButton,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          {sharing ? (
                            <ActivityIndicator
                              size="small"
                              color={colors.primary}
                            />
                          ) : (
                            <Ionicons
                              name="share-outline"
                              size={22}
                              color={colors.primary}
                            />
                          )}
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.summaryChips}>
                      <SummaryChip
                        label={`${route?.stops.length ?? 0} STOPS`}
                        backgroundColor={colors.surface}
                        color={colors.text}
                      />
                      <SummaryChip
                        label={route?.distance.toUpperCase() ?? ""}
                        backgroundColor={colors.surface}
                        color={colors.text}
                      />
                      <SummaryChip
                        label={route?.duration.toUpperCase() ?? ""}
                        backgroundColor={colors.surface}
                        color={colors.text}
                      />
                      <SummaryChip
                        label={travelLabel.toUpperCase()}
                        backgroundColor={colors.primary}
                        color="#fff"
                      />
                    </View>
                    <ScrollView
                      style={styles.timelineScroll}
                      scrollEnabled={!isReordering}
                      removeClippedSubviews={false}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.timeline}
                    >
                      {route?.stops.map((place, index) => (
                        <ItineraryRow
                          key={place.place_id}
                          place={place}
                          index={index}
                          total={route.stops.length}
                          isLast={index === route.stops.length - 1}
                          colors={colors}
                          onDrop={(from, to) => moveStop(from, to - from)}
                          onDragChange={setIsReordering}
                          onOpen={() => openItineraryPlace(place)}
                          updating={updatingStopId === place.place_id}
                          onRegenerate={() => regenerateStop(place)}
                          onRemove={() => removeStop(place)}
                          leg={route.legs[index]}
                        />
                      ))}
                      {route && route.legs.length > route.stops.length && (
                        <View
                          style={[
                            styles.finalLeg,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                          ]}
                        >
                          <MaterialCommunityIcons name="walk" size={17} color={colors.primary} />
                          <Text style={[styles.finalLegText, { color: colors.text }]}>
                            Final stop to finish · {route.legs[route.stops.length].duration} · {route.legs[route.stops.length].distance}
                          </Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
              </Animated.View>
            </SafeAreaView>
          </View>
        </Modal>
        {route && shareMapUri && (
          <View pointerEvents="none" style={styles.shareCaptureStage}>
            <ShareCard
              ref={shareCardRef}
              route={route}
              start={start}
              finish={plannerMode === "local" ? start : finish}
              travelLabel={travelLabel}
              mapUri={shareMapUri}
              onMapLoaded={() => shareImageLoadedRef.current?.()}
            />
          </View>
        )}
      </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  headerPill: { borderRadius: 999, paddingLeft: 9, paddingRight: 10 },
  filterButton: { borderRadius: 999 },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  sheetDismiss: { flex: 1 },
  plannerSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  dragZone: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 5,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
  },
  dragHint: { fontSize: 9, fontWeight: "600", marginTop: 2 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 10,
  },
  sheetEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  sheetTitle: { fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  sheetSubtitle: { fontSize: 13, marginTop: 2 },
  plannerContent: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 24 : 18,
    gap: 8,
  },
  plannerModeSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  plannerModeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  plannerModeText: { fontSize: 14, fontWeight: "700" },
  routeInputs: { gap: 6, position: "relative" },
  routeConnector: {
    position: "absolute",
    left: 25,
    top: 43,
    width: 2,
    height: 16,
    zIndex: -1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 3,
  },
  radiusCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 5,
  },
  radiusHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  radiusHelp: { fontSize: 11, marginTop: 2 },
  radiusValue: { fontSize: 17, fontWeight: "800" },
  radiusRangeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -5,
  },
  radiusRangeText: { fontSize: 11, fontWeight: "600" },
  sheetClear: {
    minHeight: 36,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sheetClearText: { fontSize: 14, fontWeight: "600" },
  stars: { flexDirection: "row", gap: 2 },
  ratingText: { fontSize: 15, fontWeight: "600" },
  bottomModalOverlay: {
    justifyContent: "flex-end",
    padding: 0,
    backgroundColor: "transparent",
  },
  bottomModalSafe: {
    flex: 0,
    width: "100%",
    height: "82%",
    maxHeight: "82%",
    justifyContent: "flex-end",
  },
  bottomModalPanel: {
    height: "100%",
    maxHeight: "100%",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomWidth: 0,
  },
  itineraryPanel: { height: "100%", maxHeight: "100%" },
  modalDragZone: { height: 46, alignItems: "center", justifyContent: "center" },
  drawerPage: { flex: 1, minHeight: 0, overflow: "hidden" },
  drawerTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDismiss: { flex: 1 },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginTop: 10,
  },
  modalSubtitle: { fontSize: 13, marginTop: 3 },
  timeline: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 },
  timelineScroll: { flex: 1, minHeight: 0, overflow: "hidden" },
  timelineRow: { flexDirection: "row", minHeight: 112 },
  timelineRail: { width: 42, alignItems: "center" },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  timelineNumber: { color: "#fff", fontSize: 13, fontWeight: "900" },
  timelineLine: { position: "absolute", top: 31, bottom: -1, width: 2 },
  itineraryCard: {
    flex: 1,
    minHeight: 92,
    marginBottom: 14,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  itineraryCopy: { flex: 1 },
  itineraryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  itineraryType: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  itineraryName: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  itineraryAddress: { fontSize: 12, marginTop: 3 },
  itineraryLeg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 5,
  },
  itineraryLegText: { fontSize: 11, fontWeight: "700" },
  finalLeg: {
    minHeight: 42,
    marginLeft: 42,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  finalLegText: { flex: 1, fontSize: 12, fontWeight: "700" },
  rowActions: { gap: 5 },
  rowAction: {
    width: 30,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stopActionBar: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  stopActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stopActionText: { fontSize: 12, fontWeight: "800" },
  draggingRow: { zIndex: 50 },
  itineraryCardDragging: {
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  locationContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  pinContainer: {
    width: 42,
    height: 50,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  pinShape: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    borderWidth: 2.5,
    borderColor: "#fff",
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 0,
  },
  pinLabel: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    zIndex: 2,
    elevation: 2,
  },
  overlayScroll: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 160 },
  topCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    gap: 9,
  },
  logoBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: { width: 41, height: 41 },
  brandTitle: { fontSize: 23, fontWeight: "500", letterSpacing: -0.5 },
  taglineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  tagline: { fontSize: 12.5 },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  plannerBody: { paddingTop: 18, gap: 11 },
  autocompleteWrap: { zIndex: 20 },
  locationRow: { flexDirection: "row", gap: 8 },
  locationInput: {
    flex: 1,
    borderWidth: 1,
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  pinButton: {
    width: 48,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 56,
    zIndex: 50,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 12,
  },
  suggestionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  suggestionText: { flex: 1, fontSize: 14 },
  divider: { height: 1, marginVertical: 5 },
  countersRow: { flexDirection: "row", gap: 7 },
  stopCounter: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    padding: 9,
    minHeight: 112,
  },
  counterHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  counterTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  maxLabel: { fontSize: 11, width: 34 },
  counterButtons: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  counterCircle: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  counterCircleFilled: { backgroundColor: BLUE, borderColor: BLUE },
  counterSymbol: { fontSize: 25, lineHeight: 27, fontWeight: "600" },
  counterValue: {
    minWidth: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  counterNumber: { fontSize: 20, fontWeight: "700" },
  primaryButton: {
    minHeight: 50,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#2563eb",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  primaryButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  warning: {
    backgroundColor: "#ffedc9",
    padding: 13,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  warningText: { color: "#713812", fontSize: 14, flex: 1 },
  routeMode: { textAlign: "center", fontSize: 13, marginVertical: 2 },
  clearButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: { fontSize: 16, fontWeight: "600" },
  actionDock: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 36,
    padding: 5,
    flexDirection: "row",
    gap: 3,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  dockButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  mapLegLabel: {
    minHeight: 24,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    shadowColor: "#000",
    shadowOpacity: 0.11,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapLegText: { fontSize: 9, fontWeight: "800" },
  endpointMarker: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  endpointText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  numberMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  numberMarkerText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(3,8,20,0.66)",
    padding: 12,
    justifyContent: "center",
  },
  modalSafe: { flex: 1, justifyContent: "center" },
  modalPanel: {
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  modalHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  modalTitle: { fontSize: 25, fontWeight: "700", letterSpacing: -0.4 },
  iconClose: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDivider: { height: 1 },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
  },
  summaryChip: {
    overflow: "hidden",
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryChipText: {
    includeFontPadding: false,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  modalFooter: {
    minHeight: 74,
    borderTopWidth: 1,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  closeButton: {
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  closeButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  placeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  placeHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  stopBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBadgeText: { color: "#fff", fontWeight: "800" },
  placeName: { flex: 1, fontSize: 21, fontWeight: "700", letterSpacing: -0.3 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  moveButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginVertical: 11,
  },
  moveButton: {
    backgroundColor: BLUE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  moveText: { color: "#fff", fontWeight: "600" },
  placeImage: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    marginVertical: 12,
  },
  detailRows: { gap: 14, marginTop: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  detailText: { flex: 1, fontSize: 16, lineHeight: 22 },
  detailLink: { flex: 1, fontSize: 16, lineHeight: 22 },
  detailDisclosure: {
    minHeight: 38,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  detailDisclosureText: { fontSize: 13, fontWeight: "800" },
  detailInset: { borderRadius: 16, padding: 12, gap: 5 },
  detailInsetText: { fontSize: 12, lineHeight: 17 },
  detailDescription: { fontSize: 14, lineHeight: 20 },
  mapActionRow: { flexDirection: "row", gap: 8 },
  mapAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapActionText: { fontSize: 12, fontWeight: "800" },
  reviewCard: { borderRadius: 16, padding: 12, gap: 6 },
  reviewHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reviewAuthor: { flex: 1, fontSize: 13, fontWeight: "800" },
  reviewMeta: { fontSize: 11 },
  reviewText: { fontSize: 12, lineHeight: 17 },
  shareButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  itineraryHeaderActions: { flexDirection: "row", gap: 8 },
  shareCaptureStage: {
    position: "absolute",
    left: -2000,
    top: 0,
    width: 390,
  },
  shareCard: {
    width: 390,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  shareBrandRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  shareLogo: { width: 78, height: 78 },
  shareStrapline: { color: "#64748b", fontSize: 12, marginTop: 1 },
  shareStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 16,
    marginBottom: 12,
  },
  shareStat: {
    color: "#0f172a",
    backgroundColor: "#eff4fa",
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "800",
  },
  shareMode: { color: "#ffffff", backgroundColor: BLUE },
  shareMapFrame: {
    width: "100%",
    height: 194,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
  shareMap: { width: "100%", height: "100%" },
  shareMapPin: {
    position: "absolute",
    width: 26,
    height: 31,
    marginLeft: -13,
    marginTop: -27,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  shareMapPinShape: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderBottomRightRadius: 3,
    borderWidth: 1.5,
    borderColor: "#ffffff",
    transform: [{ rotate: "45deg" }],
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  shareMapPinLabel: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
  },
  shareEndpoints: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },
  shareEndpointDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareEndpointLetter: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  shareEndpointLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  shareEndpointText: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  shareStopGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shareStop: {
    width: "48.8%",
    minHeight: 62,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  shareStopNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  shareStopNumberText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  shareStopName: { color: "#0f172a", fontSize: 11, fontWeight: "800" },
  shareStopType: { fontSize: 8, fontWeight: "900", marginTop: 2 },
  shareStopAddress: { color: "#64748b", fontSize: 8, marginTop: 2 },
  shareFooter: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 4,
  },
  infoContent: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    gap: 10,
  },
  infoBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLogo: { width: 48, height: 48 },
  infoVersion: { fontSize: 11 },
  infoIntro: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
  infoNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderWidth: 1,
    borderRadius: 18,
    padding: 11,
  },
  infoNoticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  infoLinks: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  infoLink: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
  },
  infoLinkText: { flex: 1, fontSize: 13, fontWeight: "700" },
  infoSectionCopy: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 13,
    paddingLeft: 43,
    paddingBottom: 12,
  },
  infoPolicyLinks: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  infoPolicyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 5,
  },
  infoPolicyText: { fontSize: 12, fontWeight: "800" },
  infoContact: {
    minHeight: 46,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  infoContactText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  infoFinePrint: { fontSize: 10.5, lineHeight: 14, textAlign: "center" },
});
