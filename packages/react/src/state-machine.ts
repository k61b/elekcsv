import type { MappingMatch } from "@elekcsv/core";
import type { ImporterAction, ImporterState, ImporterStep } from "./types";

// ============================================================================
// Initial State
// ============================================================================

/**
 * Creates the initial importer state.
 */
export function createInitialState(): ImporterState {
	return {
		step: "idle",

		// Parse results
		rawData: null,
		headers: null,
		preview: null,
		rowCount: 0,

		// Mapping results
		mapping: null,
		mappedData: null,

		// Validation results
		validation: null,
		bitmapValidation: null,

		// File metadata
		file: null,
		fileName: null,
		fileSize: null,

		// Performance metrics
		parseTime: null,
		validationTime: null,
		progress: 0,

		// Error state
		error: null,
	};
}

// ============================================================================
// State Machine Reducer
// ============================================================================

/**
 * Pure reducer for the importer state machine.
 * Handles all state transitions based on actions.
 * Side-effects (file reading, parsing, validation) are handled in the hook.
 */
export function importerReducer(state: ImporterState, action: ImporterAction): ImporterState {
	switch (action.type) {
		// ============================================================
		// Loading Actions
		// ============================================================

		case "LOAD_FILE": {
			// Only allow loading from idle or error state
			if (state.step !== "idle" && state.step !== "error") {
				return state;
			}
			return {
				...createInitialState(),
				step: "parsing",
				file: action.file,
				fileName: action.file.name,
				fileSize: action.file.size,
			};
		}

		case "LOAD_STRING": {
			// Only allow loading from idle or error state
			if (state.step !== "idle" && state.step !== "error") {
				return state;
			}
			return {
				...createInitialState(),
				step: "parsing",
				fileName: action.fileName ?? "input.csv",
				fileSize: action.content.length,
			};
		}

		case "PARSE_START": {
			if (state.step !== "idle" && state.step !== "error") {
				return state;
			}
			return {
				...state,
				step: "parsing",
				progress: 0,
			};
		}

		// ============================================================
		// Parse Results
		// ============================================================

		case "PARSE_COMPLETE": {
			if (state.step !== "parsing") {
				return state;
			}
			return {
				...state,
				step: "mapping",
				rawData: action.data,
				headers: action.headers,
				preview: action.data.slice(0, 10), // First 10 data rows
				rowCount: action.data.length,
				parseTime: action.time,
				progress: 100,
			};
		}

		case "PARSE_ERROR": {
			if (state.step !== "parsing") {
				return state;
			}
			return {
				...state,
				step: "error",
				error: action.error,
			};
		}

		// ============================================================
		// Mapping Actions
		// ============================================================

		case "SET_MAPPING": {
			if (state.step !== "mapping") {
				return state;
			}
			return {
				...state,
				mapping: action.mapping,
			};
		}

		case "UPDATE_MAPPING": {
			if (state.step !== "mapping" || !state.mapping) {
				return state;
			}

			// Update the specific mapping
			const updatedMappings = state.mapping.mappings.map((m: MappingMatch): MappingMatch => {
				if (m.csvIndex === action.csvIndex) {
					return {
						...m,
						schemaColumn: action.schemaColumn ?? "",
						confidence: action.schemaColumn ? "exact" : "none",
						score: action.schemaColumn ? 1 : 0,
					};
				}
				// If another column was mapped to the same schema column, unmap it
				if (
					action.schemaColumn &&
					m.schemaColumn === action.schemaColumn &&
					m.csvIndex !== action.csvIndex
				) {
					return {
						...m,
						schemaColumn: "",
						confidence: "none",
						score: 0,
					};
				}
				return m;
			});

			// Recalculate unmapped columns
			const mappedSchemaColumns = new Set(
				updatedMappings
					.filter((m: MappingMatch) => m.schemaColumn)
					.map((m: MappingMatch) => m.schemaColumn)
			);
			const unmappedCsvColumns = updatedMappings
				.filter((m: MappingMatch) => !m.schemaColumn)
				.map((m: MappingMatch) => m.csvIndex);

			// Get all schema columns from current mappings to find unmapped ones
			const allSchemaColumns = new Set<string>();
			for (const m of state.mapping.mappings) {
				if (m.schemaColumn) allSchemaColumns.add(m.schemaColumn);
			}
			for (const col of state.mapping.unmappedSchemaColumns) {
				allSchemaColumns.add(col);
			}
			const unmappedSchemaColumns = Array.from(allSchemaColumns).filter(
				(col) => !mappedSchemaColumns.has(col)
			);

			return {
				...state,
				mapping: {
					...state.mapping,
					mappings: updatedMappings,
					unmappedCsvColumns,
					unmappedSchemaColumns,
					autoMapped: updatedMappings.filter(
						(m: MappingMatch) => m.confidence === "exact" || m.confidence === "alias"
					).length,
					needsReview: updatedMappings.filter((m: MappingMatch) => m.confidence === "fuzzy").length,
					unmapped: updatedMappings.filter((m: MappingMatch) => m.confidence === "none").length,
				},
			};
		}

		case "CONFIRM_MAPPING": {
			if (state.step !== "mapping") {
				return state;
			}
			return {
				...state,
				step: "validating",
				mappedData: action.mappedData,
				progress: 0,
			};
		}

		case "SKIP_MAPPING": {
			// Auto-map scenario: skip mapping step entirely
			if (state.step !== "mapping") {
				return state;
			}
			return {
				...state,
				step: "validating",
				mapping: action.mapping,
				mappedData: action.mappedData,
				progress: 0,
			};
		}

		// ============================================================
		// Validation Results
		// ============================================================

		case "VALIDATE_COMPLETE": {
			if (state.step !== "validating") {
				return state;
			}
			return {
				...state,
				step: "review",
				validation: action.isBitmap ? null : (action.result as ImporterState["validation"]),
				bitmapValidation: action.isBitmap
					? (action.result as ImporterState["bitmapValidation"])
					: null,
				validationTime: action.time,
				progress: 100,
			};
		}

		case "VALIDATE_ERROR": {
			if (state.step !== "validating") {
				return state;
			}
			return {
				...state,
				step: "error",
				error: action.error,
			};
		}

		// ============================================================
		// Final Actions
		// ============================================================

		case "ACCEPT": {
			if (state.step !== "review") {
				return state;
			}
			return {
				...state,
				step: "complete",
			};
		}

		case "RESET": {
			return createInitialState();
		}

		case "GO_BACK": {
			return goBackStep(state);
		}

		// ============================================================
		// Progress
		// ============================================================

		case "SET_PROGRESS": {
			if (state.step !== "parsing" && state.step !== "validating") {
				return state;
			}
			return {
				...state,
				progress: action.progress,
			};
		}

		default:
			return state;
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Returns the previous step in the import flow.
 * Transient states (parsing, validating) are skipped.
 */
function goBackStep(state: ImporterState): ImporterState {
	const { step } = state;

	switch (step) {
		case "mapping":
			// Can't go back from mapping without losing file - reset instead
			return createInitialState();

		case "review":
			// Go back to mapping
			return {
				...state,
				step: "mapping",
				validation: null,
				bitmapValidation: null,
				validationTime: null,
			};

		case "complete":
			// Go back to review
			return {
				...state,
				step: "review",
			};

		case "error":
			// Error state can reset
			return createInitialState();

		default:
			// idle, parsing, validating - no-op
			return state;
	}
}

/**
 * Checks if a step transition is valid.
 */
export function isValidTransition(from: ImporterStep, to: ImporterStep): boolean {
	const validTransitions: Record<ImporterStep, ImporterStep[]> = {
		idle: ["parsing"],
		parsing: ["mapping", "error"],
		mapping: ["validating", "idle", "error"],
		validating: ["review", "error"],
		review: ["complete", "mapping", "idle"],
		complete: ["review", "idle"],
		error: ["idle"],
	};

	return validTransitions[from]?.includes(to) ?? false;
}

/**
 * Gets the list of steps that can be reached via goBack from a given step.
 */
export function getBackSteps(step: ImporterStep): ImporterStep[] {
	switch (step) {
		case "mapping":
			return ["idle"];
		case "review":
			return ["mapping"];
		case "complete":
			return ["review"];
		case "error":
			return ["idle"];
		default:
			return [];
	}
}

/**
 * Checks if goBack is available from the current step.
 */
export function canGoBack(step: ImporterStep): boolean {
	return getBackSteps(step).length > 0;
}

/**
 * Checks if the step can proceed forward (has a next action available).
 */
export function canGoForward(step: ImporterStep): boolean {
	return step === "mapping" || step === "review";
}
