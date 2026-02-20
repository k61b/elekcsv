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
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
	canGoBack as checkCanGoBack,
	canGoForward as checkCanGoForward,
	createInitialState,
	importerReducer,
} from "./state-machine";
import type {
	ImportResult,
	ImportStats,
	ImporterStep,
	UseCSVImporterOptions,
	UseCSVImporterReturn,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Row count threshold for switching to bitmap validation */
const BITMAP_THRESHOLD = 10_000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for CSV import with parsing, column mapping, and validation.
 * Provides a headless state machine for building custom import UIs.
 *
 * @example
 * ```tsx
 * const importer = useCSVImporter({
 *   schema: {
 *     columns: {
 *       name: { type: 'string', rules: [{ rule: 'required' }] },
 *       email: { type: 'string', rules: [{ rule: 'email' }] },
 *     }
 *   },
 *   onComplete: (result) => console.log('Import complete:', result)
 * });
 *
 * // In your component:
 * <input type="file" onChange={(e) => {
 *   if (e.target.files?.[0]) importer.loadFile(e.target.files[0]);
 * }} />
 * ```
 */
export function useCSVImporter(options: UseCSVImporterOptions): UseCSVImporterReturn {
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

	// State management
	const [state, dispatch] = useReducer(importerReducer, undefined, createInitialState);

	// Track previous step for onStepChange callback
	const prevStepRef = useRef<ImporterStep>(state.step);

	// Track pending content for string loading
	const pendingContentRef = useRef<string | null>(null);

	// Track current operation for cancellation
	const abortControllerRef = useRef<AbortController | null>(null);

	// Track if current operation was cancelled
	const cancelledRef = useRef(false);

	// ============================================================
	// Step change callback
	// ============================================================

	useEffect(() => {
		if (prevStepRef.current !== state.step) {
			prevStepRef.current = state.step;
			onStepChange?.(state.step);
		}
	}, [state.step, onStepChange]);

	// ============================================================
	// Error callback
	// ============================================================

	useEffect(() => {
		if (state.step === "error" && state.error) {
			onError?.(state.error);
		}
	}, [state.step, state.error, onError]);

	// ============================================================
	// File Loading
	// ============================================================

	const loadFile = useCallback((file: File) => {
		dispatch({ type: "LOAD_FILE", file });

		// Read file content
		const reader = new FileReader();

		reader.onload = (e) => {
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
	}, []);

	const loadString = useCallback((content: string, fileName?: string) => {
		dispatch({ type: "LOAD_STRING", content, fileName });
		pendingContentRef.current = content;
	}, []);

	// Process pending string content
	useEffect(() => {
		if (state.step === "parsing" && pendingContentRef.current) {
			const content = pendingContentRef.current;
			pendingContentRef.current = null;
			processContent(content);
		}
	}, [state.step]);

	// ============================================================
	// Content Processing (Parse + Initial Mapping)
	// ============================================================

	const processContent = useCallback(
		(content: string) => {
			// Create new abort controller for this operation
			abortControllerRef.current = new AbortController();
			cancelledRef.current = false;

			try {
				const startTime = performance.now();

				// Check if cancelled before parsing
				if (cancelledRef.current) {
					return;
				}

				// Parse CSV
				const parseResult = parse(content, {
					delimiter,
					quote,
					header: true,
				});

				const parseTime = performance.now() - startTime;
				const headers = parseResult.headers ?? [];
				let data = parseResult.rows;

				// Apply maxRows limit if specified
				if (maxRows && data.length > maxRows) {
					data = data.slice(0, maxRows);
				}

				// Dispatch parse complete
				dispatch({
					type: "PARSE_COMPLETE",
					data,
					headers,
					time: parseTime,
				});

				// Perform column mapping
				const mappingResult = mapColumns(headers, schema, {
					fuzzyThreshold: 0.6,
					autoAcceptThreshold: autoMapThreshold,
				});

				dispatch({ type: "SET_MAPPING", mapping: mappingResult });

				// Check if we can auto-map
				if (autoMap && shouldAutoMap(mappingResult, autoMapThreshold)) {
					// Apply mapping immediately (hasHeader: false since data doesn't include header)
					const mappedData = applyMapping(data, mappingResult.mappings, schema, {
						hasHeader: false,
					});
					dispatch({
						type: "SKIP_MAPPING",
						mapping: mappingResult,
						mappedData,
					});

					// Run validation
					runValidation(mappedData);
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Unknown parse error";
				dispatch({ type: "PARSE_ERROR", error: errorMessage });
			}
		},
		[schema, delimiter, quote, maxRows, autoMap, autoMapThreshold]
	);

	// ============================================================
	// Mapping Actions
	// ============================================================

	const updateMapping = useCallback((csvIndex: number, schemaColumn: string | null) => {
		dispatch({ type: "UPDATE_MAPPING", csvIndex, schemaColumn });
	}, []);

	const confirmMapping = useCallback(() => {
		if (!state.rawData || !state.mapping) {
			return;
		}

		try {
			// Apply the mapping to reorder columns (hasHeader: false since rawData doesn't include header)
			const mappedData = applyMapping(state.rawData, state.mapping.mappings, schema, {
				hasHeader: false,
			});

			dispatch({ type: "CONFIRM_MAPPING", mappedData });

			// Run validation
			runValidation(mappedData);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : "Failed to apply mapping";
			dispatch({ type: "VALIDATE_ERROR", error: errorMessage });
		}
	}, [state.rawData, state.mapping, schema]);

	// ============================================================
	// Validation
	// ============================================================

	const runValidation = useCallback(
		(data: string[][]) => {
			// Check if cancelled before validation
			if (cancelledRef.current) {
				return;
			}

			try {
				const startTime = performance.now();
				const useBitmap = data.length > BITMAP_THRESHOLD;

				let result: ValidationResult | BitmapValidationResult;
				if (useBitmap) {
					result = validateBitmap(data, schema);
				} else {
					result = validate(data, schema);
				}

				// Check if cancelled after validation
				if (cancelledRef.current) {
					return;
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
		},
		[schema]
	);

	// ============================================================
	// Final Actions
	// ============================================================

	const accept = useCallback(() => {
		if (state.step !== "review") {
			return;
		}

		dispatch({ type: "ACCEPT" });
	}, [state.step]);

	const getImportResult = useCallback(() => {
		return buildImportResult(
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
	}, [state, schema]);

	// Call onComplete when we reach complete state
	useEffect(() => {
		if (state.step === "complete" && onComplete) {
			const result = getImportResult();
			if (result) {
				onComplete(result);
			}
		}
	}, [state.step, onComplete, getImportResult]);

	const reset = useCallback(() => {
		dispatch({ type: "RESET" });
	}, []);

	const goBack = useCallback(() => {
		dispatch({ type: "GO_BACK" });
	}, []);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		dispatch({ type: "RESET" });
	}, []);

	// ============================================================
	// Data Accessors
	// ============================================================

	const getErrors = useCallback(
		(options?: { limit?: number; offset?: number }): ValidationError[] => {
			if (state.bitmapValidation) {
				return state.bitmapValidation.getErrors(options);
			}
			if (state.validation) {
				const { limit = 100, offset = 0 } = options ?? {};
				return state.validation.errors.slice(offset, offset + limit);
			}
			return [];
		},
		[state.validation, state.bitmapValidation]
	);

	const getRowErrors = useCallback(
		(row: number): ValidationError[] => {
			if (state.bitmapValidation) {
				return state.bitmapValidation.getRowErrors(row);
			}
			if (state.validation) {
				return state.validation.errors.filter((e) => e.row === row);
			}
			return [];
		},
		[state.validation, state.bitmapValidation]
	);

	const getCellError = useCallback(
		(row: number, col: number): ValidationError | null => {
			if (state.bitmapValidation) {
				return state.bitmapValidation.getCellError(row, col);
			}
			if (state.validation) {
				return state.validation.errors.find((e) => e.row === row && e.col === col) ?? null;
			}
			return null;
		},
		[state.validation, state.bitmapValidation]
	);

	const getErrorSummary = useCallback((): Record<string, number> => {
		if (state.bitmapValidation) {
			return state.bitmapValidation.getErrorSummary();
		}
		if (state.validation) {
			return state.validation.stats.errorsByRule;
		}
		return {};
	}, [state.validation, state.bitmapValidation]);

	// ============================================================
	// Computed Values
	// ============================================================

	const isLoading = useMemo(
		() => state.step === "parsing" || state.step === "validating",
		[state.step]
	);
	const isComplete = useMemo(() => state.step === "complete", [state.step]);
	const hasErrors = useMemo(() => {
		if (state.bitmapValidation) {
			return state.bitmapValidation.errorCount > 0;
		}
		if (state.validation) {
			return state.validation.errors.length > 0;
		}
		return false;
	}, [state.validation, state.bitmapValidation]);

	const canGoBack = useMemo(() => checkCanGoBack(state.step), [state.step]);
	const canGoForward = useMemo(() => checkCanGoForward(state.step), [state.step]);

	// ============================================================
	// Return
	// ============================================================

	return {
		// State
		state,
		step: state.step,

		// Computed
		isLoading,
		isComplete,
		hasErrors,
		canGoBack,
		canGoForward,

		// Actions
		loadFile,
		loadString,
		updateMapping,
		confirmMapping,
		accept,
		reset,
		goBack,
		cancel,

		// Data accessors
		getErrors,
		getRowErrors,
		getCellError,
		getErrorSummary,
	};
}
