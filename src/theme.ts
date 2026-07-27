export const themes = {
  light: {
    background: '#f6f8fc', card: '#ffffff', surface: '#f1f5f9', text: '#172033', muted: '#64748b',
    primary: '#3b82f6', primaryPressed: '#2563eb', border: '#dbe4f0', accent: '#60a5fa', shadow: '#0f172a',
    map: [],
  },
  dark: {
    background: '#080f1d', card: '#111a2b', surface: '#192438', text: '#f8fafc', muted: '#9eacc2',
    primary: '#60a5fa', primaryPressed: '#3b82f6', border: '#2a3a53', accent: '#7dd3fc', shadow: '#000000',
    map: [
      { elementType: 'geometry', stylers: [{ color: '#172033' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#a9b8ce' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
      { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1d293b' }] },
      { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#18342d' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#273449' }] },
      { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
      { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#223047' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c3047' }] },
    ],
  },
} as const;

export type ThemeName = keyof typeof themes;
