import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { getPlaceDetails, planRoute } from './src/api';
import { ThemeName, themes } from './src/theme';
import { Place, PlaceDetails, RoutePlan, TravelMode } from './src/types';

const LONDON: Region = { latitude: 51.5033, longitude: -0.1196, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const modes: { value: TravelMode; label: string }[] = [{ value: 'walking', label: 'Walk' }, { value: 'bicycling', label: 'Cycle' }, { value: 'driving', label: 'Drive' }];

function Counter({ label, value, onChange, colors }: { label: string; value: number; onChange: (value: number) => void; colors: (typeof themes)[ThemeName] }) {
  return <View style={styles.counter}><Text style={[styles.counterLabel, { color: colors.text }]}>{label}</Text><View style={styles.counterControls}><Pressable accessibilityLabel={`Remove ${label}`} onPress={() => onChange(Math.max(0, value - 1))} style={[styles.roundButton, { backgroundColor: colors.background }]}><Text style={{ color: colors.text, fontSize: 20 }}>−</Text></Pressable><Text style={[styles.count, { color: colors.text }]}>{value}</Text><Pressable accessibilityLabel={`Add ${label}`} onPress={() => onChange(Math.min(6, value + 1))} style={[styles.roundButton, { backgroundColor: colors.background }]}><Text style={{ color: colors.text, fontSize: 20 }}>+</Text></Pressable></View></View>;
}

export default function App() {
  const mapRef = useRef<MapView>(null);
  const [themeName, setThemeName] = useState<ThemeName>('classic');
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [pubs, setPubs] = useState(2);
  const [attractions, setAttractions] = useState(1);
  const [mode, setMode] = useState<TravelMode>('walking');
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const colors = themes[themeName];

  useEffect(() => { AsyncStorage.getItem('tipsy-theme').then((value) => value && setThemeName(value as ThemeName)); }, []);
  useEffect(() => { AsyncStorage.setItem('tipsy-theme', themeName); }, [themeName]);
  useEffect(() => {
    if (!selectedPlace) return;
    setDetails(null);
    getPlaceDetails(selectedPlace.place_id).then(setDetails).catch(() => setDetails({ name: selectedPlace.name, formatted_address: selectedPlace.vicinity }));
  }, [selectedPlace]);

  const markers = useMemo(() => route?.stops ?? [], [route]);

  const locateMe = async (target: 'start' | 'map' = 'map') => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return Alert.alert('Location permission needed', 'Enable location access to use your current position.');
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coordinate = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    mapRef.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 });
    if (target === 'start') setStart(`${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`);
  };

  const submit = async () => {
    if (!start.trim() || !finish.trim()) return Alert.alert('Add your route', 'Enter both a start and finish location.');
    setLoading(true);
    try {
      const nextRoute = await planRoute(start.trim(), finish.trim(), pubs, attractions, mode);
      setRoute(nextRoute);
      setPlannerOpen(false);
      requestAnimationFrame(() => mapRef.current?.fitToCoordinates(nextRoute.coordinates, { edgePadding: { top: 160, right: 50, bottom: 180, left: 50 }, animated: true }));
    } catch (error) {
      Alert.alert('Could not plan route', error instanceof Error ? error.message : 'Please try again.');
    } finally { setLoading(false); }
  };

  const clear = () => { setRoute(null); setStart(''); setFinish(''); setPlannerOpen(true); };
  const cycleTheme = () => { const names: ThemeName[] = ['classic', 'dark', 'neon']; setThemeName(names[(names.indexOf(themeName) + 1) % names.length]); };
  const moveStop = (index: number, amount: number) => setRoute((current) => {
    if (!current || index + amount < 0 || index + amount >= current.stops.length) return current;
    const stops = [...current.stops]; const [item] = stops.splice(index, 1); stops.splice(index + amount, 0, item); return { ...current, stops };
  });

  return (
    <View style={[styles.app, { backgroundColor: colors.background }]}>
      <StatusBar style={themeName === 'classic' ? 'dark' : 'light'} />
      <MapView ref={mapRef} style={StyleSheet.absoluteFill} initialRegion={LONDON} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} customMapStyle={colors.map as any} showsUserLocation showsMyLocationButton={false}>
        {route && <><Polyline coordinates={route.coordinates} strokeColor={colors.primary} strokeWidth={5} /><Marker coordinate={route.origin} title="Start" pinColor="#2563eb" /><Marker coordinate={route.destination} title="Finish" pinColor="#16a34a" />{markers.map((place, index) => <Marker key={place.place_id} coordinate={{ latitude: place.geometry.location.lat, longitude: place.geometry.location.lng }} title={place.name} pinColor={place.stopType === 'pub' ? '#dc2626' : '#7c3aed'} onPress={() => setSelectedPlace(place)}><View style={[styles.marker, { backgroundColor: place.stopType === 'pub' ? '#dc2626' : '#7c3aed' }]}><Text style={styles.markerText}>{index + 1}</Text></View></Marker>)}</>}
      </MapView>

      <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.accent }]}>
          <View style={styles.brandMark}><Text style={styles.brandEmoji}>🍻</Text></View>
          <View style={styles.brandCopy}><Text style={[styles.title, { color: colors.primary }]}>Tipsy Tourist</Text><Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{route ? `${route.distance} · ${route.duration} · ${mode}` : 'Pubs, sights, one brilliant route'}</Text></View>
          <Pressable accessibilityLabel="Open route planner" onPress={() => setPlannerOpen(true)} style={[styles.headerButton, { backgroundColor: colors.background }]}><Text style={{ color: colors.text, fontSize: 20 }}>☰</Text></Pressable>
        </View>

        <View style={styles.mapActions}>
          <Pressable accessibilityLabel="Centre on my location" onPress={() => locateMe()} style={[styles.actionButton, { backgroundColor: colors.card }]}><Text style={styles.actionText}>◎</Text></Pressable>
          <Pressable accessibilityLabel="Change theme" onPress={cycleTheme} style={[styles.actionButton, { backgroundColor: colors.card }]}><Text style={styles.actionText}>◐</Text></Pressable>
          {route && <><Pressable accessibilityLabel="Open itinerary" onPress={() => setItineraryOpen(true)} style={[styles.actionButton, { backgroundColor: colors.card }]}><Text style={styles.actionText}>☷</Text></Pressable><Pressable accessibilityLabel="Clear route" onPress={clear} style={[styles.actionButton, { backgroundColor: colors.card }]}><Text style={styles.actionText}>×</Text></Pressable></>}
        </View>
      </SafeAreaView>

      <Modal visible={plannerOpen} transparent animationType="slide" onRequestClose={() => route && setPlannerOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdropPress} onPress={() => route && setPlannerOpen(false)} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.handle} />
            <View style={styles.sheetTitleRow}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Plan your crawl</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>Pick endpoints and we’ll find the best stops.</Text></View>{route && <Pressable onPress={() => setPlannerOpen(false)}><Text style={[styles.close, { color: colors.text }]}>×</Text></Pressable>}</View>
            <Text style={[styles.label, { color: colors.text }]}>Start</Text>
            <View style={styles.inputRow}><TextInput value={start} onChangeText={setStart} placeholder="Address, postcode or coordinates" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.accent }]} /><Pressable onPress={() => locateMe('start')} style={[styles.locationButton, { backgroundColor: colors.primary }]}><Text style={styles.locationText}>◎</Text></Pressable></View>
            <Text style={[styles.label, { color: colors.text }]}>Finish</Text>
            <TextInput value={finish} onChangeText={setFinish} placeholder="Address, postcode or coordinates" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.accent }]} />
            <View style={styles.counters}><Counter label="Pubs" value={pubs} onChange={setPubs} colors={colors} /><Counter label="Sights" value={attractions} onChange={setAttractions} colors={colors} /></View>
            <Text style={[styles.label, { color: colors.text }]}>Travel mode</Text>
            <View style={styles.segment}>{modes.map((item) => <Pressable key={item.value} onPress={() => setMode(item.value)} style={[styles.segmentButton, { backgroundColor: mode === item.value ? colors.primary : colors.background }]}><Text style={{ color: mode === item.value ? '#fff' : colors.text, fontWeight: '700' }}>{item.label}</Text></Pressable>)}</View>
            <Pressable disabled={loading} onPress={submit} style={[styles.planButton, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.planButtonText}>Build my route</Text>}</Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={itineraryOpen} transparent animationType="slide" onRequestClose={() => setItineraryOpen(false)}>
        <View style={styles.modalBackdrop}><Pressable style={styles.backdropPress} onPress={() => setItineraryOpen(false)} /><View style={[styles.sheet, { backgroundColor: colors.card }]}><View style={styles.handle} /><View style={styles.sheetTitleRow}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Your itinerary</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>{route?.distance} · {route?.duration}</Text></View><Pressable onPress={() => setItineraryOpen(false)}><Text style={[styles.close, { color: colors.text }]}>×</Text></Pressable></View><FlatList data={route?.stops ?? []} keyExtractor={(item) => item.place_id} renderItem={({ item, index }) => <Pressable onPress={() => { setItineraryOpen(false); setSelectedPlace(item); }} style={[styles.stopRow, { borderColor: colors.background }]}><View style={[styles.stopNumber, { backgroundColor: item.stopType === 'pub' ? '#dc2626' : '#7c3aed' }]}><Text style={styles.markerText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={[styles.stopName, { color: colors.text }]}>{item.name}</Text><Text style={{ color: colors.muted }}>{item.stopType === 'pub' ? 'Pub' : 'Attraction'}{item.rating ? ` · ★ ${item.rating}` : ''}</Text></View><View><Pressable onPress={() => moveStop(index, -1)}><Text style={[styles.reorder, { color: index ? colors.text : colors.muted }]}>↑</Text></Pressable><Pressable onPress={() => moveStop(index, 1)}><Text style={[styles.reorder, { color: index < (route?.stops.length ?? 0) - 1 ? colors.text : colors.muted }]}>↓</Text></Pressable></View></Pressable>} /></View></View>
      </Modal>

      <Modal visible={Boolean(selectedPlace)} transparent animationType="slide" onRequestClose={() => setSelectedPlace(null)}>
        <View style={styles.modalBackdrop}><Pressable style={styles.backdropPress} onPress={() => setSelectedPlace(null)} /><View style={[styles.sheet, { backgroundColor: colors.card }]}><View style={styles.handle} /><View style={styles.sheetTitleRow}><View style={{ flex: 1 }}><Text style={[styles.sheetTitle, { color: colors.text }]}>{details?.name ?? selectedPlace?.name}</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>{details?.formatted_address ?? selectedPlace?.vicinity ?? 'Loading place details…'}</Text></View><Pressable onPress={() => setSelectedPlace(null)}><Text style={[styles.close, { color: colors.text }]}>×</Text></Pressable></View>{!details ? <ActivityIndicator color={colors.primary} /> : <View style={styles.detailGrid}><Text style={[styles.detail, { color: colors.text }]}>{details.rating ? `★ ${details.rating} (${details.user_ratings_total ?? 0} reviews)` : 'No rating available'}</Text>{details.opening_hours?.open_now !== undefined && <Text style={[styles.detail, { color: details.opening_hours.open_now ? '#16a34a' : '#dc2626' }]}>{details.opening_hours.open_now ? 'Open now' : 'Closed now'}</Text>}{details.formatted_phone_number && <Pressable onPress={() => Linking.openURL(`tel:${details.formatted_phone_number}`)}><Text style={[styles.link, { color: colors.primary }]}>{details.formatted_phone_number}</Text></Pressable>}{details.website && <Pressable onPress={() => Linking.openURL(details.website!)}><Text style={[styles.link, { color: colors.primary }]}>Visit website</Text></Pressable>}</View>}</View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 }, header: { position: 'absolute', top: 8, left: 14, right: 14, minHeight: 70, borderRadius: 22, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }, brandMark: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }, brandEmoji: { fontSize: 25 }, brandCopy: { flex: 1, marginHorizontal: 11 }, title: { fontSize: 20, fontWeight: '900' }, subtitle: { fontSize: 12, marginTop: 2 }, headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, mapActions: { position: 'absolute', right: 16, bottom: 30, gap: 10 }, actionButton: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }, actionText: { fontSize: 25, color: '#172033', fontWeight: '700' }, marker: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, markerText: { color: '#fff', fontWeight: '900' }, modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.28)' }, backdropPress: { flex: 1 }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: Platform.OS === 'ios' ? 34 : 24, maxHeight: '86%' }, handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 18 }, sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }, sheetTitle: { fontSize: 24, fontWeight: '900' }, sheetSubtitle: { marginTop: 4, fontSize: 13 }, close: { fontSize: 30, paddingLeft: 20 }, label: { fontSize: 13, fontWeight: '800', marginBottom: 7, marginTop: 11 }, inputRow: { flexDirection: 'row', gap: 8 }, input: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 }, locationButton: { width: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, locationText: { color: '#fff', fontSize: 22 }, counters: { flexDirection: 'row', gap: 12, marginVertical: 15 }, counter: { flex: 1 }, counterLabel: { fontWeight: '800', marginBottom: 8 }, counterControls: { flexDirection: 'row', alignItems: 'center', gap: 11 }, roundButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, count: { minWidth: 18, textAlign: 'center', fontWeight: '900', fontSize: 17 }, segment: { flexDirection: 'row', gap: 8 }, segmentButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }, planButton: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, planButtonText: { color: '#fff', fontWeight: '900', fontSize: 16 }, stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1 }, stopNumber: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, stopName: { fontWeight: '800', fontSize: 16 }, reorder: { fontSize: 22, paddingHorizontal: 8, lineHeight: 25 }, detailGrid: { gap: 13 }, detail: { fontSize: 16 }, link: { fontSize: 16, fontWeight: '800' },
});
