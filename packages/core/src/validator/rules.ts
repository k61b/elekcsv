import { type LocaleFieldType, genLocaleTypeCheck } from "../locale";
import type { ColumnType, Rule } from "../types";

// ============================================================================
// Escape Utilities
// ============================================================================

/**
 * Escape a string for safe inclusion in generated JavaScript code.
 * Prevents code injection from user-provided values.
 */
export function escapeString(str: string): string {
	return JSON.stringify(str);
}

/**
 * Escape regex pattern for safe inclusion in generated code.
 */
export function escapeRegex(pattern: RegExp | string): string {
	if (pattern instanceof RegExp) {
		return `new RegExp(${JSON.stringify(pattern.source)}, ${JSON.stringify(pattern.flags)})`;
	}
	return `new RegExp(${JSON.stringify(pattern)})`;
}

// ============================================================================
// Rule Code Generators
// ============================================================================

/**
 * Generate code for 'required' rule check.
 * Returns the error code if the value is empty.
 */
export function genRequired(errorCode: number): string {
	return `if (v === '') return ${errorCode};`;
}

/**
 * Generate code for type checking (without locale).
 * Only validates non-empty values.
 */
export function genTypeCheck(type: ColumnType, errorCode: number): string {
	switch (type) {
		case "number":
			// Use isNaN check: +v converts to number, NaN !== NaN so isNaN catches invalid
			return `if (v !== '') { var _n = +v; if (_n !== _n) return ${errorCode}; }`;
		case "integer":
			return `if (v !== '') { var _n = +v; if (_n !== _n || !Number.isInteger(_n)) return ${errorCode}; }`;
		case "boolean":
			return `if (v !== '' && !/^(true|false|1|0|yes|no)$/i.test(v)) return ${errorCode};`;
		case "date":
			return `if (v !== '' && !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return ${errorCode};`;
		case "phone":
			// Without locale, accept any format with 10-15 digits
			return `if (v !== '') { var _pd = v.replace(/[^0-9]/g, ''); if (_pd.length < 10 || _pd.length > 15) return ${errorCode}; }`;
		case "currency":
			// Without locale, accept number with optional currency symbols
			// Must have at least one digit
			return `if (v !== '') { var _cv = v.replace(/[^0-9.\\-]/g, ''); if (!_cv || !/\\d/.test(_cv)) return ${errorCode}; var _cn = +_cv; if (_cn !== _cn) return ${errorCode}; }`;
		case "string":
		case "enum":
			return ""; // No type check for string/enum
		default:
			return "";
	}
}

/**
 * Check if a type is locale-aware.
 */
export function isLocaleAwareType(type: ColumnType): type is LocaleFieldType {
	return (
		type === "date" ||
		type === "number" ||
		type === "boolean" ||
		type === "phone" ||
		type === "currency"
	);
}

/**
 * Generate locale-aware type check.
 * Returns code, helpers, and error metadata.
 */
export function genLocaleAwareTypeCheck(
	type: ColumnType,
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
	errorMetas: Array<{ code: number; name: string; message: string }>;
} {
	if (!isLocaleAwareType(type)) {
		const code = genTypeCheck(type, errorCode);
		return {
			code,
			helpers: {},
			errorMetas: code
				? [{ code: errorCode, name: "type", message: getTypeErrorMessage(type) }]
				: [],
		};
	}

	const result = genLocaleTypeCheck(type, localeId, errorCode);

	return {
		code: result.code,
		helpers: result.helpers,
		errorMetas: result.errorCodes.map((e) => ({
			code: errorCode + e.offset,
			name: "type",
			message: e.message,
		})),
	};
}

/**
 * Get error message for type validation.
 */
function getTypeErrorMessage(type: ColumnType): string {
	switch (type) {
		case "number":
			return "Value must be a valid number";
		case "integer":
			return "Value must be a valid integer";
		case "boolean":
			return "Value must be true, false, yes, no, 1, or 0";
		case "date":
			return "Value must be a valid date (YYYY-MM-DD)";
		case "phone":
			return "Value must be a valid phone number";
		case "currency":
			return "Value must be a valid currency amount";
		default:
			return "Invalid type";
	}
}

/**
 * Generate code for 'min' rule.
 */
export function genMin(value: number, errorCode: number): string {
	return `if (v !== '' && +v < ${value}) return ${errorCode};`;
}

/**
 * Generate code for 'max' rule.
 */
export function genMax(value: number, errorCode: number): string {
	return `if (v !== '' && +v > ${value}) return ${errorCode};`;
}

/**
 * Generate code for 'minLength' rule.
 */
export function genMinLength(value: number, errorCode: number): string {
	return `if (v !== '' && v.length < ${value}) return ${errorCode};`;
}

/**
 * Generate code for 'maxLength' rule.
 */
export function genMaxLength(value: number, errorCode: number): string {
	return `if (v !== '' && v.length > ${value}) return ${errorCode};`;
}

/**
 * Generate code for 'pattern' rule.
 */
export function genPattern(pattern: RegExp | string, errorCode: number): string {
	const regex = escapeRegex(pattern);
	return `if (v !== '' && !${regex}.test(v)) return ${errorCode};`;
}

/**
 * Generate code for 'enum' rule.
 */
export function genEnum(values: string[], errorCode: number): string {
	const set = values.map(escapeString).join(",");
	return `if (v !== '' && ![${set}].includes(v)) return ${errorCode};`;
}

/**
 * Generate code for 'email' rule.
 */
export function genEmail(errorCode: number): string {
	// Simple email regex - checks for @ and domain
	return `if (v !== '' && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) return ${errorCode};`;
}

// ============================================================================
// Rule Metadata
// ============================================================================

export interface RuleMeta {
	code: number;
	name: string;
	message: string;
}

/**
 * Build rule metadata from a rule definition.
 */
export function getRuleMeta(rule: Rule, code: number): RuleMeta {
	switch (rule.rule) {
		case "required":
			return { code, name: "required", message: "This field is required" };
		case "min":
			return { code, name: "min", message: `Value must be at least ${rule.value}` };
		case "max":
			return { code, name: "max", message: `Value must be at most ${rule.value}` };
		case "minLength":
			return { code, name: "minLength", message: `Length must be at least ${rule.value}` };
		case "maxLength":
			return { code, name: "maxLength", message: `Length must be at most ${rule.value}` };
		case "pattern":
			return { code, name: "pattern", message: "Value does not match the required pattern" };
		case "enum":
			return { code, name: "enum", message: `Value must be one of: ${rule.values.join(", ")}` };
		case "email":
			return { code, name: "email", message: "Invalid email address" };
		case "unique":
			return { code, name: "unique", message: "Value must be unique" };
		case "custom":
			return { code, name: "custom", message: rule.message ?? "Custom validation failed" };
		default:
			return { code, name: "unknown", message: "Validation failed" };
	}
}

/**
 * Generate code for a single rule.
 */
export function genRuleCode(rule: Rule, errorCode: number): string {
	switch (rule.rule) {
		case "required":
			return genRequired(errorCode);
		case "min":
			return genMin(rule.value, errorCode);
		case "max":
			return genMax(rule.value, errorCode);
		case "minLength":
			return genMinLength(rule.value, errorCode);
		case "maxLength":
			return genMaxLength(rule.value, errorCode);
		case "pattern":
			return genPattern(rule.value, errorCode);
		case "enum":
			return genEnum(rule.values, errorCode);
		case "email":
			return genEmail(errorCode);
		case "unique":
			// Unique is handled separately (requires full column pass)
			return "";
		case "custom":
			// Custom functions cannot be compiled, handled at runtime
			return "";
		default:
			return "";
	}
}
