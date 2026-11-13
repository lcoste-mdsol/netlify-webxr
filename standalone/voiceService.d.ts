export function parseVoiceIntent(
  transcript: string,
  startups: Array<{
    id?: string;
    name: string;
    category?: string;
    typeID?: number;
    commercialDescription?: string;
  }>
): {
  intent: string;
  rawText: string;
  gotoIndex?: number;
  gotoName?: string;
  startupName?: string;
  scaleFactor?: number;
  categoryName?: string;
  categoryTitle?: string;
};
