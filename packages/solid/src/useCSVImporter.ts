import {
	type BitmapValidationResult,
	type ValidationError,
	type ValidationResult,
	applyMapping,
	mapColumns,
	parse,
	validate,
	validateBitmap,
} from "@elekcsv/core";
import { createMemo, createSignal, onCleanup } from "solid-js";

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

function buildImportResult(
	state: ImporterState,
	schema: import("@elekcsv/core").Schema
): ImportResult | null {
	if (!state.mappedData || !state.mapping) return null;
	const validation = state.validation ?? state.bitmapValidation;
	if (!validation) return null;

	const schemaColumns = Object.keys(schema.columns);
	const errorCount = state.bitmapValidation
		? state.bitmapValidation.errorCount
		: (state.validation?.errors.length ?? 0);
	const errorRowCount = state.bitmapValidation
		? state.bitmapValidation.getErrorRowCount()
		: new Set(state.validation?.errors.map((e) => e.row)).size;

	const stats: ImportStats = {
		totalRows: state.rowCount,
		validRows: state.rowCount - errorRowCount,
		invalidRows: errorRowCount,
		errorCount,
		parseTime: state.parseTime ?? 0,
		validationTime: state.validationTime ?? 0,
	};

	return {
		data: state.mappedData,
		headers: schemaColumns,
		mapping: state.mapping,
		validation,
		stats,
	};
}

function shouldAutoMap(result: ReturnType<typeof mapColumns>, threshold: number): boolean {
	if (result.unmappedSchemaColumns.length > 0) return false;
	for (const mapping of result.mappings) {
		if (mapping.schemaColumn === "") continue;
		if (mapping.confidence === "exact" || mapping.confidence === "alias") continue;
		if (mapping.confidence === "fuzzy" && mapping.score >= threshold) continue;
		return false;
	}
	return true;
}

export function useCSVImporter(options: UseCSVImporterOptions): CSVImporterReturn {
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

	const [state, setState] = createSignal<ImporterState>(createInitialState());
	let prevStep: ImporterStep = "idle";

	function dispatch(action: import("./types").ImporterAction) {
		setState((s) => importerReducer(s, action));
	}

	function processContent(content: string) {
		try {
			const startTime = performance.now();
			const parseResult = parse(content, { delimiter, quote, header: true });
			const parseTime = performance.now() - startTime;
			const headers = parseResult.headers ?? [];
			let data = parseResult.rows;
			if (maxRows && data.length > maxRows) data = data.slice(0, maxRows);

			dispatch({ type: "PARSE_COMPLETE", data, headers, time: parseTime });

			const mappingResult = mapColumns(headers, schema, {
				fuzzyThreshold: 0.6,
				autoAcceptThreshold: autoMapThreshold,
			});
			dispatch({ type: "SET_MAPPING", mapping: mappingResult });

			if (autoMap && shouldAutoMap(mappingResult, autoMapThreshold)) {
				const mappedData = applyMapping(data, mappingResult.mappings, schema, { hasHeader: false });
				dispatch({ type: "SKIP_MAPPING", mapping: mappingResult, mappedData });
				runValidation(mappedData);
			}
		} catch (err) {
			dispatch({
				type: "PARSE_ERROR",
				error: err instanceof Error ? err.message : "Unknown parse error",
			});
		}
	}

	function loadFile(file: File) {
		dispatch({ type: "LOAD_FILE", file });
		const reader = new FileReader();
		reader.onload = (e: ProgressEvent<FileReader>) => {
			const content = e.target?.result as string;
			if (content) processContent(content);
			else dispatch({ type: "PARSE_ERROR", error: "Failed to read file content" });
		};
		reader.onerror = () => dispatch({ type: "PARSE_ERROR", error: "Failed to read file" });
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
		const s = state();
		if (!s.rawData || !s.mapping) return;
		try {
			const mappedData = applyMapping(s.rawData, s.mapping.mappings, schema, { hasHeader: false });
			dispatch({ type: "CONFIRM_MAPPING", mappedData });
			runValidation(mappedData);
		} catch (err) {
			dispatch({
				type: "VALIDATE_ERROR",
				error: err instanceof Error ? err.message : "Failed to apply mapping",
			});
		}
	}

	function runValidation(data: string[][]) {
		try {
			const startTime = performance.now();
			const useBitmap = data.length > BITMAP_THRESHOLD;
			const result: ValidationResult | BitmapValidationResult = useBitmap
				? validateBitmap(data, schema)
				: validate(data, schema);
			const validationTime = performance.now() - startTime;
			dispatch({ type: "VALIDATE_COMPLETE", result, time: validationTime, isBitmap: useBitmap });
		} catch (err) {
			dispatch({
				type: "VALIDATE_ERROR",
				error: err instanceof Error ? err.message : "Validation failed",
			});
		}
	}

	function accept() {
		if (state().step === "review") dispatch({ type: "ACCEPT" });
	}

	function reset() {
		dispatch({ type: "RESET" });
	}

	function goBack() {
		dispatch({ type: "GO_BACK" });
	}

	function getErrors(options?: { limit?: number; offset?: number }): ValidationError[] {
		const s = state();
		if (s.bitmapValidation) return s.bitmapValidation.getErrors(options);
		if (s.validation) {
			const { limit = 100, offset = 0 } = options ?? {};
			return s.validation.errors.slice(offset, offset + limit);
		}
		return [];
	}

	function getRowErrors(row: number): ValidationError[] {
		const s = state();
		if (s.bitmapValidation) return s.bitmapValidation.getRowErrors(row);
		if (s.validation) return s.validation.errors.filter((e) => e.row === row);
		return [];
	}

	function getCellError(row: number, col: number): ValidationError | null {
		const s = state();
		if (s.bitmapValidation) return s.bitmapValidation.getCellError(row, col);
		if (s.validation)
			return s.validation.errors.find((e) => e.row === row && e.col === col) ?? null;
		return null;
	}

	function getErrorSummary(): Record<string, number> {
		const s = state();
		if (s.bitmapValidation) return s.bitmapValidation.getErrorSummary();
		if (s.validation) return s.validation.stats.errorsByRule;
		return {};
	}

	const step = createMemo(() => state().step);
	const isLoading = createMemo(() => {
		const s = state();
		return s.step === "parsing" || s.step === "validating";
	});
	const isComplete = createMemo(() => state().step === "complete");
	const hasErrors = createMemo(() => {
		const s = state();
		if (s.bitmapValidation) return s.bitmapValidation.errorCount > 0;
		if (s.validation) return s.validation.errors.length > 0;
		return false;
	});
	const canGoBack = createMemo(() => checkCanGoBack(state().step));
	const canGoForward = createMemo(() => checkCanGoForward(state().step));

	createMemo(() => {
		const s = state();
		if (prevStep !== s.step) {
			prevStep = s.step;
			onStepChange?.(s.step);
		}
		if (s.step === "error" && s.error) onError?.(s.error);
		if (s.step === "complete" && onComplete) {
			const result = buildImportResult(s, schema);
			if (result) onComplete(result);
		}
	});

	return {
		get state() {
			return state();
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
