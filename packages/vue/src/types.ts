import type {
	BitmapValidationResult,
	MappingMatch,
	MappingResult,
	Schema,
	ValidationError,
	ValidationResult,
} from "@elekcsv/core";

export type ImporterStep =
	| "idle"
	| "parsing"
	| "mapping"
	| "validating"
	| "review"
	| "complete"
	| "error";

export interface ImporterState {
	step: ImporterStep;
	rawData: string[][] | null;
	headers: string[] | null;
	preview: string[][] | null;
	rowCount: number;
	mapping: MappingResult | null;
	mappedData: string[][] | null;
	validation: ValidationResult | null;
	bitmapValidation: BitmapValidationResult | null;
	file: File | null;
	fileName: string | null;
	fileSize: number | null;
	parseTime: number | null;
	validationTime: number | null;
	progress: number;
	error: string | null;
}

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

export interface UseCSVImporterOptions {
	schema: Schema;
	autoMap?: boolean;
	autoMapThreshold?: number;
	maxPreviewRows?: number;
	maxRows?: number;
	locale?: string;
	onComplete?: (result: ImportResult) => void;
	onError?: (error: string) => void;
	onStepChange?: (step: ImporterStep) => void;
	delimiter?: string;
	quote?: string;
}

export interface ImportResult {
	data: string[][];
	headers: string[];
	mapping: MappingResult;
	validation: ValidationResult | BitmapValidationResult;
	stats: ImportStats;
}

export interface ImportStats {
	totalRows: number;
	validRows: number;
	invalidRows: number;
	errorCount: number;
	parseTime: number;
	validationTime: number;
}

export interface CSVImporterReturn {
	state: ImporterState;
	step: import("vue").Ref<ImporterStep>;
	isLoading: import("vue").Ref<boolean>;
	isComplete: import("vue").Ref<boolean>;
	hasErrors: import("vue").Ref<boolean>;
	canGoBack: import("vue").Ref<boolean>;
	canGoForward: import("vue").Ref<boolean>;
	loadFile: (file: File) => void;
	loadString: (content: string, fileName?: string) => void;
	updateMapping: (csvIndex: number, schemaColumn: string | null) => void;
	confirmMapping: () => void;
	accept: () => void;
	reset: () => void;
	goBack: () => void;
	getErrors: (options?: { limit?: number; offset?: number }) => ValidationError[];
	getRowErrors: (row: number) => ValidationError[];
	getCellError: (row: number, col: number) => ValidationError | null;
	getErrorSummary: () => Record<string, number>;
}

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
