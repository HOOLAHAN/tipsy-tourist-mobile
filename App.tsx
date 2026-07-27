import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import {
  getPlaceDetails,
  getPlacePhotoUrl,
  getPlaceSuggestions,
  planRoute,
  routeThroughStops,
} from "./src/api";
import { ThemeName, themes } from "./src/theme";
import {
  Place,
  PlaceDetails,
  PlaceSuggestion,
  RoutePlan,
  TravelMode,
} from "./src/types";

const LONDON: Region = {
  latitude: 51.5033,
  longitude: -0.1196,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};
const BLUE = "#4285f4";
const modes: {
  value: TravelMode;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { value: "driving", label: "Car", icon: "car" },
  { value: "bicycling", label: "Bike", icon: "bike" },
  { value: "walking", label: "Walk", icon: "walk" },
];

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
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const hours = details.opening_hours?.weekday_text?.[today];
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
}: {
  place: Place;
  index: number;
  colors: (typeof themes)[ThemeName];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (amount: number) => void;
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
      {!details ? (
        <ActivityIndicator style={{ margin: 30 }} color={BLUE} />
      ) : (
        <>
          {photo && (
            <Image
              source={{ uri: photo }}
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
}: {
  place: Place;
  index: number;
  total: number;
  isLast: boolean;
  colors: (typeof themes)[ThemeName];
  onOpen: () => void;
  onDrop: (from: number, to: number) => void;
  onDragChange: (dragging: boolean) => void;
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
        </View>
        <MaterialCommunityIcons
          name={dragging ? "drag-vertical" : "gesture-tap-hold"}
          size={22}
          color={dragging ? colors.primary : colors.muted}
        />
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  const mapRef = useRef<MapView>(null);
  const [themeName, setThemeName] = useState<ThemeName>("light");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsFromItinerary, setDetailsFromItinerary] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [pubs, setPubs] = useState(1);
  const [attractions, setAttractions] = useState(1);
  const [mode, setMode] = useState<TravelMode>("walking");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const colors = themes[themeName];
  const plannerTranslateY = useRef(new Animated.Value(0)).current;
  const itineraryTranslateY = useRef(new Animated.Value(0)).current;
  const detailTranslateX = useRef(new Animated.Value(420)).current;

  const dismissPlanner = () =>
    Animated.timing(plannerTranslateY, {
      toValue: 700,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setPlannerOpen(false);
      plannerTranslateY.setValue(0);
    });
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

  const closeItinerary = () =>
    Animated.timing(itineraryTranslateY, {
      toValue: 800,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setItineraryOpen(false);
      setDetailsFromItinerary(false);
      setSelectedPlace(null);
      itineraryTranslateY.setValue(0);
      detailTranslateX.setValue(420);
    });
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

  const openItineraryPlace = (place: Place) => {
    Haptics.selectionAsync();
    setSelectedPlace(place);
    setDetailsFromItinerary(true);
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
    if (!start.trim() || !finish.trim())
      return Alert.alert(
        "Choose both locations",
        "Choose both a start and finish location.",
      );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const next = await planRoute(start, finish, pubs, attractions, mode);
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
    setStart("");
    setFinish("");
    setPlannerOpen(true);
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
  const travelLabel = mode === "bicycling" ? "cycling" : mode;

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
              coordinates={route.coordinates}
              strokeColor={colors.primary}
              strokeWidth={6}
            />
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
                onPress={() => setPlannerOpen(true)}
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
            accessibilityLabel="Clear route"
            onPress={clear}
            style={[styles.dockButton, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="close" size={27} color={colors.text} />
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
          {route && (
            <Pressable
              accessibilityLabel="View itinerary"
              onPress={() => setItineraryOpen(true)}
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
        animationType="slide"
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
            <View style={styles.dragZone} {...plannerPanResponder.panHandlers}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.dragHint, { color: colors.muted }]}>
                Swipe down to close
              </Text>
            </View>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetEyebrow, { color: colors.primary }]}>
                  BUILD A ROUTE
                </Text>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>
                  Where are we going?
                </Text>
                <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>
                  Choose your route and we’ll find the stops.
                </Text>
              </View>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.plannerContent}
            >
              <View style={styles.routeInputs}>
                <AutocompleteInput
                  value={start}
                  onChange={setStart}
                  placeholder="Start location"
                  onLocate={() => locateMe("start")}
                  colors={colors}
                />
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
              </View>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                TRAVEL MODE
              </Text>
              <View
                style={[
                  styles.modeRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {modes.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => setMode(item.value)}
                    style={[
                      styles.modeButton,
                      mode === item.value && {
                        backgroundColor: colors.primary,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={20}
                      color={mode === item.value ? "#fff" : colors.muted}
                    />
                    <Text
                      style={[
                        styles.modeLabel,
                        { color: mode === item.value ? "#fff" : colors.text },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                STOPS ALONG THE WAY
              </Text>
              <View style={styles.countersRow}>
                <StopCounter
                  label="Pubs"
                  max={7}
                  value={pubs}
                  icon="glass-cocktail"
                  onChange={setPubs}
                  colors={colors}
                />
                <StopCounter
                  label="Sights"
                  max={3}
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
                      {route ? "Update my route" : "Plan my Tipsy Tour"}
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
        visible={itineraryOpen}
        transparent
        animationType="slide"
        onRequestClose={
          detailsFromItinerary ? closeItineraryPlace : closeItinerary
        }
      >
        <View style={[styles.modalOverlay, styles.bottomModalOverlay]}>
          <Pressable style={styles.modalDismiss} onPress={closeItinerary} />
          <SafeAreaView style={[styles.modalSafe, styles.bottomModalSafe]}>
            <Animated.View
              style={[
                styles.modalPanel,
                styles.bottomModalPanel,
                styles.itineraryPanel,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
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
                            (item) => item.place_id === selectedPlace.place_id,
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
                    />
                  </ScrollView>
                </Animated.View>
              ) : (
                <View style={styles.drawerPage}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={[styles.modalTitle, { color: colors.text }]}>
                        Your itinerary
                      </Text>
                      <Text
                        style={[styles.modalSubtitle, { color: colors.muted }]}
                      >
                        Hold a stop to reorder · tap for details
                      </Text>
                    </View>
                  </View>
                  <View style={styles.summaryChips}>
                    <Text
                      style={[
                        styles.summaryChip,
                        { backgroundColor: colors.surface, color: colors.text },
                      ]}
                    >
                      {route?.stops.length ?? 0} STOPS
                    </Text>
                    <Text
                      style={[
                        styles.summaryChip,
                        { backgroundColor: colors.surface, color: colors.text },
                      ]}
                    >
                      {route?.distance.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.summaryChip,
                        { backgroundColor: colors.surface, color: colors.text },
                      ]}
                    >
                      {route?.duration.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.summaryChip,
                        { backgroundColor: colors.primary, color: "#fff" },
                      ]}
                    >
                      {travelLabel.toUpperCase()}
                    </Text>
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
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
            </Animated.View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
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
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 7,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
  },
  dragHint: { fontSize: 10, fontWeight: "600", marginTop: 4 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  sheetEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  sheetTitle: { fontSize: 26, fontWeight: "800", letterSpacing: -0.6 },
  sheetSubtitle: { fontSize: 14, marginTop: 4 },
  plannerContent: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    gap: 12,
  },
  routeInputs: { gap: 8, position: "relative" },
  routeConnector: {
    position: "absolute",
    left: 25,
    top: 48,
    width: 2,
    height: 18,
    zIndex: -1,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 5,
  },
  sheetClear: {
    minHeight: 42,
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
    marginBottom: Platform.OS === "ios" ? -34 : 0,
    paddingBottom: Platform.OS === "ios" ? 34 : 0,
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
  timeline: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 30 },
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
  rowActions: { gap: 5 },
  rowAction: {
    width: 30,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
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
    elevation: 5,
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
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  pinButton: {
    width: 52,
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestions: {
    position: "absolute",
    top: 58,
    left: 0,
    right: 60,
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
  modeRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 45,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderRadius: 11,
  },
  modeButtonSelected: { backgroundColor: BLUE },
  modeLabel: { fontSize: 16, fontWeight: "600" },
  countersRow: { flexDirection: "row", gap: 9 },
  stopCounter: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
    minHeight: 136,
  },
  counterHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  counterTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  maxLabel: { fontSize: 11, width: 34 },
  counterButtons: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  counterCircle: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  counterCircleFilled: { backgroundColor: BLUE, borderColor: BLUE },
  counterSymbol: { fontSize: 25, lineHeight: 27, fontWeight: "600" },
  counterValue: {
    minWidth: 46,
    height: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  counterNumber: { fontSize: 20, fontWeight: "700" },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
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
  primaryButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  warning: {
    backgroundColor: "#ffedc9",
    padding: 13,
    borderRadius: 14,
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
    padding: 7,
    flexDirection: "row",
    gap: 7,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  dockButton: {
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
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
    gap: 7,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  summaryChip: {
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    fontSize: 12,
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
});
