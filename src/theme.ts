export const themes = {
  classic: { background: '#fffaf1', card: '#ffffff', text: '#172033', muted: '#64748b', primary: '#dc2626', accent: '#f59e0b', map: [] },
  dark: { background: '#101827', card: '#172033', text: '#f8fafc', muted: '#94a3b8', primary: '#fb7185', accent: '#fbbf24', map: [{ elementType: 'geometry', stylers: [{ color: '#172033' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2942' }] }] },
  neon: { background: '#10051f', card: '#221036', text: '#fdf4ff', muted: '#d8b4fe', primary: '#f0abfc', accent: '#22d3ee', map: [{ elementType: 'geometry', stylers: [{ color: '#1d0b32' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#f0abfc' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3b1764' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#082f49' }] }] },
} as const;

export type ThemeName = keyof typeof themes;
