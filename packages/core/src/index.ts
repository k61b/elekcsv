// @elekcsv/core - CSV parsing, validation, and transformation engine

// Parser exports
export { parseCodegen as parse, compileParser, clearParserCache } from "./parser";
export type { ParseResult, CompiledParser } from "./parser";

// Validator exports
export {
	validate,
	validateBitmap,
	CompiledValidator,
	compileSchema,
	compileColumn,
	ErrorBitmap,
	ErrorCodeMap,
} from "./validator";
export type {
	CompiledSchemaValidator,
	ColumnValidatorInfo,
	CompiledColumnValidator,
	ValidationResult,
	BitmapValidationResult,
} from "./validator";

// Mapper exports
export {
	mapColumns,
	applyMapping,
	mapAndValidate,
	updateMapping,
	levenshtein,
	levenshteinSimilarity,
	normalize,
	tokenize,
	tokenSimilarity,
	containsMatch,
	commonPrefixLength,
	computeSimilarity,
	computeBestMatch,
} from "./mapper";
export type {
	MappingConfidence,
	MappingMatch,
	MappingResult,
	MappingOptions,
	ScoringResult,
} from "./mapper";

// Locale exports
export {
	// Registry
	getLocale,
	hasLocale,
	registerLocale,
	getLocaleIds,
	trLocale,
	enLocale,
	enGBLocale,
	deLocale,
	frLocale,
	// Parsers
	parseDate,
	validateDate,
	normalizeDateToISO,
	parseNumber,
	validateNumber,
	normalizeNumber,
	parseCurrency,
	validateCurrency,
	normalizeCurrency,
	parsePhone,
	validatePhone,
	normalizePhone,
	parseBoolean,
	validateBoolean,
	normalizeBoolean,
	daysInMonth,
	isLeapYear,
} from "./locale";
export type { LocaleConfig, ParsedDate, LocaleFieldType } from "./locale";

// Type exports
export * from "./types";
