import { describe, expect, test } from "bun:test";
import type { BitmapValidationResult, MappingResult, ValidationResult } from "@elekcsv/core";
import {
	canGoBack,
	canGoForward,
	createInitialState,
	getBackSteps,
	importerReducer,
	isValidTransition,
} from "./state-machine";
import type { ImporterAction, ImporterState } from "./types";

// Mock factory for ValidationResult
function createMockValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
	return {
		valid: true,
		stats: {
			totalRows: 1,
			validRows: 1,
			errorRows: 0,
			errorsByRule: {},
			errorsByColumn: {},
		},
		errors: [],
		aborted: false,
		...overrides,
	};
}

// Mock factory for BitmapValidationResult
function createMockBitmapValidationResult(
	overrides: Partial<BitmapValidationResult> = {}
): BitmapValidationResult {
	return {
		valid: true,
		bitmap: {
			hasError: () => false,
			hasRowError: () => false,
			setError: () => {},
			countErrors: () => 0,
			countErrorRows: () => 0,
			getColumnErrors: () => [],
			getRowErrorColumns: () => [],
			forEachError: () => {},
			clear: () => {},
			byteSize: 0,
		},
		errorCodes: {
			setCode: () => {},
			getCode: () => 0,
			clear: () => {},
			byteSize: 0,
		},
		errorCount: 0,
		rowCount: 1000,
		colCount: 5,
		aborted: false,
		getErrors: () => [],
		getRowErrors: () => [],
		getCellError: () => null,
		getErrorSummary: () => ({}),
		getColumnErrorSummary: () => ({}),
		getErrorRowCount: () => 0,
		getMemoryUsage: () => ({ bitmap: 0, codes: 0, total: 0 }),
		...overrides,
	};
}

// ============================================================================
// Test Helpers
// ============================================================================

function createMockMappingResult(overrides: Partial<MappingResult> = {}): MappingResult {
	return {
		mappings: [
			{
				csvIndex: 0,
				csvHeader: "Name",
				schemaColumn: "name",
				confidence: "exact",
				score: 1,
			},
			{
				csvIndex: 1,
				csvHeader: "Email Address",
				schemaColumn: "email",
				confidence: "fuzzy",
				score: 0.85,
			},
		],
		unmappedCsvColumns: [],
		unmappedSchemaColumns: [],
		autoMapped: 1,
		needsReview: 1,
		unmapped: 0,
		...overrides,
	};
}

function createParsedState(): ImporterState {
	return {
		...createInitialState(),
		step: "mapping",
		rawData: [
			["John", "john@example.com"],
			["Jane", "jane@example.com"],
		],
		headers: ["Name", "Email Address"],
		preview: [
			["John", "john@example.com"],
			["Jane", "jane@example.com"],
		],
		rowCount: 2,
		parseTime: 5,
		fileName: "test.csv",
		fileSize: 100,
	};
}

// ============================================================================
// Initial State Tests
// ============================================================================

describe("createInitialState", () => {
	test("returns correct initial state", () => {
		const state = createInitialState();

		expect(state.step).toBe("idle");
		expect(state.rawData).toBeNull();
		expect(state.headers).toBeNull();
		expect(state.preview).toBeNull();
		expect(state.rowCount).toBe(0);
		expect(state.mapping).toBeNull();
		expect(state.mappedData).toBeNull();
		expect(state.validation).toBeNull();
		expect(state.bitmapValidation).toBeNull();
		expect(state.file).toBeNull();
		expect(state.fileName).toBeNull();
		expect(state.fileSize).toBeNull();
		expect(state.parseTime).toBeNull();
		expect(state.validationTime).toBeNull();
		expect(state.progress).toBe(0);
		expect(state.error).toBeNull();
	});
});

// ============================================================================
// Load Actions Tests
// ============================================================================

describe("LOAD_FILE action", () => {
	test("transitions from idle to parsing", () => {
		const state = createInitialState();
		const file = new File(["test"], "test.csv", { type: "text/csv" });

		const newState = importerReducer(state, { type: "LOAD_FILE", file });

		expect(newState.step).toBe("parsing");
		expect(newState.file).toBe(file);
		expect(newState.fileName).toBe("test.csv");
		expect(newState.fileSize).toBe(4);
	});

	test("transitions from error to parsing", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "error",
			error: "Previous error",
		};
		const file = new File(["test"], "test.csv", { type: "text/csv" });

		const newState = importerReducer(state, { type: "LOAD_FILE", file });

		expect(newState.step).toBe("parsing");
		expect(newState.error).toBeNull();
	});

	test("restarts parsing from mapping", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "mapping",
		};
		const file = new File(["test"], "test.csv", { type: "text/csv" });

		const newState = importerReducer(state, { type: "LOAD_FILE", file });

		expect(newState.step).toBe("parsing");
		expect(newState.file).toBe(file);
	});

	test("ignores action while parsing is in progress", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};
		const file = new File(["test"], "test.csv", { type: "text/csv" });

		const newState = importerReducer(state, { type: "LOAD_FILE", file });

		expect(newState.step).toBe("parsing");
	});
});

describe("LOAD_STRING action", () => {
	test("transitions from idle to parsing", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "LOAD_STRING",
			content: "name,email\nJohn,john@example.com",
			fileName: "data.csv",
		});

		expect(newState.step).toBe("parsing");
		expect(newState.fileName).toBe("data.csv");
		expect(newState.fileSize).toBe(32);
	});

	test("uses default filename when not provided", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "LOAD_STRING",
			content: "data",
		});

		expect(newState.fileName).toBe("input.csv");
	});
});

// ============================================================================
// Parse Actions Tests
// ============================================================================

describe("PARSE_COMPLETE action", () => {
	test("transitions from parsing to mapping", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
			fileName: "test.csv",
		};
		const data = [
			["John", "john@example.com"],
			["Jane", "jane@example.com"],
		];
		const headers = ["name", "email"];

		const newState = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data,
			headers,
			time: 10,
		});

		expect(newState.step).toBe("mapping");
		expect(newState.rawData).toEqual(data);
		expect(newState.headers).toEqual(headers);
		expect(newState.preview).toEqual(data); // All rows since < 10
		expect(newState.rowCount).toBe(2);
		expect(newState.parseTime).toBe(10);
		expect(newState.progress).toBe(100);
	});

	test("preview is limited to 10 rows", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};
		const data = Array.from({ length: 20 }, (_, i) => [`row${i}`]);

		const newState = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data,
			headers: ["col"],
			time: 5,
		});

		expect(newState.preview?.length).toBe(10);
		expect(newState.rowCount).toBe(20);
	});

	test("ignores action from non-parsing state", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data: [["test"]],
			headers: ["col"],
			time: 5,
		});

		expect(newState.step).toBe("idle");
		expect(newState.rawData).toBeNull();
	});
});

describe("PARSE_ERROR action", () => {
	test("transitions from parsing to error", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};

		const newState = importerReducer(state, {
			type: "PARSE_ERROR",
			error: "Invalid CSV format",
		});

		expect(newState.step).toBe("error");
		expect(newState.error).toBe("Invalid CSV format");
	});

	test("ignores action from non-parsing state", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "PARSE_ERROR",
			error: "Error",
		});

		expect(newState.step).toBe("idle");
		expect(newState.error).toBeNull();
	});
});

// ============================================================================
// Mapping Actions Tests
// ============================================================================

describe("SET_MAPPING action", () => {
	test("sets mapping in mapping state", () => {
		const state = createParsedState();
		const mapping = createMockMappingResult();

		const newState = importerReducer(state, { type: "SET_MAPPING", mapping });

		expect(newState.mapping).toEqual(mapping);
	});

	test("ignores action from non-mapping state", () => {
		const state = createInitialState();
		const mapping = createMockMappingResult();

		const newState = importerReducer(state, { type: "SET_MAPPING", mapping });

		expect(newState.mapping).toBeNull();
	});
});

describe("UPDATE_MAPPING action", () => {
	test("updates a single mapping", () => {
		const state: ImporterState = {
			...createParsedState(),
			mapping: createMockMappingResult(),
		};

		const newState = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 1,
			schemaColumn: "phone",
		});

		expect(newState.mapping?.mappings[1].schemaColumn).toBe("phone");
		expect(newState.mapping?.mappings[1].confidence).toBe("exact");
		expect(newState.mapping?.mappings[1].score).toBe(1);
	});

	test("unmaps when schemaColumn is null", () => {
		const state: ImporterState = {
			...createParsedState(),
			mapping: createMockMappingResult(),
		};

		const newState = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 0,
			schemaColumn: null,
		});

		expect(newState.mapping?.mappings[0].schemaColumn).toBe("");
		expect(newState.mapping?.mappings[0].confidence).toBe("none");
		expect(newState.mapping?.mappings[0].score).toBe(0);
	});

	test("unmaps previous column when mapping to same schema column", () => {
		const state: ImporterState = {
			...createParsedState(),
			mapping: createMockMappingResult(),
		};

		// Map column 1 to "name" which is already mapped to column 0
		const newState = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 1,
			schemaColumn: "name",
		});

		// Column 1 should now be mapped to "name"
		expect(newState.mapping?.mappings[1].schemaColumn).toBe("name");
		// Column 0 should be unmapped
		expect(newState.mapping?.mappings[0].schemaColumn).toBe("");
		expect(newState.mapping?.mappings[0].confidence).toBe("none");
	});

	test("recalculates unmapped columns", () => {
		const state: ImporterState = {
			...createParsedState(),
			mapping: createMockMappingResult({
				unmappedSchemaColumns: ["phone"],
			}),
		};

		const newState = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 1,
			schemaColumn: "phone",
		});

		expect(newState.mapping?.unmappedSchemaColumns).toContain("email");
	});

	test("ignores when no mapping exists", () => {
		const state = createParsedState();

		const newState = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 0,
			schemaColumn: "test",
		});

		expect(newState.mapping).toBeNull();
	});
});

describe("CONFIRM_MAPPING action", () => {
	test("transitions from mapping to validating", () => {
		const state: ImporterState = {
			...createParsedState(),
			mapping: createMockMappingResult(),
		};
		const mappedData = [
			["John", "john@example.com"],
			["Jane", "jane@example.com"],
		];

		const newState = importerReducer(state, {
			type: "CONFIRM_MAPPING",
			mappedData,
		});

		expect(newState.step).toBe("validating");
		expect(newState.mappedData).toEqual(mappedData);
		expect(newState.progress).toBe(0);
	});

	test("ignores action from non-mapping state", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "CONFIRM_MAPPING",
			mappedData: [],
		});

		expect(newState.step).toBe("idle");
	});
});

describe("SKIP_MAPPING action", () => {
	test("transitions from mapping to validating with auto-map", () => {
		const state = createParsedState();
		const mapping = createMockMappingResult();
		const mappedData = [["John", "john@example.com"]];

		const newState = importerReducer(state, {
			type: "SKIP_MAPPING",
			mapping,
			mappedData,
		});

		expect(newState.step).toBe("validating");
		expect(newState.mapping).toEqual(mapping);
		expect(newState.mappedData).toEqual(mappedData);
	});
});

// ============================================================================
// Validation Actions Tests
// ============================================================================

describe("VALIDATE_COMPLETE action", () => {
	test("transitions from validating to review with legacy result", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "validating",
			mapping: createMockMappingResult(),
			mappedData: [["John", "john@example.com"]],
		};
		const result = {
			valid: true,
			stats: {
				totalRows: 1,
				validRows: 1,
				errorRows: 0,
				errorsByRule: {},
				errorsByColumn: {},
			},
			errors: [],
			aborted: false,
		};

		const newState = importerReducer(state, {
			type: "VALIDATE_COMPLETE",
			result,
			time: 15,
			isBitmap: false,
		});

		expect(newState.step).toBe("review");
		expect(newState.validation).toEqual(result);
		expect(newState.bitmapValidation).toBeNull();
		expect(newState.validationTime).toBe(15);
		expect(newState.progress).toBe(100);
	});

	test("stores bitmap result when isBitmap is true", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "validating",
		};
		const bitmapResult = createMockBitmapValidationResult();

		const newState = importerReducer(state, {
			type: "VALIDATE_COMPLETE",
			result: bitmapResult,
			time: 30,
			isBitmap: true,
		});

		expect(newState.step).toBe("review");
		expect(newState.validation).toBeNull();
		expect(newState.bitmapValidation).toEqual(bitmapResult);
	});

	test("ignores action from non-validating state", () => {
		const state = createInitialState();

		const newState = importerReducer(state, {
			type: "VALIDATE_COMPLETE",
			result: createMockValidationResult(),
			time: 10,
			isBitmap: false,
		});

		expect(newState.step).toBe("idle");
		expect(newState.validation).toBeNull();
	});
});

describe("VALIDATE_ERROR action", () => {
	test("transitions from validating to error", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "validating",
		};

		const newState = importerReducer(state, {
			type: "VALIDATE_ERROR",
			error: "Schema mismatch",
		});

		expect(newState.step).toBe("error");
		expect(newState.error).toBe("Schema mismatch");
	});
});

// ============================================================================
// Final Actions Tests
// ============================================================================

describe("ACCEPT action", () => {
	test("transitions from review to complete", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "review",
			validation: {
				valid: true,
				stats: {
					totalRows: 1,
					validRows: 1,
					errorRows: 0,
					errorsByRule: {},
					errorsByColumn: {},
				},
				errors: [],
				aborted: false,
			},
		};

		const newState = importerReducer(state, { type: "ACCEPT" });

		expect(newState.step).toBe("complete");
	});

	test("ignores action from non-review state", () => {
		const state = createParsedState();

		const newState = importerReducer(state, { type: "ACCEPT" });

		expect(newState.step).toBe("mapping");
	});
});

describe("RESET action", () => {
	test("resets to initial state from any state", () => {
		const states: ImporterState[] = [
			createInitialState(),
			{ ...createInitialState(), step: "parsing" },
			createParsedState(),
			{ ...createParsedState(), step: "validating" },
			{ ...createParsedState(), step: "review" },
			{ ...createParsedState(), step: "complete" },
			{ ...createInitialState(), step: "error", error: "test" },
		];

		for (const state of states) {
			const newState = importerReducer(state, { type: "RESET" });

			expect(newState.step).toBe("idle");
			expect(newState.rawData).toBeNull();
			expect(newState.headers).toBeNull();
			expect(newState.mapping).toBeNull();
			expect(newState.error).toBeNull();
		}
	});
});

describe("GO_BACK action", () => {
	test("from mapping goes to idle", () => {
		const state = createParsedState();

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("idle");
	});

	test("from review goes to mapping", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "review",
			mapping: createMockMappingResult(),
			validation: createMockValidationResult(),
			validationTime: 10,
		};

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("mapping");
		expect(newState.validation).toBeNull();
		expect(newState.bitmapValidation).toBeNull();
		expect(newState.validationTime).toBeNull();
		// Preserve other state
		expect(newState.mapping).toEqual(state.mapping);
		expect(newState.rawData).toEqual(state.rawData);
	});

	test("from complete goes to review", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "complete",
		};

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("review");
	});

	test("from error resets to idle", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "error",
			error: "Some error",
		};

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("idle");
	});

	test("from idle is no-op", () => {
		const state = createInitialState();

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("idle");
	});

	test("from parsing is no-op", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("parsing");
	});

	test("from validating is no-op", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "validating",
		};

		const newState = importerReducer(state, { type: "GO_BACK" });

		expect(newState.step).toBe("validating");
	});
});

// ============================================================================
// Progress Tests
// ============================================================================

describe("SET_PROGRESS action", () => {
	test("updates progress during parsing", () => {
		const state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};

		const newState = importerReducer(state, {
			type: "SET_PROGRESS",
			progress: 50,
		});

		expect(newState.progress).toBe(50);
	});

	test("updates progress during validating", () => {
		const state: ImporterState = {
			...createParsedState(),
			step: "validating",
		};

		const newState = importerReducer(state, {
			type: "SET_PROGRESS",
			progress: 75,
		});

		expect(newState.progress).toBe(75);
	});

	test("ignores progress update in other states", () => {
		const state = createParsedState();

		const newState = importerReducer(state, {
			type: "SET_PROGRESS",
			progress: 50,
		});

		expect(newState.progress).toBe(0);
	});
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("isValidTransition", () => {
	test("validates correct transitions", () => {
		expect(isValidTransition("idle", "parsing")).toBe(true);
		expect(isValidTransition("parsing", "mapping")).toBe(true);
		expect(isValidTransition("parsing", "error")).toBe(true);
		expect(isValidTransition("mapping", "validating")).toBe(true);
		expect(isValidTransition("mapping", "idle")).toBe(true);
		expect(isValidTransition("validating", "review")).toBe(true);
		expect(isValidTransition("validating", "error")).toBe(true);
		expect(isValidTransition("review", "complete")).toBe(true);
		expect(isValidTransition("review", "mapping")).toBe(true);
		expect(isValidTransition("review", "parsing")).toBe(true);
		expect(isValidTransition("complete", "review")).toBe(true);
		expect(isValidTransition("complete", "idle")).toBe(true);
		expect(isValidTransition("complete", "parsing")).toBe(true);
		expect(isValidTransition("error", "idle")).toBe(true);
		expect(isValidTransition("error", "parsing")).toBe(true);
	});

	test("rejects invalid transitions", () => {
		expect(isValidTransition("idle", "mapping")).toBe(false);
		expect(isValidTransition("idle", "complete")).toBe(false);
		expect(isValidTransition("parsing", "complete")).toBe(false);
		expect(isValidTransition("mapping", "review")).toBe(false);
		expect(isValidTransition("validating", "mapping")).toBe(false);
		expect(isValidTransition("error", "complete")).toBe(false);
	});
});

describe("canGoBack", () => {
	test("returns true for valid go-back states", () => {
		expect(canGoBack("mapping")).toBe(true);
		expect(canGoBack("review")).toBe(true);
		expect(canGoBack("complete")).toBe(true);
		expect(canGoBack("error")).toBe(true);
	});

	test("returns false for states that cannot go back", () => {
		expect(canGoBack("idle")).toBe(false);
		expect(canGoBack("parsing")).toBe(false);
		expect(canGoBack("validating")).toBe(false);
	});
});

describe("canGoForward", () => {
	test("returns true for states with forward action", () => {
		expect(canGoForward("mapping")).toBe(true);
		expect(canGoForward("review")).toBe(true);
	});

	test("returns false for states without forward action", () => {
		expect(canGoForward("idle")).toBe(false);
		expect(canGoForward("parsing")).toBe(false);
		expect(canGoForward("validating")).toBe(false);
		expect(canGoForward("complete")).toBe(false);
		expect(canGoForward("error")).toBe(false);
	});
});

describe("getBackSteps", () => {
	test("returns correct back steps", () => {
		expect(getBackSteps("mapping")).toEqual(["idle"]);
		expect(getBackSteps("review")).toEqual(["mapping"]);
		expect(getBackSteps("complete")).toEqual(["review"]);
		expect(getBackSteps("error")).toEqual(["idle"]);
	});

	test("returns empty array for states that cannot go back", () => {
		expect(getBackSteps("idle")).toEqual([]);
		expect(getBackSteps("parsing")).toEqual([]);
		expect(getBackSteps("validating")).toEqual([]);
	});
});

// ============================================================================
// Full Flow Tests
// ============================================================================

describe("complete flow", () => {
	test("happy path: idle → parsing → mapping → validating → review → complete", () => {
		let state = createInitialState();
		expect(state.step).toBe("idle");

		// Load file
		const file = new File(["name,email\nJohn,john@test.com"], "test.csv");
		state = importerReducer(state, { type: "LOAD_FILE", file });
		expect(state.step).toBe("parsing");

		// Parse complete
		state = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data: [["John", "john@test.com"]],
			headers: ["name", "email"],
			time: 5,
		});
		expect(state.step).toBe("mapping");

		// Set mapping
		const mapping = createMockMappingResult();
		state = importerReducer(state, { type: "SET_MAPPING", mapping });
		expect(state.mapping).toEqual(mapping);

		// Confirm mapping
		state = importerReducer(state, {
			type: "CONFIRM_MAPPING",
			mappedData: [["John", "john@test.com"]],
		});
		expect(state.step).toBe("validating");

		// Validation complete
		state = importerReducer(state, {
			type: "VALIDATE_COMPLETE",
			result: {
				valid: true,
				stats: {
					totalRows: 1,
					validRows: 1,
					errorRows: 0,
					errorsByRule: {},
					errorsByColumn: {},
				},
				errors: [],
				aborted: false,
			},
			time: 10,
			isBitmap: false,
		});
		expect(state.step).toBe("review");

		// Accept
		state = importerReducer(state, { type: "ACCEPT" });
		expect(state.step).toBe("complete");
	});

	test("auto-map flow: skips mapping step", () => {
		let state = createInitialState();

		// Load file
		const file = new File(["test"], "test.csv");
		state = importerReducer(state, { type: "LOAD_FILE", file });

		// Parse complete
		state = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data: [["John", "john@test.com"]],
			headers: ["name", "email"],
			time: 5,
		});
		expect(state.step).toBe("mapping");

		// Skip mapping (auto-map)
		const mapping = createMockMappingResult();
		state = importerReducer(state, {
			type: "SKIP_MAPPING",
			mapping,
			mappedData: [["John", "john@test.com"]],
		});
		expect(state.step).toBe("validating");
		expect(state.mapping).toEqual(mapping);
	});

	test("error recovery: error → reset → idle", () => {
		let state: ImporterState = {
			...createInitialState(),
			step: "parsing",
		};

		// Parse error
		state = importerReducer(state, {
			type: "PARSE_ERROR",
			error: "Invalid CSV",
		});
		expect(state.step).toBe("error");
		expect(state.error).toBe("Invalid CSV");

		// Reset
		state = importerReducer(state, { type: "RESET" });
		expect(state.step).toBe("idle");
		expect(state.error).toBeNull();
	});

	test("go back from review to mapping, then forward again", () => {
		let state: ImporterState = {
			...createParsedState(),
			step: "review",
			mapping: createMockMappingResult(),
			mappedData: [["John", "john@test.com"]],
			validation: {
				valid: false,
				stats: {
					totalRows: 1,
					validRows: 0,
					errorRows: 1,
					errorsByRule: { required: 1 },
					errorsByColumn: { email: 1 },
				},
				errors: [
					{
						row: 0,
						col: 1,
						field: "email",
						value: "",
						code: 1,
						message: "Required",
					},
				],
				aborted: false,
			},
			validationTime: 10,
		};

		// Go back to mapping
		state = importerReducer(state, { type: "GO_BACK" });
		expect(state.step).toBe("mapping");
		expect(state.validation).toBeNull();
		expect(state.mapping).not.toBeNull(); // Preserved

		// Update mapping and confirm again
		state = importerReducer(state, {
			type: "UPDATE_MAPPING",
			csvIndex: 1,
			schemaColumn: "phone",
		});
		expect(state.mapping?.mappings[1].schemaColumn).toBe("phone");

		// Confirm and proceed
		state = importerReducer(state, {
			type: "CONFIRM_MAPPING",
			mappedData: [["John", "john@test.com"]],
		});
		expect(state.step).toBe("validating");
	});
});
