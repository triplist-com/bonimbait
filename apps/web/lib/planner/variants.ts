/**
 * "ואם משנים פרט אחד?": three one-change variants of a set of answers, for the
 * scenario pages (each links into the planner with its answers). Pure.
 */
import type { PlannerInput } from './types';

export interface WhatIfVariant {
  id: 'one-floor' | 'two-floors' | 'basement' | 'no-basement' | 'high' | 'standard' | 'south' | 'center';
  label: string;
  input: PlannerInput;
}

export function whatIfVariants(input: PlannerInput, count = 3): WhatIfVariant[] {
  const out: WhatIfVariant[] = [];
  out.push(
    input.floors === 1
      ? { id: 'two-floors', label: 'אותו בית בשתי קומות', input: { ...input, floors: 2 } }
      : { id: 'one-floor', label: 'אותו בית בקומה אחת', input: { ...input, floors: 1 } },
  );
  out.push(
    input.extras.includes('basement')
      ? { id: 'no-basement', label: 'בלי המרתף', input: { ...input, extras: input.extras.filter((e) => e !== 'basement') } }
      : { id: 'basement', label: 'עם מרתף', input: { ...input, extras: [...input.extras, 'basement'] } },
  );
  out.push(
    input.finishLevel === 'basic' || input.finishLevel === 'standard'
      ? { id: 'high', label: 'בגמר גבוה', input: { ...input, finishLevel: 'high' } }
      : { id: 'standard', label: 'בגמר סטנדרטי-טוב', input: { ...input, finishLevel: 'standard' } },
  );
  out.push(
    input.regionSlug === 'south'
      ? { id: 'center', label: 'באזור המרכז', input: { ...input, regionSlug: 'center' } }
      : { id: 'south', label: 'באזור הדרום', input: { ...input, regionSlug: 'south' } },
  );
  return out.slice(0, count);
}
