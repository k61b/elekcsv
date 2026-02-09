import {
	type BitmapValidationResult,
	type ValidationError,
	type ValidationResult,
	applyMapping,
	updateMapping as coreUpdateMapping,
	mapColumns,
	parse,
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
			try {
				const startTime = performance.now();

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

	const buildImportResult = useCallback((): ImportResult | null => {
		if (!state.mappedData || !state.mapping) {
			return null;
		}

		const validation = state.validation ?? state.bitmapValidation;
		if (!validation) {
			return null;
		}

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
	}, [state, schema]);

	// Call onComplete when we reach complete state
	useEffect(() => {
		if (state.step === "complete" && onComplete) {
			const result = buildImportResult();
			if (result) {
				onComplete(result);
			}
		}
	}, [state.step, onComplete, buildImportResult]);

	const reset = useCallback(() => {
		dispatch({ type: "RESET" });
	}, []);

	const goBack = useCallback(() => {
		dispatch({ type: "GO_BACK" });
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

	const isLoading = state.step === "parsing" || state.step === "validating";
	const isComplete = state.step === "complete";
	const hasErrors = useMemo(() => {
		if (state.bitmapValidation) {
			return state.bitmapValidation.errorCount > 0;
		}
		if (state.validation) {
			return state.validation.errors.length > 0;
		}
		return false;
	}, [state.validation, state.bitmapValidation]);

	const canGoBack = checkCanGoBack(state.step);
	const canGoForward = checkCanGoForward(state.step);

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

		// Data accessors
		getErrors,
		getRowErrors,
		getCellError,
		getErrorSummary,
	};
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determines if we should auto-map based on the mapping result.
 * Auto-maps if all matched columns have high confidence (exact, alias, or high fuzzy score).
 */
function shouldAutoMap(result: ReturnType<typeof mapColumns>, threshold: number): boolean {
	// Don't auto-map if there are unmapped schema columns (required columns missing)
	if (result.unmappedSchemaColumns.length > 0) {
		return false;
	}

	// Check that all mappings are high confidence
	for (const mapping of result.mappings) {
		if (mapping.schemaColumn === "") {
			// Unmapped CSV column is okay (might be extra column in CSV)
			continue;
		}

		// Must be exact, alias, or high-score fuzzy
		if (mapping.confidence === "exact" || mapping.confidence === "alias") {
			continue;
		}

		if (mapping.confidence === "fuzzy" && mapping.score >= threshold) {
			continue;
		}

		// Low confidence match - need manual review
		return false;
	}

	return true;
}
