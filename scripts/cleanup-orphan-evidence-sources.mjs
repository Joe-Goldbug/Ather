const SOURCE_TABLES = {
  test: ['assessment_runs', 'dynamic_scripts'],
  micro_sandbox_practice: ['assessment_runs'],
  observation_response: ['observation_responses'],
  user_correction: ['user_corrections'],
  chat: ['conversations'],
  diary: ['diary_entries'],
  capture: ['captures'],
};

export function sourceTables(sourceType) {
  return Object.hasOwn(SOURCE_TABLES, sourceType) ? SOURCE_TABLES[sourceType] : null;
}

// Shared by discovery and execution so a restored source is checked again
// before quarantine. UUID text comparison avoids casting malformed source IDs.
export function orphanPredicate(sourceType) {
  const tables = sourceTables(sourceType);
  if (!tables) return null;
  return `e.source_type = $1
    AND e.portrait_status IS DISTINCT FROM 'withdrawn'
    AND e.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ${tables.map(table => `AND NOT EXISTS (
      SELECT 1 FROM ${table} src
      WHERE src.id::text = LOWER(e.source_id) AND src.user_id = e.user_id
    )`).join('\n    ')}`;
}
