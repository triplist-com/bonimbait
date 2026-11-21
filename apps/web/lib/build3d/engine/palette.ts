import type { MaterialKey } from './types';

/** Physical-ish properties of each palette material (SPEC §6). Pure data, no three.js. */
export interface MaterialSpec {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
  /** Outline parts made of this material by default. */
  edges: boolean;
  /** Emissive color; glows only under view.lighting = 'dusk'. */
  emissive?: string;
}

export const ACCENT = '#E61559';
export const INK = '#231F20';

export const PALETTE: Record<MaterialKey, MaterialSpec> = {
  soil: { color: '#C9A979', roughness: 1, metalness: 0, edges: false },
  soilCut: { color: '#A9875A', roughness: 1, metalness: 0, edges: false },
  rock: { color: '#B9AE9B', roughness: 0.95, metalness: 0, edges: true },
  gravel: { color: '#B8B2A7', roughness: 1, metalness: 0, edges: true },
  concreteFresh: { color: '#8E9196', roughness: 0.55, metalness: 0, edges: true },
  concrete: { color: '#C4C6C8', roughness: 0.9, metalness: 0, edges: true },
  rebar: { color: '#6B4A3A', roughness: 0.6, metalness: 0.25, edges: false },
  plywood: { color: '#E8B04A', roughness: 0.8, metalness: 0, edges: true },
  timber: { color: '#B98A55', roughness: 0.85, metalness: 0, edges: true },
  block: { color: '#A7A9AC', roughness: 0.95, metalness: 0, edges: true },
  plaster: { color: '#F1EEE8', roughness: 0.95, metalness: 0, edges: true },
  stone: { color: '#E3D3B4', roughness: 0.9, metalness: 0, edges: true },
  bitumen: { color: '#2B2B2B', roughness: 0.6, metalness: 0, edges: true },
  roofWhite: { color: '#F5F5F0', roughness: 0.8, metalness: 0, edges: true },
  glass: { color: '#9CC7E6', roughness: 0.05, metalness: 0.1, opacity: 0.35, edges: false },
  aluminum: { color: '#3A3D42', roughness: 0.45, metalness: 0.5, edges: true },
  porcelain: { color: '#D9D4CC', roughness: 0.35, metalness: 0, edges: true },
  parquet: { color: '#B78A5E', roughness: 0.6, metalness: 0, edges: true },
  grass: { color: '#7DB35A', roughness: 1, metalness: 0, edges: false },
  pipeRed: { color: '#D64545', roughness: 0.5, metalness: 0, edges: false },
  pipeBlue: { color: '#3F7BD9', roughness: 0.5, metalness: 0, edges: false },
  drain: { color: '#8A8F98', roughness: 0.55, metalness: 0, edges: true },
  conduit: { color: '#F08A24', roughness: 0.6, metalness: 0, edges: false },
  steel: { color: '#5E646B', roughness: 0.5, metalness: 0.6, edges: true },
  galvanized: { color: '#AEB4BA', roughness: 0.4, metalness: 0.6, edges: true },
  ribbon: { color: '#FF6A1A', roughness: 0.7, metalness: 0, edges: false },
  fenceFabric: { color: '#6E9C80', roughness: 0.95, metalness: 0, edges: true },
  hole: { color: '#3B2F25', roughness: 1, metalness: 0, edges: false },
  asphalt: { color: '#A3A2A0', roughness: 1, metalness: 0, edges: false },
  poly: { color: '#DDE7EE', roughness: 0.3, metalness: 0, opacity: 0.55, edges: false },
  insulation: { color: '#9FC5A8', roughness: 0.9, metalness: 0, edges: true },
  paint: { color: '#FAF8F4', roughness: 0.9, metalness: 0, edges: true },
  wood: { color: '#A97A4E', roughness: 0.75, metalness: 0, edges: true },
  water: { color: '#6FB7E0', roughness: 0.1, metalness: 0, opacity: 0.7, edges: false },
  white: { color: '#FFFFFF', roughness: 0.8, metalness: 0, edges: true },
  ink: { color: INK, roughness: 0.8, metalness: 0, edges: false },
  string: { color: '#FFFFFF', roughness: 1, metalness: 0, edges: false },
  light: { color: '#FFF8EC', roughness: 0.5, metalness: 0, edges: false, emissive: '#FFC978' },
  glassLit: { color: '#9CC7E6', roughness: 0.05, metalness: 0.1, opacity: 0.45, edges: false, emissive: '#FFB45E' },
  // Framed methods (steel / timber).
  lumber: { color: '#DDB57C', roughness: 0.8, metalness: 0, edges: true },
  osb: { color: '#D4A35E', roughness: 0.85, metalness: 0, edges: true },
  cementBoard: { color: '#BEBBB3', roughness: 0.95, metalness: 0, edges: true },
  gypsum: { color: '#E4E1DA', roughness: 0.9, metalness: 0, edges: true },
  houseWrap: { color: '#E8EEF2', roughness: 0.7, metalness: 0, edges: false },
  mineralWool: { color: '#D8C26C', roughness: 1, metalness: 0, edges: false },
};
