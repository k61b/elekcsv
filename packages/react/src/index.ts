// @elekcsv/react - Headless React hook for CSV import

// Main hook
export { useCSVImporter } from "./useCSVImporter";

// Types
export type {
	// Hook types
	ImporterStep,
	ImporterState,
	ImporterAction,
	UseCSVImporterOptions,
	UseCSVImporterReturn,
	ImportResult,
	ImportStats,
	// Re-exported from core
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
} from "./types";

// State machine utilities (for advanced use cases)
export {
	importerReducer,
	createInitialState,
	isValidTransition,
	canGoBack,
	canGoForward,
	getBackSteps,
} from "./state-machine";
