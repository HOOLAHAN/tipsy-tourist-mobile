import type { CategoryQuantities, StopCategory } from "./types";

export const STOP_CATEGORIES: {
  id: StopCategory;
  label: string;
  singular: string;
  icon: string;
  color: string;
  background: string;
}[] = [
  { id: "landmarks", label: "Landmarks", singular: "Landmark", icon: "bank-outline", color: "#7c3aed", background: "#ede9fe" },
  { id: "museums", label: "Museums", singular: "Museum", icon: "pillar", color: "#9333ea", background: "#f3e8ff" },
  { id: "galleries", label: "Galleries", singular: "Gallery", icon: "palette-outline", color: "#db2777", background: "#fce7f3" },
  { id: "parks", label: "Parks & nature", singular: "Park or nature spot", icon: "tree-outline", color: "#15803d", background: "#dcfce7" },
  { id: "cafes", label: "Cafés", singular: "Café", icon: "coffee-outline", color: "#a16207", background: "#fef3c7" },
  { id: "food", label: "Food", singular: "Food", icon: "silverware-fork-knife", color: "#ea580c", background: "#ffedd5" },
  { id: "shopping", label: "Shopping", singular: "Shopping", icon: "shopping-outline", color: "#0369a1", background: "#e0f2fe" },
  { id: "markets", label: "Markets", singular: "Market", icon: "storefront-outline", color: "#0f766e", background: "#ccfbf1" },
  { id: "family", label: "Family", singular: "Family activity", icon: "account-group-outline", color: "#2563eb", background: "#dbeafe" },
  { id: "entertainment", label: "Entertainment", singular: "Entertainment venue", icon: "theater", color: "#c026d3", background: "#fae8ff" },
  { id: "scenic", label: "Scenic", singular: "Scenic place", icon: "binoculars", color: "#0d9488", background: "#ccfbf1" },
  { id: "activities", label: "Activities", singular: "Activity", icon: "run", color: "#ca8a04", background: "#fef9c3" },
  { id: "bars", label: "Bars & pubs", singular: "Bar or pub", icon: "glass-mug-variant", color: "#b45309", background: "#fef3c7" },
  { id: "heritage", label: "History & heritage", singular: "Historic place", icon: "castle", color: "#9f1239", background: "#ffe4e6" },
];

export const DEFAULT_CATEGORY_QUANTITIES: CategoryQuantities = {
  landmarks: 2,
  museums: 1,
  galleries: 0,
  parks: 1,
  cafes: 0,
  food: 0,
  shopping: 0,
  markets: 0,
  family: 0,
  entertainment: 0,
  scenic: 0,
  activities: 0,
  bars: 0,
  heritage: 0,
};

export function categoryDetails(category: StopCategory) {
  return STOP_CATEGORIES.find((item) => item.id === category) ?? STOP_CATEGORIES[0];
}
