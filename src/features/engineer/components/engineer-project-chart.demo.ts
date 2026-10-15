// TODO: REMOVE_DEMO_CHART_DATA — eliminar datos de demostración antes de la entrega final.
// Presentation-only counts: never create ProjectItem records or persist these values.
export function getDemoChartCounts(year: number, scope: string): number[] {
  const values = [18, 11, 7, 13, 24, 31, 27, 16, 8, 10, 19, 29];
  const factor = scope === "all" ? 2 : 1;
  const offset = year % 3;
  return values.map((value, index) => (value + (index % 2 ? offset : 0)) * factor);
}
