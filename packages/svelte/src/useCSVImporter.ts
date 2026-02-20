import {
	type BitmapValidationResult,
	type ValidationError,
	type ValidationResult,
	applyMapping,
	buildImportResult,
	mapColumns,
	parse,
	shouldAutoMap,
	validate,
	validateBitmap,
} from "@elekcsv/core";
import { type Readable, type Writable, readable, writable } from "svelte/store";

import {
	canGoBack as checkCanGoBack,
	canGoForward as checkCanGoForward,
	createInitialState,
	importerReducer,
} from "./state-machine";
import type {
	CSVImporter,
	ImportResult,
	ImportStats,
	ImporterState,
	ImporterStep,
	UseCSVImporterOptions,
} from "./types";

const BITMAP_THRESHOLD = 10_000;

export function createCSVImporter(options: UseCSVImporterOptions): CSVImporter {
	const {
		schema,
		autoMap = true,
		autoMapThreshold = 0.8,
		maxRows,
		onComplete,
		onError,
		onStepChange,
		delimiter,
		quote,
	} = options;

	const store = writable<ImporterState>(createInitialState());
	let prevStep: ImporterStep = "idle";

	const unsubscribe = store.subscribe((state) => {
		if (prevStep !== state.step) {
			prevStep = state.step;
			onStepChange?.(state.step);
		}

		if (state.step === "error" && state.error) {
			onError?.(state.error);
		}

		if (state.step === "complete" && onComplete) {
			const result = buildImportResult(
				{
					mappedData: state.mappedData,
					mapping: state.mapping,
					validation: state.validation,
					bitmapValidation: state.bitmapValidation,
					rowCount: state.rowCount,
					parseTime: state.parseTime,
					validationTime: state.validationTime,
				},
				schema
			);
			if (result) {
				onComplete(result);
			}
		}
	});

	let stateSnapshot: ImporterState = createInitialState();
	store.subscribe((s) => {
		stateSnapshot = s;
	});

	function dispatch(action: import("./types").ImporterAction) {
		const newState = importerReducer(stateSnapshot, action);
		store.set(newState);
	}

	function processContent(content: string) {
		try {
			const startTime = performance.now();

			const parseResult = parse(content, {
				delimiter,
				quote,
				header: true,
			});

			const parseTime = performance.now() - startTime;
			const headers = parseResult.headers ?? [];
			let data = parseResult.rows;

			if (maxRows && data.length > maxRows) {
				data = data.slice(0, maxRows);
			}

			dispatch({
				type: "PARSE_COMPLETE",
				data,
				headers,
				time: parseTime,
			});

			const mappingResult = mapColumns(headers, schema, {
				fuzzyThreshold: 0.6,
				autoAcceptThreshold: autoMapThreshold,
			});

			dispatch({ type: "SET_MAPPING", mapping: mappingResult });

			if (autoMap && shouldAutoMap(mappingResult, autoMapThreshold)) {
				const mappedData = applyMapping(data, mappingResult.mappings, schema, {
					hasHeader: false,
				});
				dispatch({
					type: "SKIP_MAPPING",
					mapping: mappingResult,
					mappedData,
				});

				runValidation(mappedData);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Unknown parse error";
			dispatch({ type: "PARSE_ERROR", error: errorMessage });
		}
	}

	function loadFile(file: File) {
		dispatch({ type: "LOAD_FILE", file });

		const reader = new FileReader();

		reader.onload = (e: ProgressEvent<FileReader>) => {
			const content = e.target?.result as string;
			if (content) {
				processContent(content);
			} else {
				dispatch({ type: "PARSE_ERROR", error: "Failed to read file content" });
			}
		};

		reader.onerror = () => {
			dispatch({ type: "PARSE_ERROR", error: "Failed to read file" });
		};

		reader.readAsText(file);
	}

	function loadString(content: string, fileName?: string) {
		dispatch({ type: "LOAD_STRING", content, fileName });
		processContent(content);
	}

	function updateMapping(csvIndex: number, schemaColumn: string | null) {
		dispatch({ type: "UPDATE_MAPPING", csvIndex, schemaColumn });
	}

	function confirmMapping() {
		if (!stateSnapshot.rawData || !stateSnapshot.mapping) {
			return;
		}

		try {
			const mappedData = applyMapping(
				stateSnapshot.rawData,
				stateSnapshot.mapping.mappings,
				schema,
				{
					hasHeader: false,
				}
			);

			dispatch({ type: "CONFIRM_MAPPING", mappedData });

			runValidation(mappedData);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Failed to apply mapping";
			dispatch({ type: "VALIDATE_ERROR", error: errorMessage });
		}
	}

	function runValidation(data: string[][]) {
		try {
			const startTime = performance.now();
			const useBitmap = data.length > BITMAP_THRESHOLD;

			let result: ValidationResult | BitmapValidationResult;
			if (useBitmap) {
				result = validateBitmap(data, schema);
			} else {
				result = validate(data, schema);
			}

			const validationTime = performance.now() - startTime;

			dispatch({
				type: "VALIDATE_COMPLETE",
				result,
				time: validationTime,
				isBitmap: useBitmap,
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Validation failed";
			dispatch({ type: "VALIDATE_ERROR", error: errorMessage });
		}
	}

	function accept() {
		if (stateSnapshot.step !== "review") {
			return;
		}
		dispatch({ type: "ACCEPT" });
	}

	function reset() {
		dispatch({ type: "RESET" });
	}

	function goBack() {
		dispatch({ type: "GO_BACK" });
	}

	function getErrors(options?: { limit?: number; offset?: number }): ValidationError[] {
		if (stateSnapshot.bitmapValidation) {
			return stateSnapshot.bitmapValidation.getErrors(options);
		}
		if (stateSnapshot.validation) {
			const { limit = 100, offset = 0 } = options ?? {};
			return stateSnapshot.validation.errors.slice(offset, offset + limit);
		}
		return [];
	}

	function getRowErrors(row: number): ValidationError[] {
		if (stateSnapshot.bitmapValidation) {
			return stateSnapshot.bitmapValidation.getRowErrors(row);
		}
		if (stateSnapshot.validation) {
			return stateSnapshot.validation.errors.filter((e) => e.row === row);
		}
		return [];
	}

	function getCellError(row: number, col: number): ValidationError | null {
		if (stateSnapshot.bitmapValidation) {
			return stateSnapshot.bitmapValidation.getCellError(row, col);
		}
		if (stateSnapshot.validation) {
			return stateSnapshot.validation.errors.find((e) => e.row === row && e.col === col) ?? null;
		}
		return null;
	}

	function getErrorSummary(): Record<string, number> {
		if (stateSnapshot.bitmapValidation) {
			return stateSnapshot.bitmapValidation.getErrorSummary();
		}
		if (stateSnapshot.validation) {
			return stateSnapshot.validation.stats.errorsByRule;
		}
		return {};
	}

	function destroy() {
		unsubscribe();
	}

	return {
		store,
		get state() {
			return stateSnapshot;
		},
		get step() {
			return stateSnapshot.step;
		},
		get isLoading() {
			return stateSnapshot.step === "parsing" || stateSnapshot.step === "validating";
		},
		get isComplete() {
			return stateSnapshot.step === "complete";
		},
		get hasErrors() {
			if (stateSnapshot.bitmapValidation) {
				return stateSnapshot.bitmapValidation.errorCount > 0;
			}
			if (stateSnapshot.validation) {
				return stateSnapshot.validation.errors.length > 0;
			}
			return false;
		},
		get canGoBack() {
			return checkCanGoBack(stateSnapshot.step);
		},
		get canGoForward() {
			return checkCanGoForward(stateSnapshot.step);
		},
		loadFile,
		loadString,
		updateMapping,
		confirmMapping,
		accept,
		reset,
		goBack,
		getErrors,
		getRowErrors,
		getCellError,
		getErrorSummary,
		destroy,
	};
}

export function createCSVImporterStore(options: UseCSVImporterOptions): Readable<ImporterState> {
	const importer = createCSVImporter(options);
	return {
		subscribe: (run) => {
			const unsub = importer.store.subscribe(run);
			return () => {
				unsub();
				importer.destroy();
			};
		},
	};
}
