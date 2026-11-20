/**
 * The house the demo builds: extracted from the plot-43 sheet by the Extractor
 * (docs/build3d/extraction.md). `stub.ts` remains as a fallback for experiments.
 */
import type { HouseModel } from './types';
import data from './house.json';

export type { HouseModel } from './types';

export const HOUSE_SOURCE: 'stub' | 'extracted' = 'extracted';

export const house: HouseModel = data as unknown as HouseModel;
