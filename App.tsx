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
      <TextInput value={value} onChangeText={(next) => { onChange(next); setFocused(true); }} onFocus={() => setFocused(true)} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.locationInput, { color: colors.text, backgroundColor: colors.card }]} />
      <Pressable accessibilityLabel={`Choose ${placeholder} on map`} onPress={onLocate} style={styles.pinButton}><Ionicons name="location" size={22} color={BLUE} /></Pressable>
    </View>
    {focused && suggestions.length > 0 && <View style={[styles.suggestions, { backgroundColor: colors.card }]}>{suggestions.slice(0, 5).map((item) => <Pressable key={item.place_id} onPress={() => { onChange(item.description); setSuggestions([]); setFocused(false); }} style={styles.suggestionRow}><Ionicons name="location-sharp" size={20} color="#a0a7b3" /><Text numberOfLines={1} style={[styles.suggestionText, { color: colors.text }]}><Text style={{ fontWeight: '800' }}>{item.main_text}</Text>{item.secondary_text ? ` ${item.secondary_text}` : ''}</Text></Pressable>)}</View>}
  </View>;
}

function StopCounter({ label, max, value, icon, onChange, colors }: { label: string; max: number; value: number; icon: keyof typeof MaterialCommunityIcons.glyphMap; onChange: (value: number) => void; colors: (typeof themes)[ThemeName] }) {
  return <View style={[styles.stopCounter, { backgroundColor: colors.card }]}>
    <View style={styles.counterHeading}><MaterialCommunityIcons name={icon} size={22} color={BLUE} /><Text style={[styles.counterTitle, { color: colors.text }]}>{label}</Text><Text style={styles.maxLabel}>Max {max}</Text></View>
    <View style={styles.counterButtons}><Pressable disabled={value <= 1} onPress={() => onChange(Math.max(1, value - 1))} style={[styles.counterCircle, { opacity: value <= 1 ? 0.35 : 1 }]}><Text style={styles.counterSymbol}>−</Text></Pressable><View style={styles.counterValue}><Text style={[styles.counterNumber, { color: colors.text }]}>{value}</Text></View><Pressable disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.counterCircle, styles.counterCircleFilled, { opacity: value >= max ? 0.35 : 1 }]}><Text style={[styles.counterSymbol, { color: '#fff' }]}>+</Text></Pressable></View>
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
  return <View style={[styles.placeCard, { backgroundColor: colors.card }]}>
    <View style={styles.placeHeading}><View style={styles.stopBadge}><Text style={styles.stopBadgeText}>{index + 1}</Text></View><Text style={[styles.placeName, { color: colors.text }]} numberOfLines={2}>{details?.name ?? place.name}</Text><View style={[styles.typeBadge, { backgroundColor: place.stopType === 'pub' ? '#ffd9db' : '#e9d5ff' }]}><Text style={{ color: place.stopType === 'pub' ? '#9f3034' : '#6b21a8', fontWeight: '700' }}>{place.stopType.toUpperCase()}</Text></View></View>
    {onMove && <View style={styles.moveButtons}><Pressable disabled={!canMoveUp} onPress={() => onMove(-1)} style={[styles.moveButton, { opacity: canMoveUp ? 1 : 0.35 }]}><Ionicons name="chevron-up" size={18} color="#fff" /><Text style={styles.moveText}>Earlier</Text></Pressable><Pressable disabled={!canMoveDown} onPress={() => onMove(1)} style={[styles.moveButton, { opacity: canMoveDown ? 1 : 0.35 }]}><Ionicons name="chevron-down" size={18} color="#fff" /><Text style={styles.moveText}>Later</Text></Pressable></View>}
    {!details ? <ActivityIndicator style={{ margin: 30 }} color={BLUE} /> : <>{photo && <Image source={{ uri: photo }} style={styles.placeImage} resizeMode="cover" />}<DetailRows details={details} colors={colors} /></>}
  </View>;
}

export default function App() {
  const mapRef = useRef<MapView>(null);
  const [themeName, setThemeName] = useState<ThemeName>('classic');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [start, setStart] = useState(''); const [finish, setFinish] = useState('');
  const [pubs, setPubs] = useState(1); const [attractions, setAttractions] = useState(1);
  const [mode, setMode] = useState<TravelMode>('walking'); const [route, setRoute] = useState<RoutePlan | null>(null); const [loading, setLoading] = useState(false);
  const colors = themes[themeName];

  useEffect(() => { AsyncStorage.getItem('tipsy-theme').then((value) => value && setThemeName(value as ThemeName)); }, []);
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
  const cycleTheme = () => { const names: ThemeName[] = ['classic', 'dark', 'neon']; setThemeName(names[(names.indexOf(themeName) + 1) % names.length]); };
  const moveStop = (index: number, amount: number) => setRoute((current) => { if (!current || index + amount < 0 || index + amount >= current.stops.length) return current; const stops = [...current.stops]; const [item] = stops.splice(index, 1); stops.splice(index + amount, 0, item); return { ...current, stops }; });
  const travelLabel = mode === 'bicycling' ? 'cycling' : mode;

  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={themeName === 'classic' ? 'dark' : 'light'} />
    <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={LONDON} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} customMapStyle={colors.map as any} showsUserLocation showsMyLocationButton={false}>
      {route && <><Polyline coordinates={route.coordinates} strokeColor={BLUE} strokeWidth={6} /><Marker coordinate={route.origin} title="Start"><View style={[styles.endpointMarker, { backgroundColor: '#2563eb' }]}><Text style={styles.endpointText}>Start</Text></View></Marker>{route.stops.map((place, index) => <Marker key={place.place_id} coordinate={{ latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }} onPress={() => setSelectedPlace(place)}><View style={[styles.numberMarker, { backgroundColor: place.stopType === 'pub' ? '#dc2626' : '#7c3aed' }]}><Text style={styles.numberMarkerText}>{index + 1}</Text></View></Marker>)}<Marker coordinate={route.destination} title="Finish"><View style={[styles.endpointMarker, { backgroundColor: '#16a34a' }]}><Text style={styles.endpointText}>Finish</Text></View></Marker></>}
    </MapView>

    <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView pointerEvents="box-none" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.overlayScroll}>
          <View style={[styles.topCard, { backgroundColor: colors.card, borderColor: '#58b5ed' }]}>
            <View style={styles.headerRow}><View style={styles.logoBox}><Image source={require('./assets/tipsy-logo.png')} style={styles.brandLogo} resizeMode="contain" /></View><View style={{ flex: 1 }}><RainbowTitle /><View style={styles.taglineRow}><MaterialCommunityIcons name="map-marker-path" size={22} color={colors.text} /><Text style={[styles.tagline, { color: colors.text }]}>{route ? `${route.distance} · ${route.duration} · ${travelLabel}` : 'Plan a pub-and-sights route'}</Text></View></View><Pressable accessibilityLabel="Toggle planner" onPress={() => setPlannerOpen((open) => !open)} style={[styles.menuButton, plannerOpen && { backgroundColor: '#eef4fa' }]}><Ionicons name="menu" size={29} color={BLUE} /></Pressable></View>
            {plannerOpen && <View style={styles.plannerBody}>
              <AutocompleteInput value={start} onChange={setStart} placeholder="Start location" onLocate={() => locateMe('start')} colors={colors} />
              <AutocompleteInput value={finish} onChange={setFinish} placeholder="Finish location" onLocate={() => locateMe('finish')} colors={colors} />
              <View style={styles.divider} />
              <View style={styles.modeRow}>{modes.map((item) => <Pressable key={item.value} onPress={() => setMode(item.value)} style={[styles.modeButton, mode === item.value && styles.modeButtonSelected]}><MaterialCommunityIcons name={item.icon} size={20} color={mode === item.value ? '#fff' : colors.text} /><Text style={[styles.modeLabel, { color: mode === item.value ? '#fff' : colors.text }]}>{item.label}</Text></Pressable>)}</View>
              <View style={styles.countersRow}><StopCounter label="Pubs" max={7} value={pubs} icon="glass-cocktail" onChange={setPubs} colors={colors} /><StopCounter label="Attractions" max={3} value={attractions} icon="camera" onChange={setAttractions} colors={colors} /></View>
              <View style={styles.divider} />
              <Pressable disabled={loading} onPress={submit} style={[styles.primaryButton, loading && { opacity: 0.65 }]}>{loading ? <ActivityIndicator color="#fff" /> : <><MaterialCommunityIcons name="glass-mug-variant" size={22} color="#fff" /><Text style={styles.primaryButtonText}>Plan my Tipsy Tour</Text></>}</Pressable>
              {!start || !finish ? <View style={styles.warning}><Ionicons name="alert-circle" size={25} color="#c75015" /><Text style={styles.warningText}>Choose both a start and finish location.</Text></View> : null}
              <Text style={[styles.routeMode, { color: colors.muted }]}>Route mode: {travelLabel}</Text>
              <Pressable onPress={clear} style={styles.clearButton}><Text style={styles.clearText}>Clear Route</Text></Pressable>
            </View>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.actionDock, { backgroundColor: colors.card }]}><Pressable onPress={() => locateMe()} style={styles.dockButton}><Ionicons name="navigate" size={25} color="#fff" /></Pressable><Pressable onPress={clear} style={styles.dockButton}><Ionicons name="close" size={28} color="#fff" /></Pressable><Pressable onPress={cycleTheme} style={styles.dockButton}><Ionicons name="settings-outline" size={25} color="#fff" /></Pressable>{route && <Pressable onPress={() => setItineraryOpen(true)} style={styles.dockButton}><Ionicons name="list" size={27} color="#fff" /></Pressable>}</View>
    </SafeAreaView>

    <Modal visible={itineraryOpen} transparent animationType="fade" onRequestClose={() => setItineraryOpen(false)}><View style={styles.modalOverlay}><SafeAreaView style={styles.modalSafe}><View style={[styles.modalPanel, { backgroundColor: colors.card }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.text }]}>Your Itinerary</Text><Pressable onPress={() => setItineraryOpen(false)}><Ionicons name="close" size={32} color={colors.text} /></Pressable></View><View style={styles.modalDivider} /><View style={styles.summaryChips}><Text style={[styles.summaryChip, { backgroundColor: '#ccecff' }]}>{route?.stops.length ?? 0} STOPS</Text><Text style={[styles.summaryChip, { backgroundColor: '#c8f5d2' }]}>{route?.distance.toUpperCase()}</Text><Text style={[styles.summaryChip, { backgroundColor: '#e3d3ff' }]}>{route?.duration.toUpperCase()}</Text><Text style={[styles.summaryChip, { backgroundColor: '#edf1f5' }]}>{travelLabel.toUpperCase()}</Text></View><ScrollView contentContainerStyle={{ padding: 16 }}>{route?.stops.map((place, index) => <PlaceCard key={place.place_id} place={place} index={index} colors={colors} canMoveUp={index > 0} canMoveDown={index < route.stops.length - 1} onMove={(amount) => moveStop(index, amount)} />)}</ScrollView><View style={styles.modalFooter}><Pressable onPress={() => setItineraryOpen(false)} style={styles.closeButton}><Text style={styles.closeButtonText}>Close</Text></Pressable></View></View></SafeAreaView></View></Modal>
    <Modal visible={Boolean(selectedPlace)} transparent animationType="fade" onRequestClose={() => setSelectedPlace(null)}><View style={styles.modalOverlay}><SafeAreaView style={styles.modalSafe}><View style={[styles.modalPanel, { backgroundColor: colors.card }]}><View style={styles.modalHeader}><Text style={[styles.modalTitle, { color: colors.text }]}>Location Details</Text><Pressable onPress={() => setSelectedPlace(null)}><Ionicons name="close" size={32} color={colors.text} /></Pressable></View><View style={styles.modalDivider} /><ScrollView contentContainerStyle={{ padding: 16 }}>{selectedPlace && <PlaceCard place={selectedPlace} index={route?.stops.findIndex((item) => item.place_id === selectedPlace.place_id) ?? 0} colors={colors} />}</ScrollView><View style={styles.modalFooter}><Pressable onPress={() => setSelectedPlace(null)} style={styles.closeButton}><Text style={styles.closeButtonText}>Close</Text></Pressable></View></View></SafeAreaView></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  overlayScroll: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 160 }, topCard: { borderWidth: 1.5, borderRadius: 18, padding: 16, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 8 }, headerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 66 }, logoBox: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }, brandLogo: { width: 54, height: 54 }, brandTitle: { fontSize: 28, fontWeight: '400', letterSpacing: -0.5 }, taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 }, tagline: { fontSize: 15 }, menuButton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, plannerBody: { paddingTop: 14, gap: 10 }, autocompleteWrap: { zIndex: 20 }, locationRow: { flexDirection: 'row', gap: 8 }, locationInput: { flex: 1, borderWidth: 1.5, borderColor: '#55b6ef', minHeight: 52, borderRadius: 9, paddingHorizontal: 14, fontSize: 18 }, pinButton: { width: 48, minHeight: 52, borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, suggestions: { position: 'absolute', top: 52, left: 0, right: 56, zIndex: 50, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 8, elevation: 12 }, suggestionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderBottomColor: '#e5e7eb', borderBottomWidth: 1 }, suggestionText: { flex: 1, fontSize: 14 }, divider: { height: 1.5, backgroundColor: '#b6ddfa', marginVertical: 4 }, modeRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 9, overflow: 'hidden' }, modeButton: { flex: 1, minHeight: 47, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: '#55b6ef' }, modeButtonSelected: { backgroundColor: BLUE }, modeLabel: { fontSize: 17 }, countersRow: { flexDirection: 'row', gap: 8 }, stopCounter: { flex: 1, borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 9, padding: 10, minHeight: 135 }, counterHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 }, counterTitle: { fontSize: 17, flex: 1 }, maxLabel: { color: '#6b7280', fontSize: 12, width: 35 }, counterButtons: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, counterCircle: { width: 42, height: 42, borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, counterCircleFilled: { backgroundColor: BLUE, borderColor: BLUE }, counterSymbol: { color: BLUE, fontSize: 27, lineHeight: 29, fontWeight: '600' }, counterValue: { minWidth: 48, height: 48, borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, counterNumber: { fontSize: 21 }, primaryButton: { backgroundColor: BLUE, minHeight: 53, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 }, primaryButtonText: { color: '#fff', fontSize: 19 }, warning: { backgroundColor: '#ffebc7', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 9 }, warningText: { color: '#252a35', fontSize: 15, flex: 1 }, routeMode: { textAlign: 'center', fontSize: 14, marginVertical: 2 }, clearButton: { minHeight: 46, borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, clearText: { color: BLUE, fontSize: 17 }, actionDock: { position: 'absolute', bottom: 18, alignSelf: 'center', borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 34, padding: 7, flexDirection: 'row', gap: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }, dockButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }, endpointMarker: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, endpointText: { color: '#fff', fontWeight: '800', fontSize: 12 }, numberMarker: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, numberMarkerText: { color: '#fff', fontSize: 17, fontWeight: '800' }, modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', padding: 12, justifyContent: 'center' }, modalSafe: { flex: 1, justifyContent: 'center' }, modalPanel: { maxHeight: '88%', borderRadius: 12, overflow: 'hidden' }, modalHeader: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }, modalTitle: { fontSize: 27, fontWeight: '400' }, modalDivider: { height: 1.5, backgroundColor: '#55b6ef' }, summaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingTop: 12 }, summaryChip: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 3, color: '#27334a', fontWeight: '600' }, modalFooter: { minHeight: 74, borderTopWidth: 1.5, borderColor: '#55b6ef', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 20 }, closeButton: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 22, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 }, closeButtonText: { color: '#fff', fontSize: 18 }, placeCard: { borderWidth: 1.5, borderColor: '#55b6ef', borderRadius: 9, padding: 14, marginBottom: 16 }, placeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, stopBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }, stopBadgeText: { color: '#fff', fontWeight: '800' }, placeName: { flex: 1, fontSize: 23 }, typeBadge: { borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 }, moveButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginVertical: 10 }, moveButton: { backgroundColor: BLUE, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }, moveText: { color: '#fff' }, placeImage: { width: '100%', height: 190, borderRadius: 9, marginVertical: 12 }, detailRows: { gap: 13, marginTop: 8 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, detailText: { flex: 1, fontSize: 17 }, detailLink: { flex: 1, fontSize: 17 },
});
