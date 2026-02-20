import type {
	BitmapValidationResult,
	MappingMatch,
	MappingResult,
	Schema,
	ValidationError,
	ValidationResult,
} from "@elekcsv/core";

// ============================================================================
// Importer Step (State Machine States)
// ============================================================================

/**
 * The current step in the CSV import process.
 * - 'idle': Initial state, waiting for file
 * - 'parsing': File is being parsed
 * - 'mapping': Column mapping in progress (waiting for user confirmation)
 * - 'validating': Data is being validated
 * - 'review': Validation complete, showing errors for review
 * - 'complete': Import completed successfully
 * - 'error': Unrecoverable error occurred
 */
export type ImporterStep =
	| "idle"
	| "parsing"
	| "mapping"
	| "validating"
	| "review"
	| "complete"
	| "error";

// ============================================================================
// Importer State
// ============================================================================

/**
 * Complete state of the CSV importer.
 */
export interface ImporterState {
	/** Current step in the import process */
	step: ImporterStep;

	// Parse results (populated after parsing)
	/** Parsed raw data including header */
	rawData: string[][] | null;
	/** Headers from the CSV (first row) */
	headers: string[] | null;
	/** Preview rows for display (first N rows) */
	preview: string[][] | null;
	/** Total row count excluding header */
	rowCount: number;

	// Mapping results (populated after mapping)
	/** Column mapping result */
	mapping: MappingResult | null;
	/** Data reordered to match schema column order */
	mappedData: string[][] | null;

	// Validation results (populated after validation)
	/** Object-based validation result (for small datasets) */
	validation: ValidationResult | null;
	/** Bitmap-based validation result (for large datasets) */
	bitmapValidation: BitmapValidationResult | null;

	// File metadata
	/** The file being imported */
	file: File | null;
	/** Name of the file */
	fileName: string | null;
	/** Size of the file in bytes */
	fileSize: number | null;

	// Performance metrics
	/** Time taken to parse in milliseconds */
	parseTime: number | null;
	/** Time taken to validate in milliseconds */
	validationTime: number | null;
	/** Progress percentage (0-100) for large files */
	progress: number;

	// Error state
	/** Error message if in error state */
	error: string | null;
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Actions that can be dispatched to the importer state machine.
 */
export type ImporterAction =
	| { type: "LOAD_FILE"; file: File }
	| { type: "LOAD_STRING"; content: string; fileName?: string }
	| { type: "PARSE_START" }
	| {
			type: "PARSE_COMPLETE";
			data: string[][];
			headers: string[];
			time: number;
	  }
	| { type: "PARSE_ERROR"; error: string }
	| { type: "SET_MAPPING"; mapping: MappingResult }
	| { type: "UPDATE_MAPPING"; csvIndex: number; schemaColumn: string | null }
	| { type: "CONFIRM_MAPPING"; mappedData: string[][] }
	| { type: "SKIP_MAPPING"; mapping: MappingResult; mappedData: string[][] }
	| {
			type: "VALIDATE_COMPLETE";
			result: ValidationResult | BitmapValidationResult;
			time: number;
			isBitmap: boolean;
	  }
	| { type: "VALIDATE_ERROR"; error: string }
	| { type: "ACCEPT" }
	| { type: "RESET" }
	| { type: "GO_BACK" }
	| { type: "SET_PROGRESS"; progress: number };

// ============================================================================
// Hook Options
// ============================================================================

/**
 * Options for the useCSVImporter hook.
 */
export interface UseCSVImporterOptions {
	/** Schema defining the expected columns and validation rules */
	schema: Schema;

	// Behavior options
	/** Whether to automatically proceed past mapping if all columns match with high confidence. Default: true */
	autoMap?: boolean;
	/** Minimum confidence score to auto-accept mapping. Default: 0.8 */
	autoMapThreshold?: number;
	/** Maximum rows to include in preview. Default: 10 */
	maxPreviewRows?: number;
	/** Maximum rows to process. Optional. */
	maxRows?: number;
	/** Locale for parsing (dates, numbers, etc.). Default: schema locale or 'en' */
	locale?: string;

	// Callbacks
	/** Called when import completes successfully */
	onComplete?: (result: ImportResult) => void;
	/** Called when an error occurs */
	onError?: (error: string) => void;
	/** Called when the step changes */
	onStepChange?: (step: ImporterStep) => void;

	// Parser options (pass-through to core parser)
	/** CSV field delimiter. Default: ',' */
	delimiter?: string;
	/** Quote character for escaping. Default: '"' */
	quote?: string;

	// Worker options
	/** Use Web Worker for parsing/validation (useful for large files) */
	useWorker?: boolean;
}

// ============================================================================
// Import Result
// ============================================================================

/**
 * Final result of a successful import.
 */
export interface ImportResult {
	/** Mapped and validated data (without header row) */
	data: string[][];
	/** Headers in schema column order */
	headers: string[];
	/** Column mapping that was applied */
	mapping: MappingResult;
	/** Validation result */
	validation: ValidationResult | BitmapValidationResult;
	/** Import statistics */
	stats: ImportStats;
}

/**
 * Statistics about the import process.
 */
export interface ImportStats {
	/** Total number of data rows */
	totalRows: number;
	/** Number of rows without errors */
	validRows: number;
	/** Number of rows with errors */
	invalidRows: number;
	/** Total number of errors */
	errorCount: number;
	/** Time taken to parse in milliseconds */
	parseTime: number;
	/** Time taken to validate in milliseconds */
	validationTime: number;
}

// ============================================================================
// Hook Return Type
// ============================================================================

/**
 * Return type of the useCSVImporter hook.
 */
export interface UseCSVImporterReturn {
	// State (read-only)
	/** Complete importer state */
	state: ImporterState;
	/** Current step shorthand */
	step: ImporterStep;

	// Computed values
	/** Whether parsing or validating is in progress */
	isLoading: boolean;
	/** Whether import is complete */
	isComplete: boolean;
	/** Whether there are validation errors */
	hasErrors: boolean;
	/** Whether going back is possible */
	canGoBack: boolean;
	/** Whether going forward is possible */
	canGoForward: boolean;

	// Actions
	/** Load a CSV file */
	loadFile: (file: File) => void;
	/** Load CSV from string */
	loadString: (content: string, fileName?: string) => void;
	/** Update a column mapping */
	updateMapping: (csvIndex: number, schemaColumn: string | null) => void;
	/** Confirm the current mapping and proceed to validation */
	confirmMapping: () => void;
	/** Accept errors and complete the import */
	accept: () => void;
	/** Reset to initial state */
	reset: () => void;
	/** Go back to previous step */
	goBack: () => void;
	/** Cancel current operation (parsing/validating) */
	cancel: () => void;

	// Data accessors
	/** Get validation errors with pagination */
	getErrors: (options?: { limit?: number; offset?: number }) => ValidationError[];
	/** Get all errors for a specific row */
	getRowErrors: (row: number) => ValidationError[];
	/** Get error for a specific cell */
	getCellError: (row: number, col: number) => ValidationError | null;
	/** Get error count by rule name */
	getErrorSummary: () => Record<string, number>;
}

// Re-export types from core that users will need
export type {
	Schema,
	ColumnDef,
	ColumnType,
	Rule,
	ValidationError,
	ValidationResult,
	BitmapValidationResult,
	MappingMatch,
	MappingResult,
	MappingConfidence,
} from "@elekcsv/core";
