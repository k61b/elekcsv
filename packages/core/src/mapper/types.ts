// ============================================================================
// Column Mapping Types
// ============================================================================

/**
 * Confidence level of a column mapping match.
 * - 'exact': Case-insensitive exact match with schema column name
 * - 'alias': Exact match with one of the column's aliases
 * - 'fuzzy': Fuzzy string similarity match (may need user review)
 * - 'none': No match found
 */
export type MappingConfidence = "exact" | "alias" | "fuzzy" | "none";

/**
 * A single column mapping from CSV header to schema column.
 */
export interface MappingMatch {
	/** Index of the column in the CSV (0-based) */
	csvIndex: number;
	/** Original header text from the CSV */
	csvHeader: string;
	/** Name of the matched schema column (empty if no match) */
	schemaColumn: string;
	/** How the match was determined */
	confidence: MappingConfidence;
	/** Similarity score (0-1). 1 for exact/alias, 0-1 for fuzzy, 0 for none */
	score: number;
}

/**
 * Result of mapping CSV headers to schema columns.
 */
export interface MappingResult {
	/** Mapping for each CSV column (in CSV column order) */
	mappings: MappingMatch[];
	/** Indices of CSV columns that couldn't be mapped */
	unmappedCsvColumns: number[];
	/** Names of schema columns that have no CSV match */
	unmappedSchemaColumns: string[];
	/** Count of auto-mapped columns (exact + alias) */
	autoMapped: number;
	/** Count of fuzzy matches that may need user review */
	needsReview: number;
	/** Count of completely unmapped columns */
	unmapped: number;
}

/**
 * Options for the column mapping process.
 */
export interface MappingOptions {
	/** Minimum similarity score for fuzzy match. Default: 0.6 */
	fuzzyThreshold?: number;
	/** Score above which fuzzy matches are auto-accepted. Default: 0.8 */
	autoAcceptThreshold?: number;
}

/**
 * Internal scoring result for a potential column match.
 */
export interface ScoringResult {
	schemaColumn: string;
	confidence: MappingConfidence;
	score: number;
	matchedVia?: string; // For alias matches, which alias matched
}
