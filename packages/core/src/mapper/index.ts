// Column Mapper - Fuzzy header matching for CSV import

// Main functions
export { mapColumns, applyMapping, mapAndValidate, updateMapping } from "./mapper";

// Similarity functions (for advanced usage)
export {
	levenshtein,
	levenshteinSimilarity,
	normalize,
	tokenize,
	tokenSimilarity,
	containsMatch,
	commonPrefixLength,
	computeSimilarity,
	computeBestMatch,
} from "./similarity";

// Types
export type {
	MappingConfidence,
	MappingMatch,
	MappingResult,
	MappingOptions,
	ScoringResult,
} from "./types";
