// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
	VALID: 0,
	REQUIRED: 1,
	TYPE: 2,
	MIN: 3,
	MAX: 4,
	PATTERN: 5,
	ENUM: 6,
	UNIQUE: 7,
	MIN_LENGTH: 8,
	MAX_LENGTH: 9,
	EMAIL: 10,
	CUSTOM: 11,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================================================
// Column & Schema Types
// ============================================================================

export type ColumnType =
	| "string"
	| "number"
	| "integer"
	| "date"
	| "boolean"
	| "enum"
	| "phone"
	| "currency";

export type Rule =
	| { rule: "required" }
	| { rule: "email" }
	| { rule: "unique" }
	| { rule: "min"; value: number }
	| { rule: "max"; value: number }
	| { rule: "minLength"; value: number }
	| { rule: "maxLength"; value: number }
	| { rule: "pattern"; value: RegExp }
	| { rule: "enum"; values: string[] }
	| { rule: "custom"; fn: (value: string) => boolean; message?: string };

export interface ColumnDef {
	type: ColumnType;
	rules?: Rule[];
	locale?: string;
	/** Alternative names that can be used to match CSV headers to this column */
	aliases?: string[];
}

export interface Schema {
	columns: Record<string, ColumnDef>;
	/** Default locale for all columns (can be overridden per column) */
	locale?: string;
}

// ============================================================================
// Importer State Machine
// ============================================================================

export type ImporterState =
	| "idle"
	| "parsing"
	| "parsed"
	| "mapping"
	| "validating"
	| "validated"
	| "complete"
	| "error";

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
	row: number;
	col: number;
	field: string;
	value: string;
	code: ErrorCode;
	message?: string;
}

export interface ValidationStats {
	totalRows: number;
	validRows: number;
	errorRows: number;
	errorsByRule: Record<string, number>;
	errorsByColumn: Record<string, number>;
}

export interface ValidationResult {
	valid: boolean;
	stats: ValidationStats;
	errors: ValidationError[];
	aborted: boolean;
}

// ============================================================================
// Column Mapping
// ============================================================================

export interface ColumnMapping {
	source: string;
	target: string;
	confidence?: number;
}

// ============================================================================
// Parse Options
// ============================================================================

export interface ParseOptions {
	/** Field delimiter. Default: ',' */
	delimiter?: string;
	/** Quote character for escaping. Default: '"' */
	quote?: string;
	/** Treat first row as header. Default: true */
	header?: boolean;
	/** Skip rows where all fields are empty. Default: false */
	skipEmptyLines?: boolean;
}

// ============================================================================
// Importer Config
// ============================================================================

export interface ImporterOptions {
	schema: Schema;
	locale?: string;
	parseOptions?: ParseOptions;
	maxErrors?: number;
}

// ============================================================================
// Progress & Callbacks
// ============================================================================

export interface ProgressInfo {
	phase: "parsing" | "validating";
	percent: number;
	processedRows: number;
	totalRows?: number;
}

export type OnProgressCallback = (info: ProgressInfo) => void;

// ============================================================================
// Importer Result
// ============================================================================

export interface ImporterResult {
	data: Record<string, unknown>[];
	validation: ValidationResult;
	mappings: ColumnMapping[];
}
