export const REPORT_DENOMINATOR = "RECORDED_ENTRIES" as const;
export const REPORT_ATTRIBUTION = "CURRENT_HIERARCHY" as const;

// Generation time describes this result, not an immutable historical snapshot.
export function createReportContext(filters: { from?: string; to?: string }, generatedAt = new Date()) {
  return {
    denominator: REPORT_DENOMINATOR,
    attribution: REPORT_ATTRIBUTION,
    generatedAt: generatedAt.toISOString(),
    period: { from: filters.from ?? null, to: filters.to ?? null },
  };
}
