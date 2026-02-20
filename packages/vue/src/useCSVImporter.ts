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
import { type Ref, computed, shallowRef, watch } from "vue";

import {
	canGoBack as checkCanGoBack,
	canGoForward as checkCanGoForward,
	createInitialState,
	importerReducer,
} from "./state-machine";
import type {
	CSVImporterReturn,
	ImportResult,
	ImportStats,
	ImporterState,
	ImporterStep,
	UseCSVImporterOptions,
} from "./types";

const BITMAP_THRESHOLD = 10_000;

export function useCSVImporter(options: UseCSVImporterOptions): CSVImporterReturn {
	const {
		schema,
		autoMap = true,
		autoMapThreshold = 0.8,
		maxPreviewRows = 10,
		maxRows,
		locale,
		onComplete,
		onError,
		onStepChange,
		delimiter,
		quote,
	} = options;
	const effectiveSchema = locale ? { ...schema, locale } : schema;

	const state = shallowRef<ImporterState>(createInitialState());
	let prevStep: ImporterStep = "idle";

	function dispatch(action: import("./types").ImporterAction) {
		const newState = importerReducer(state.value, action);
		state.value = newState;
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
				previewRows: maxPreviewRows,
			});

			const mappingResult = mapColumns(headers, effectiveSchema, {
				fuzzyThreshold: 0.6,
				autoAcceptThreshold: autoMapThreshold,
			});

			dispatch({ type: "SET_MAPPING", mapping: mappingResult });

			if (autoMap && shouldAutoMap(mappingResult, autoMapThreshold)) {
				const mappedData = applyMapping(data, mappingResult.mappings, effectiveSchema, {
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
		if (!state.value.rawData || !state.value.mapping) {
			return;
		}

		try {
			const mappedData = applyMapping(
				state.value.rawData,
				state.value.mapping.mappings,
				effectiveSchema,
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
				result = validateBitmap(data, effectiveSchema);
			} else {
				result = validate(data, effectiveSchema);
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
		if (state.value.step !== "review") {
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
		if (state.value.bitmapValidation) {
			return state.value.bitmapValidation.getErrors(options);
		}
		if (state.value.validation) {
			const { limit = 100, offset = 0 } = options ?? {};
			return state.value.validation.errors.slice(offset, offset + limit);
		}
		return [];
	}

	function getRowErrors(row: number): ValidationError[] {
		if (state.value.bitmapValidation) {
			return state.value.bitmapValidation.getRowErrors(row);
		}
		if (state.value.validation) {
			return state.value.validation.errors.filter((e) => e.row === row);
		}
		return [];
	}

	function getCellError(row: number, col: number): ValidationError | null {
		if (state.value.bitmapValidation) {
			return state.value.bitmapValidation.getCellError(row, col);
		}
		if (state.value.validation) {
			return state.value.validation.errors.find((e) => e.row === row && e.col === col) ?? null;
		}
		return null;
	}

	function getErrorSummary(): Record<string, number> {
		if (state.value.bitmapValidation) {
			return state.value.bitmapValidation.getErrorSummary();
		}
		if (state.value.validation) {
			return state.value.validation.stats.errorsByRule;
		}
		return {};
	}

	watch(
		() => state.value.step,
		(newStep: ImporterStep) => {
			if (prevStep !== newStep) {
				prevStep = newStep;
				onStepChange?.(newStep);
			}
		}
	);

	watch(
		() => state.value.error,
		(newError: string | null) => {
			if (newError && state.value.step === "error") {
				onError?.(newError);
			}
		}
	);

	watch(
		() => state.value.step,
		(step: ImporterStep) => {
			if (step === "complete" && onComplete) {
				const result = buildImportResult(
					{
						mappedData: state.value.mappedData,
						mapping: state.value.mapping,
						validation: state.value.validation,
						bitmapValidation: state.value.bitmapValidation,
						rowCount: state.value.rowCount,
						parseTime: state.value.parseTime,
						validationTime: state.value.validationTime,
					},
					effectiveSchema
				);
				if (result) {
					onComplete(result);
				}
			}
		}
	);

	const step = computed(() => state.value.step);
	const isLoading = computed(
		() => state.value.step === "parsing" || state.value.step === "validating"
	);
	const isComplete = computed(() => state.value.step === "complete");
	const hasErrors = computed(() => {
		if (state.value.bitmapValidation) {
			return state.value.bitmapValidation.errorCount > 0;
		}
		if (state.value.validation) {
			return state.value.validation.errors.length > 0;
		}
		return false;
	});
	const canGoBack = computed(() => checkCanGoBack(state.value.step));
	const canGoForward = computed(() => checkCanGoForward(state.value.step));

	return {
		get state() {
			return state.value;
		},
		step,
		isLoading,
		isComplete,
		hasErrors,
		canGoBack,
		canGoForward,
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
	};
}
