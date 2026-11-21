import type { PlanOverlay } from '@/lib/build3d/house/types';
import overlayJson from '@/lib/build3d/house/overlay.json';

/** The Extractor's 2D overlay (sheet page points), typed against the contract. */
export const overlay = overlayJson as PlanOverlay;
