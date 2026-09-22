/**
 * Builds the structured operation report described in the product spec:
 * requested vs. executed vs. skipped (with reasons), plus warnings and the
 * final validation result. Every field is filled from real pipeline state
 * — nothing here is inferred after the fact.
 */
export function buildOperationReport({
  modelName,
  preset,
  requested,
  executed,
  skipped,
  warnings,
  validation,
}) {
  return {
    modelName,
    preset,
    requested,
    executed,
    skipped, // [{ operation, reason }]
    warnings,
    validation, // { status: 'PASS'|'WARNING'|'FAIL', checks: [...] }
  };
}
