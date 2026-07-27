import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { getPlaceDetails, getPlacePhotoUrl, getPlaceSuggestions, planRoute } from './src/api';
import { ThemeName, themes } from './src/theme';
import { Place, PlaceDetails, PlaceSuggestion, RoutePlan, TravelMode } from './src/types';

const LONDON: Region = { latitude: 51.5033, longitude: -0.1196, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const BLUE = '#4285f4';
const modes: { value: TravelMode; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { value: 'driving', label: 'Car', icon: 'car' }, { value: 'bicycling', label: 'Bike', icon: 'bike' }, { value: 'walking', label: 'Walk', icon: 'walk' },
];

function RainbowTitle() {
  const colors = ['#ea4335', '#fbbc05', '#4285f4', '#34a853'];
  return <Text style={styles.brandTitle}>{'Tipsy Tourist'.split('').map((letter, index) => <Text key={index} style={{ color: letter === ' ' ? undefined : colors[index % colors.length] }}>{letter}</Text>)}</Text>;
}

function AutocompleteInput({ value, onChange, placeholder, onLocate, colors }: { value: string; onChange: (value: string) => void; placeholder: string; onLocate: () => void; colors: (typeof themes)[ThemeName] }) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => getPlaceSuggestions(value).then(setSuggestions).catch(() => setSuggestions([])), 300);
    return () => clearTimeout(timer);
  }, [value]);
  return <View style={styles.autocompleteWrap}>
    <View style={styles.locationRow}>
      <TextInput value={value} onChangeText={(next) => { onChange(next); setFocused(true); }} onFocus={() => setFocused(true)} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.locationInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} />
      <Pressable accessibilityLabel={`Choose ${placeholder} on map`} onPress={onLocate} style={[styles.pinButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="location" size={22} color={colors.primary} /></Pressable>
    </View>
    {focused && suggestions.length > 0 && <View style={[styles.suggestions, { backgroundColor: colors.card, borderColor: colors.border }]}>{suggestions.slice(0, 5).map((item) => <Pressable key={item.place_id} onPress={() => { onChange(item.description); setSuggestions([]); setFocused(false); }} style={[styles.suggestionRow, { borderBottomColor: colors.border }]}><Ionicons name="location-sharp" size={20} color={colors.muted} /><Text numberOfLines={1} style={[styles.suggestionText, { color: colors.text }]}><Text style={{ fontWeight: '800' }}>{item.main_text}</Text>{item.secondary_text ? ` ${item.secondary_text}` : ''}</Text></Pressable>)}</View>}
  </View>;
}

function StopCounter({ label, max, value, icon, onChange, colors }: { label: string; max: number; value: number; icon: keyof typeof MaterialCommunityIcons.glyphMap; onChange: (value: number) => void; colors: (typeof themes)[ThemeName] }) {
  return <View style={[styles.stopCounter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.counterHeading}><MaterialCommunityIcons name={icon} size={22} color={colors.primary} /><Text style={[styles.counterTitle, { color: colors.text }]}>{label}</Text><Text style={[styles.maxLabel, { color: colors.muted }]}>Max {max}</Text></View>
    <View style={styles.counterButtons}><Pressable disabled={value <= 1} onPress={() => onChange(Math.max(1, value - 1))} style={[styles.counterCircle, { borderColor: colors.border, backgroundColor: colors.card, opacity: value <= 1 ? 0.35 : 1 }]}><Text style={[styles.counterSymbol, { color: colors.primary }]}>−</Text></Pressable><View style={[styles.counterValue, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.counterNumber, { color: colors.text }]}>{value}</Text></View><Pressable disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.counterCircle, styles.counterCircleFilled, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: value >= max ? 0.35 : 1 }]}><Text style={[styles.counterSymbol, { color: '#fff' }]}>+</Text></Pressable></View>
  </View>;
}

function DetailRows({ details, colors }: { details: PlaceDetails; colors: (typeof themes)[ThemeName] }) {
  const today = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const hours = details.opening_hours?.weekday_text?.[today];
  return <View style={styles.detailRows}>
    <View style={styles.detailRow}><Ionicons name="home" size={23} color={colors.text} /><Text style={[styles.detailText, { color: colors.text }]}>{details.formatted_address ?? details.vicinity ?? 'Address unavailable'}</Text></View>
    {details.formatted_phone_number && <Pressable style={styles.detailRow} onPress={() => Linking.openURL(`tel:${details.formatted_phone_number}`)}><Ionicons name="call" size={23} color={colors.text} /><Text style={[styles.detailText, { color: colors.text }]}>{details.formatted_phone_number}</Text></Pressable>}
    {details.website && <Pressable style={styles.detailRow} onPress={() => Linking.openURL(details.website!)}><Ionicons name="link" size={23} color={colors.text} /><Text style={[styles.detailLink, { color: '#58aff0' }]} numberOfLines={1}>{details.name} – website</Text></Pressable>}
    <View style={styles.detailRow}><Ionicons name="star" size={24} color="#f4c430" /><Text style={[styles.detailText, { color: colors.text }]}>{details.rating ? `${'★'.repeat(Math.round(details.rating))}${'☆'.repeat(5 - Math.round(details.rating))}  (${details.rating})` : 'No rating available'}</Text></View>
    <View style={styles.detailRow}><Ionicons name="calendar" size={23} color={colors.text} /><Text style={[styles.detailText, !hours && { fontStyle: 'italic', color: colors.muted }, { color: hours ? colors.text : colors.muted }]}>{hours ? (details.opening_hours?.open_now ? `Open – ${hours.split('–')[1]?.trim() ? `Closes at ${hours.split('–')[1].trim()}` : hours}` : 'Closed') : 'No opening hours info'}</Text></View>
  </View>;
}

function PlaceCard({ place, index, colors, canMoveUp, canMoveDown, onMove }: { place: Place; index: number; colors: (typeof themes)[ThemeName]; canMoveUp?: boolean; canMoveDown?: boolean; onMove?: (amount: number) => void }) {
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  useEffect(() => { getPlaceDetails(place.place_id).then(setDetails).catch(() => setDetails({ name: place.name, vicinity: place.vicinity })); }, [place.place_id]);
  const photo = getPlacePhotoUrl(details);
  return <View style={[styles.placeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.placeHeading}><View style={styles.stopBadge}><Text style={styles.stopBadgeText}>{index + 1}</Text></View><Text style={[styles.placeName, { color: colors.text }]} numberOfLines={2}>{details?.name ?? place.name}</Text><View style={[styles.typeBadge, { backgroundColor: place.stopType === 'pub' ? '#ffd9db' : '#e9d5ff' }]}><Text style={{ color: place.stopType === 'pub' ? '#9f3034' : '#6b21a8', fontWeight: '700' }}>{place.stopType.toUpperCase()}</Text></View></View>
    {onMove && <View style={styles.moveButtons}><Pressable disabled={!canMoveUp} onPress={() => onMove(-1)} style={[styles.moveButton, { opacity: canMoveUp ? 1 : 0.35 }]}><Ionicons name="chevron-up" size={18} color="#fff" /><Text style={styles.moveText}>Earlier</Text></Pressable><Pressable disabled={!canMoveDown} onPress={() => onMove(1)} style={[styles.moveButton, { opacity: canMoveDown ? 1 : 0.35 }]}><Ionicons name="chevron-down" size={18} color="#fff" /><Text style={styles.moveText}>Later</Text></Pressable></View>}
    {!details ? <ActivityIndicator style={{ margin: 30 }} color={BLUE} /> : <>{photo && <Image source={{ uri: photo }} style={styles.placeImage} resizeMode="cover" />}<DetailRows details={details} colors={colors} /></>}
  </View>;
}

export default function App() {
  const mapRef = useRef<MapView>(null);
  const [themeName, setThemeName] = useState<ThemeName>('light');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [start, setStart] = useState(''); const [finish, setFinish] = useState('');
  const [pubs, setPubs] = useState(1); const [attractions, setAttractions] = useState(1);
  const [mode, setMode] = useState<TravelMode>('walking'); const [route, setRoute] = useState<RoutePlan | null>(null); const [loading, setLoading] = useState(false);
  const colors = themes[themeName];

  useEffect(() => { AsyncStorage.getItem('tipsy-theme').then((value) => setThemeName(value === 'dark' ? 'dark' : 'light')); }, []);
  useEffect(() => { AsyncStorage.setItem('tipsy-theme', themeName); }, [themeName]);

  const locateMe = async (target: 'start' | 'finish' | 'map' = 'map') => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location permission needed', 'Enable location access to use your current position.');
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coordinate = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 });
    if (target !== 'map') (target === 'start' ? setStart : setFinish)(`${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`);
  };
  const submit = async () => {
    if (!start.trim() || !finish.trim()) return Alert.alert('Choose both locations', 'Choose both a start and finish location.');
    setLoading(true);
    try { const next = await planRoute(start, finish, pubs, attractions, mode); setRoute(next); setPlannerOpen(false); requestAnimationFrame(() => mapRef.current?.fitToCoordinates(next.coordinates, { edgePadding: { top: 170, right: 50, bottom: 130, left: 50 }, animated: true })); }
    catch (error) { Alert.alert('Could not plan route', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  };
  const clear = () => { setRoute(null); setStart(''); setFinish(''); setPlannerOpen(true); };
  const toggleTheme = () => setThemeName((current) => current === 'light' ? 'dark' : 'light');
  const moveStop = (index: number, amount: number) => setRoute((current) => { if (!current || index + amount < 0 || index + amount >= current.stops.length) return current; const stops = [...current.stops]; const [item] = stops.splice(index, 1); stops.splice(index + amount, 0, item); return { ...current, stops }; });
  const travelLabel = mode === 'bicycling' ? 'cycling' : mode;

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={themeName === 'light' ? 'dark' : 'light'} />
    <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={LONDON} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} customMapStyle={colors.map as any} showsUserLocation showsMyLocationButton={false}>
      {route && <><Polyline coordinates={route.coordinates} strokeColor={BLUE} strokeWidth={6} /><Marker coordinate={route.origin} title="Start"><View style={[styles.endpointMarker, { backgroundColor: '#2563eb' }]}><Text style={styles.endpointText}>Start</Text></View></Marker>{route.stops.map((place, index) => <Marker key={place.place_id} coordinate={{ latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }} onPress={() => setSelectedPlace(place)}><View style={[styles.numberMarker, { backgroundColor: place.stopType === 'pub' ? '#dc2626' : '#7c3aed' }]}><Text style={styles.numberMarkerText}>{index + 1}</Text></View></Marker>)}<Marker coordinate={route.destination} title="Finish"><View style={[styles.endpointMarker, { backgroundColor: '#16a34a' }]}><Text style={styles.endpointText}>Finish</Text></View></Marker></>}
    </MapView>

    <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView pointerEvents="box-none" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.overlayScroll}>
          <View style={[styles.topCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <View style={styles.headerRow}><View style={[styles.logoBox, { backgroundColor: colors.surface }]}><Image source={require('./assets/tipsy-logo.png')} style={styles.brandLogo} resizeMode="contain" /></View><View style={{ flex: 1 }}><RainbowTitle /><View style={styles.taglineRow}><MaterialCommunityIcons name="map-marker-path" size={21} color={colors.muted} /><Text style={[styles.tagline, { color: colors.muted }]}>{route ? `${route.distance} · ${route.duration} · ${travelLabel}` : 'Plan a pub-and-sights route'}</Text></View></View><Pressable accessibilityLabel="Toggle planner" onPress={() => setPlannerOpen((open) => !open)} style={[styles.menuButton, { backgroundColor: plannerOpen ? colors.surface : 'transparent' }]}><Ionicons name={plannerOpen ? 'close' : 'menu'} size={28} color={colors.primary} /></Pressable></View>
            {plannerOpen && <View style={styles.plannerBody}>
              <AutocompleteInput value={start} onChange={setStart} placeholder="Start location" onLocate={() => locateMe('start')} colors={colors} />
              <AutocompleteInput value={finish} onChange={setFinish} placeholder="Finish location" onLocate={() => locateMe('finish')} colors={colors} />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={[styles.modeRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>{modes.map((item) => <Pressable key={item.value} onPress={() => setMode(item.value)} style={[styles.modeButton, { borderColor: colors.border }, mode === item.value && { backgroundColor: colors.primary }]}><MaterialCommunityIcons name={item.icon} size={20} color={mode === item.value ? '#fff' : colors.muted} /><Text style={[styles.modeLabel, { color: mode === item.value ? '#fff' : colors.text }]}>{item.label}</Text></Pressable>)}</View>
              <View style={styles.countersRow}><StopCounter label="Pubs" max={7} value={pubs} icon="glass-cocktail" onChange={setPubs} colors={colors} /><StopCounter label="Attractions" max={3} value={attractions} icon="camera" onChange={setAttractions} colors={colors} /></View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable disabled={loading} onPress={submit} style={[styles.primaryButton, { backgroundColor: colors.primary }, loading && { opacity: 0.65 }]}>{loading ? <ActivityIndicator color="#fff" /> : <><MaterialCommunityIcons name="glass-mug-variant" size={22} color="#fff" /><Text style={styles.primaryButtonText}>Plan my Tipsy Tour</Text></>}</Pressable>
              {!start || !finish ? <View style={styles.warning}><Ionicons name="alert-circle" size={25} color="#c75015" /><Text style={styles.warningText}>Choose both a start and finish location.</Text></View> : null}
              <Text style={[styles.routeMode, { color: colors.muted }]}>Route mode: {travelLabel}</Text>
              <Pressable onPress={clear} style={[styles.clearButton, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[styles.clearText, { color: colors.primary }]}>Clear route</Text></Pressable>
            </View>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.actionDock, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}><Pressable accessibilityLabel="Centre map on me" onPress={() => locateMe()} style={[styles.dockButton, { backgroundColor: colors.primary }]}><Ionicons name="navigate" size={24} color="#fff" /></Pressable><Pressable accessibilityLabel="Clear route" onPress={clear} style={[styles.dockButton, { backgroundColor: colors.surface }]}><Ionicons name="close" size={27} color={colors.text} /></Pressable><Pressable accessibilityLabel={`Use ${themeName === 'light' ? 'dark' : 'light'} mode`} onPress={toggleTheme} style={[styles.dockButton, { backgroundColor: colors.surface }]}><Ionicons name={themeName === 'light' ? 'moon' : 'sunny'} size={23} color={themeName === 'light' ? '#475569' : '#fbbf24'} /></Pressable>{route && <Pressable accessibilityLabel="View itinerary" onPress={() => setItineraryOpen(true)} style={[styles.dockButton, { backgroundColor: colors.surface }]}><Ionicons name="list" size={26} color={colors.text} /></Pressable>}</View>
    </SafeAreaView>

    <Modal visible={itineraryOpen} transparent animationType="fade" onRequestClose={() => setItineraryOpen(false)}><View style={styles.modalOverlay}><SafeAreaView style={styles.modalSafe}><View style={[styles.modalPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.text }]}>Your itinerary</Text><Pressable style={[styles.iconClose, { backgroundColor: colors.surface }]} onPress={() => setItineraryOpen(false)}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View><View style={[styles.modalDivider, { backgroundColor: colors.border }]} /><View style={styles.summaryChips}><Text style={[styles.summaryChip, { backgroundColor: colors.surface, color: colors.text }]}>{route?.stops.length ?? 0} STOPS</Text><Text style={[styles.summaryChip, { backgroundColor: colors.surface, color: colors.text }]}>{route?.distance.toUpperCase()}</Text><Text style={[styles.summaryChip, { backgroundColor: colors.surface, color: colors.text }]}>{route?.duration.toUpperCase()}</Text><Text style={[styles.summaryChip, { backgroundColor: colors.primary, color: '#fff' }]}>{travelLabel.toUpperCase()}</Text></View><ScrollView contentContainerStyle={{ padding: 16 }}>{route?.stops.map((place, index) => <PlaceCard key={place.place_id} place={place} index={index} colors={colors} canMoveUp={index > 0} canMoveDown={index < route.stops.length - 1} onMove={(amount) => moveStop(index, amount)} />)}</ScrollView><View style={[styles.modalFooter, { borderColor: colors.border }]}><Pressable onPress={() => setItineraryOpen(false)} style={[styles.closeButton, { backgroundColor: colors.primary }]}><Text style={styles.closeButtonText}>Done</Text></Pressable></View></View></SafeAreaView></View></Modal>
    <Modal visible={Boolean(selectedPlace)} transparent animationType="fade" onRequestClose={() => setSelectedPlace(null)}><View style={styles.modalOverlay}><SafeAreaView style={styles.modalSafe}><View style={[styles.modalPanel, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.text }]}>Location details</Text><Pressable style={[styles.iconClose, { backgroundColor: colors.surface }]} onPress={() => setSelectedPlace(null)}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View><View style={[styles.modalDivider, { backgroundColor: colors.border }]} /><ScrollView contentContainerStyle={{ padding: 16 }}>{selectedPlace && <PlaceCard place={selectedPlace} index={route?.stops.findIndex((item) => item.place_id === selectedPlace.place_id) ?? 0} colors={colors} />}</ScrollView><View style={[styles.modalFooter, { borderColor: colors.border }]}><Pressable onPress={() => setSelectedPlace(null)} style={[styles.closeButton, { backgroundColor: colors.primary }]}><Text style={styles.closeButtonText}>Done</Text></Pressable></View></View></SafeAreaView></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  overlayScroll: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 160 }, topCard: { borderWidth: 1, borderRadius: 24, padding: 14, shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 9 }, headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 70, gap: 11 }, logoBox: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, brandLogo: { width: 50, height: 50 }, brandTitle: { fontSize: 27, fontWeight: '500', letterSpacing: -0.6 }, taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, tagline: { fontSize: 14 }, menuButton: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, plannerBody: { paddingTop: 18, gap: 11 }, autocompleteWrap: { zIndex: 20 }, locationRow: { flexDirection: 'row', gap: 8 }, locationInput: { flex: 1, borderWidth: 1, minHeight: 54, borderRadius: 14, paddingHorizontal: 16, fontSize: 17 }, pinButton: { width: 52, minHeight: 54, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, suggestions: { position: 'absolute', top: 58, left: 0, right: 60, zIndex: 50, borderWidth: 1, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, elevation: 12 }, suggestionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1 }, suggestionText: { flex: 1, fontSize: 14 }, divider: { height: 1, marginVertical: 5 }, modeRow: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 }, modeButton: { flex: 1, minHeight: 45, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 0, borderRadius: 11 }, modeButtonSelected: { backgroundColor: BLUE }, modeLabel: { fontSize: 16, fontWeight: '600' }, countersRow: { flexDirection: 'row', gap: 9 }, stopCounter: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 11, minHeight: 136 }, counterHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, counterTitle: { fontSize: 16, fontWeight: '700', flex: 1 }, maxLabel: { fontSize: 11, width: 34 }, counterButtons: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }, counterCircle: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, counterCircleFilled: { backgroundColor: BLUE, borderColor: BLUE }, counterSymbol: { fontSize: 25, lineHeight: 27, fontWeight: '600' }, counterValue: { minWidth: 46, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, counterNumber: { fontSize: 20, fontWeight: '700' }, primaryButton: { minHeight: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#2563eb', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 }, primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' }, warning: { backgroundColor: '#ffedc9', padding: 13, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }, warningText: { color: '#713812', fontSize: 14, flex: 1 }, routeMode: { textAlign: 'center', fontSize: 13, marginVertical: 2 }, clearButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, clearText: { fontSize: 16, fontWeight: '600' }, actionDock: { position: 'absolute', bottom: 18, alignSelf: 'center', borderWidth: 1, borderRadius: 36, padding: 7, flexDirection: 'row', gap: 7, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 9 }, dockButton: { width: 49, height: 49, borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, endpointMarker: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, endpointText: { color: '#fff', fontWeight: '800', fontSize: 12 }, numberMarker: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, numberMarkerText: { color: '#fff', fontSize: 17, fontWeight: '800' }, modalOverlay: { flex: 1, backgroundColor: 'rgba(3,8,20,0.66)', padding: 12, justifyContent: 'center' }, modalSafe: { flex: 1, justifyContent: 'center' }, modalPanel: { maxHeight: '90%', borderRadius: 24, borderWidth: 1, overflow: 'hidden' }, modalHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, modalTitle: { fontSize: 25, fontWeight: '700', letterSpacing: -0.4 }, iconClose: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, modalDivider: { height: 1 }, summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 18, paddingTop: 14 }, summaryChip: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, fontSize: 12, fontWeight: '700' }, modalFooter: { minHeight: 74, borderTopWidth: 1, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 20 }, closeButton: { borderRadius: 13, paddingHorizontal: 24, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }, closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }, placeCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 }, placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, stopBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }, stopBadgeText: { color: '#fff', fontWeight: '800' }, placeName: { flex: 1, fontSize: 21, fontWeight: '700', letterSpacing: -0.3 }, typeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }, moveButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginVertical: 11 }, moveButton: { backgroundColor: BLUE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 4 }, moveText: { color: '#fff', fontWeight: '600' }, placeImage: { width: '100%', height: 190, borderRadius: 14, marginVertical: 12 }, detailRows: { gap: 14, marginTop: 8 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, detailText: { flex: 1, fontSize: 16, lineHeight: 22 }, detailLink: { flex: 1, fontSize: 16, lineHeight: 22 },
});
