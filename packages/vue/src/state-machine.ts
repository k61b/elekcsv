import type { MappingMatch } from "@elekcsv/core";
import type { ImporterAction, ImporterState, ImporterStep } from "./types";

export function createInitialState(): ImporterState {
	return {
		step: "idle",

		rawData: null,
		headers: null,
		preview: null,
		rowCount: 0,

		mapping: null,
		mappedData: null,

		validation: null,
		bitmapValidation: null,

		file: null,
		fileName: null,
		fileSize: null,

		parseTime: null,
		validationTime: null,
		progress: 0,

		error: null,
	};
}

export function importerReducer(state: ImporterState, action: ImporterAction): ImporterState {
	switch (action.type) {
		case "LOAD_FILE": {
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

		case "PARSE_COMPLETE": {
			if (state.step !== "parsing") {
				return state;
			}
			return {
				...state,
				step: "mapping",
				rawData: action.data,
				headers: action.headers,
				preview: action.data.slice(0, action.previewRows ?? 10),
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

			const updatedMappings = state.mapping.mappings.map((m: MappingMatch): MappingMatch => {
				if (m.csvIndex === action.csvIndex) {
					return {
						...m,
						schemaColumn: action.schemaColumn ?? "",
						confidence: action.schemaColumn ? "exact" : "none",
						score: action.schemaColumn ? 1 : 0,
					};
				}
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

			const mappedSchemaColumns = new Set(
				updatedMappings
					.filter((m: MappingMatch) => m.schemaColumn)
					.map((m: MappingMatch) => m.schemaColumn)
			);
			const unmappedCsvColumns = updatedMappings
				.filter((m: MappingMatch) => !m.schemaColumn)
				.map((m: MappingMatch) => m.csvIndex);

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

function goBackStep(state: ImporterState): ImporterState {
	const { step } = state;

	switch (step) {
		case "mapping":
			return createInitialState();

		case "review":
			return {
				...state,
				step: "mapping",
				validation: null,
				bitmapValidation: null,
				validationTime: null,
			};

		case "complete":
			return {
				...state,
				step: "review",
			};

		case "error":
			return createInitialState();

		default:
			return state;
	}
}

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

export function canGoBack(step: ImporterStep): boolean {
	return getBackSteps(step).length > 0;
}

export function canGoForward(step: ImporterStep): boolean {
	return step === "mapping" || step === "review";
}
