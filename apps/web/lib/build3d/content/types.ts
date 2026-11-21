export interface StepContent {
  titleHe: string;
  descHe: string;
  crewHe: string;
  durationDays: number;
  tipHe: string;
  searchQuery: string;
  videos?: Array<{ titleHe: string; href: string }>;
  checkpointHe?: string;
}

export type StepContentMap = Record<string, StepContent>;

/** Link to a bonimbait video page (/video/<youtube_id>/). */
export const vid = (id: string, titleHe: string) => ({ titleHe, href: `/video/${id}/` });

/** Positional builder to keep the step tables compact. */
export function step(
  titleHe: string,
  descHe: string,
  crewHe: string,
  durationDays: number,
  tipHe: string,
  searchQuery: string,
  videos?: Array<{ titleHe: string; href: string }>,
  checkpointHe?: string,
): StepContent {
  const c: StepContent = { titleHe, descHe, crewHe, durationDays, tipHe, searchQuery };
  if (videos && videos.length) c.videos = videos;
  if (checkpointHe) c.checkpointHe = checkpointHe;
  return c;
}
