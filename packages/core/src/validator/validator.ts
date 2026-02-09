import type { ErrorCode, Schema, ValidationError, ValidationStats } from "../types";
import { ERROR_CODES } from "../types";
import { ErrorBitmap, ErrorCodeMap } from "./bitmap";
import { type CompiledSchemaValidator, compileSchema } from "./compiler";

// ============================================================================
// Special Error Codes for Bitmap
// ============================================================================

// Error codes stored in ErrorCodeMap
// 0 = no error
// 1-200 = compiled rule error codes (from column's errorMap)
// 201-250 = custom validation error (201 + custom fn index)
// 251 = unique constraint error
const SPECIAL_CODE_CUSTOM_BASE = 201;
const SPECIAL_CODE_UNIQUE = 251;

// ============================================================================
// Bitmap-based Validation Result
// ============================================================================

/**
 * Extended validation result with bitmap-based error tracking.
 * Provides lazy error materialization for better performance.
 */
export interface BitmapValidationResult {
	/** Whether all data is valid */
	valid: boolean;
	/** Error bitmap for cell-level queries */
	bitmap: ErrorBitmap;
	/** Error codes for each cell */
	errorCodes: ErrorCodeMap;
	/** Total error count */
	errorCount: number;
	/** Total row count */
	rowCount: number;
	/** Column count */
	colCount: number;
	/** Whether validation was aborted */
	aborted: boolean;

	/**
	 * Get errors with pagination support.
	 * Errors are materialized lazily on demand.
	 */
	getErrors(options?: { limit?: number; offset?: number }): ValidationError[];

	/**
	 * Get all errors for a specific row.
	 */
	getRowErrors(row: number): ValidationError[];

	/**
	 * Get error for a specific cell.
	 */
	getCellError(row: number, col: number): ValidationError | null;

	/**
	 * Get error summary by rule name.
	 */
	getErrorSummary(): Record<string, number>;

	/**
	 * Get error summary by column name.
	 */
	getColumnErrorSummary(): Record<string, number>;

	/**
	 * Get number of rows with errors.
	 */
	getErrorRowCount(): number;

	/**
	 * Get memory usage of bitmap structures in bytes.
	 */
	getMemoryUsage(): { bitmap: number; codes: number; total: number };
}

/**
 * Legacy validation result interface for backward compatibility.
 */
export interface ValidationResult {
	valid: boolean;
	stats: ValidationStats;
	errors: ValidationError[];
	aborted: boolean;
}

// ============================================================================
// Compiled Validator Class
// ============================================================================

/**
 * A compiled validator that can validate multiple datasets efficiently.
 * Uses bitmap-based error tracking internally for zero allocation in hot path.
 */
export class CompiledValidator {
	private readonly compiled: CompiledSchemaValidator;
	private readonly schema: Schema;

	constructor(schema: Schema) {
		this.schema = schema;
		this.compiled = compileSchema(schema);
	}

	/**
	 * Validate all rows using bitmap-based tracking.
	 * This is the high-performance API with lazy error materialization.
	 */
	validateAllBitmap(data: string[][]): BitmapValidationResult {
		const { columns, columnNames, columnCount } = this.compiled;
		const rowCount = data.length;

		// Initialize bitmap structures
		const bitmap = new ErrorBitmap(rowCount, columnCount);
		const errorCodes = new ErrorCodeMap(rowCount, columnCount);

		// Track unique values per column
		const uniqueSets: Map<number, Map<string, number>> = new Map();
		for (let colIdx = 0; colIdx < columnCount; colIdx++) {
			if (columns[colIdx].hasUnique) {
				uniqueSets.set(colIdx, new Map());
			}
		}

		// Track error counts by rule (for summary)
		const errorsByRule: Record<string, number> = {};
		const errorsByColumn: Record<string, number> = {};

		// Validate each row - HOT PATH, zero allocation
		for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
			const row = data[rowIdx];

			for (let colIdx = 0; colIdx < columnCount; colIdx++) {
				const value = colIdx < row.length ? row[colIdx] : "";
				const colInfo = columns[colIdx];

				// Run compiled validation
				const code = colInfo.fn(value);
				if (code !== 0) {
					bitmap.setError(rowIdx, colIdx);
					errorCodes.setCode(rowIdx, colIdx, code);

					// Track stats (minimal allocation, just counter increment)
					const meta = colInfo.errorMap.get(code);
					if (meta) {
						errorsByRule[meta.name] = (errorsByRule[meta.name] ?? 0) + 1;
						errorsByColumn[columnNames[colIdx]] = (errorsByColumn[columnNames[colIdx]] ?? 0) + 1;
					}
					continue;
				}

				// Run custom validation functions
				for (let customIdx = 0; customIdx < colInfo.customFns.length; customIdx++) {
					const custom = colInfo.customFns[customIdx];
					if (value !== "" && !custom.fn(value)) {
						bitmap.setError(rowIdx, colIdx);
						// Store custom function index so we can retrieve the message later
						errorCodes.setCode(rowIdx, colIdx, SPECIAL_CODE_CUSTOM_BASE + customIdx);
						errorsByRule.custom = (errorsByRule.custom ?? 0) + 1;
						errorsByColumn[columnNames[colIdx]] = (errorsByColumn[columnNames[colIdx]] ?? 0) + 1;
						break;
					}
				}

				// Check unique constraint
				if (colInfo.hasUnique && value !== "") {
					const uniqueSet = uniqueSets.get(colIdx);
					if (uniqueSet) {
						if (uniqueSet.has(value)) {
							bitmap.setError(rowIdx, colIdx);
							errorCodes.setCode(rowIdx, colIdx, SPECIAL_CODE_UNIQUE);
							errorsByRule.unique = (errorsByRule.unique ?? 0) + 1;
							errorsByColumn[columnNames[colIdx]] = (errorsByColumn[columnNames[colIdx]] ?? 0) + 1;
						} else {
							uniqueSet.set(value, rowIdx);
						}
					}
				}
			}
		}

		const errorCount = bitmap.countErrors();

		// Create result with lazy error materialization
		const result: BitmapValidationResult = {
			valid: errorCount === 0,
			bitmap,
			errorCodes,
			errorCount,
			rowCount,
			colCount: columnCount,
			aborted: false,

			getErrors: (options?: { limit?: number; offset?: number }) => {
				return this.materializeErrors(data, bitmap, errorCodes, options);
			},

			getRowErrors: (row: number) => {
				return this.materializeRowErrors(data, bitmap, errorCodes, row);
			},

			getCellError: (row: number, col: number) => {
				return this.materializeCellError(data, bitmap, errorCodes, row, col);
			},

			getErrorSummary: () => ({ ...errorsByRule }),

			getColumnErrorSummary: () => ({ ...errorsByColumn }),

			getErrorRowCount: () => bitmap.countErrorRows(),

			getMemoryUsage: () => ({
				bitmap: bitmap.byteSize,
				codes: errorCodes.byteSize,
				total: bitmap.byteSize + errorCodes.byteSize,
			}),
		};

		return result;
	}

	/**
	 * Validate all rows in the dataset.
	 * Returns legacy ValidationResult format for backward compatibility.
	 */
	validateAll(data: string[][]): ValidationResult {
		const bitmapResult = this.validateAllBitmap(data);

		// Materialize all errors for legacy format
		const errors = bitmapResult.getErrors({ limit: Number.MAX_SAFE_INTEGER });
		const errorRowCount = bitmapResult.getErrorRowCount();

		const stats: ValidationStats = {
			totalRows: bitmapResult.rowCount,
			validRows: bitmapResult.rowCount - errorRowCount,
			errorRows: errorRowCount,
			errorsByRule: bitmapResult.getErrorSummary(),
			errorsByColumn: bitmapResult.getColumnErrorSummary(),
		};

		return {
			valid: bitmapResult.valid,
			stats,
			errors,
			aborted: false,
		};
	}

	/**
	 * Materialize errors from bitmap with pagination.
	 */
	private materializeErrors(
		data: string[][],
		bitmap: ErrorBitmap,
		errorCodes: ErrorCodeMap,
		options?: { limit?: number; offset?: number }
	): ValidationError[] {
		const limit = options?.limit ?? 100;
		const offset = options?.offset ?? 0;
		const errors: ValidationError[] = [];
		let count = 0;
		let skipped = 0;

		const { columns, columnNames } = this.compiled;

		bitmap.forEachError((row, col) => {
			if (skipped < offset) {
				skipped++;
				return;
			}
			if (count >= limit) {
				return;
			}

			const error = this.createError(
				data,
				row,
				col,
				errorCodes.getCode(row, col),
				columns,
				columnNames
			);
			if (error) {
				errors.push(error);
				count++;
			}
		});

		return errors;
	}

	/**
	 * Materialize errors for a specific row.
	 */
	private materializeRowErrors(
		data: string[][],
		bitmap: ErrorBitmap,
		errorCodes: ErrorCodeMap,
		row: number
	): ValidationError[] {
		const errors: ValidationError[] = [];
		const { columns, columnNames, columnCount } = this.compiled;

		for (let col = 0; col < columnCount; col++) {
			if (bitmap.hasError(row, col)) {
				const error = this.createError(
					data,
					row,
					col,
					errorCodes.getCode(row, col),
					columns,
					columnNames
				);
				if (error) {
					errors.push(error);
				}
			}
		}

		return errors;
	}

	/**
	 * Materialize error for a specific cell.
	 */
	private materializeCellError(
		data: string[][],
		bitmap: ErrorBitmap,
		errorCodes: ErrorCodeMap,
		row: number,
		col: number
	): ValidationError | null {
		if (!bitmap.hasError(row, col)) {
			return null;
		}

		const { columns, columnNames } = this.compiled;
		return this.createError(data, row, col, errorCodes.getCode(row, col), columns, columnNames);
	}

	/**
	 * Create a ValidationError object from bitmap data.
	 */
	private createError(
		data: string[][],
		row: number,
		col: number,
		code: number,
		columns: CompiledSchemaValidator["columns"],
		columnNames: string[]
	): ValidationError | null {
		const value = col < data[row].length ? data[row][col] : "";
		const fieldName = columnNames[col];

		// Custom validation error (codes 201-250)
		if (code >= SPECIAL_CODE_CUSTOM_BASE && code < SPECIAL_CODE_UNIQUE) {
			const customIdx = code - SPECIAL_CODE_CUSTOM_BASE;
			const customFn = columns[col].customFns[customIdx];
			return {
				row,
				col,
				field: fieldName,
				value,
				code: ERROR_CODES.CUSTOM,
				message: customFn?.message ?? "Custom validation failed",
			};
		}

		if (code === SPECIAL_CODE_UNIQUE) {
			return {
				row,
				col,
				field: fieldName,
				value,
				code: ERROR_CODES.UNIQUE,
				message: "Duplicate value",
			};
		}

		const meta = columns[col].errorMap.get(code);
		if (!meta) {
			return null;
		}

		return {
			row,
			col,
			field: fieldName,
			value,
			code: getErrorCodeFromName(meta.name),
			message: meta.message,
		};
	}

	/**
	 * Get the column names from the compiled schema.
	 */
	getColumnNames(): string[] {
		return this.compiled.columnNames;
	}

	/**
	 * Get the number of columns in the schema.
	 */
	getColumnCount(): number {
		return this.compiled.columnCount;
	}
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Validate data against a schema.
 * This is a convenience function that compiles the schema and validates in one call.
 * For repeated validation with the same schema, use CompiledValidator directly.
 */
export function validate(data: string[][], schema: Schema): ValidationResult {
	const validator = new CompiledValidator(schema);
	return validator.validateAll(data);
}

/**
 * Validate data and return bitmap-based result.
 * More efficient for large datasets where you don't need all errors at once.
 */
export function validateBitmap(data: string[][], schema: Schema): BitmapValidationResult {
	const validator = new CompiledValidator(schema);
	return validator.validateAllBitmap(data);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert rule name to standard error code.
 */
function getErrorCodeFromName(name: string): ErrorCode {
	switch (name) {
		case "required":
			return ERROR_CODES.REQUIRED;
		case "type":
			return ERROR_CODES.TYPE;
		case "min":
			return ERROR_CODES.MIN;
		case "max":
			return ERROR_CODES.MAX;
		case "minLength":
			return ERROR_CODES.MIN_LENGTH;
		case "maxLength":
			return ERROR_CODES.MAX_LENGTH;
		case "pattern":
			return ERROR_CODES.PATTERN;
		case "enum":
			return ERROR_CODES.ENUM;
		case "email":
			return ERROR_CODES.EMAIL;
		case "unique":
			return ERROR_CODES.UNIQUE;
		case "custom":
			return ERROR_CODES.CUSTOM;
		default:
			return ERROR_CODES.VALID;
	}
}
