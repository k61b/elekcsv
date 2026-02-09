import { genLocaleNumberParse } from "../locale";
import type { ColumnDef, ColumnType, Rule } from "../types";
import { ERROR_CODES } from "../types";
import {
	type RuleMeta,
	genLocaleAwareTypeCheck,
	genRuleCode,
	genTypeCheck,
	getRuleMeta,
	isLocaleAwareType,
} from "./rules";

// ============================================================================
// Types
// ============================================================================

/**
 * Compiled validation function for a single column.
 * Takes a value string, returns 0 if valid or an error code if invalid.
 */
export type CompiledColumnValidator = (value: string) => number;

/**
 * Metadata about a compiled column validator.
 */
export interface ColumnValidatorInfo {
	/** The compiled validation function */
	fn: CompiledColumnValidator;
	/** Mapping from error code to rule metadata */
	errorMap: Map<number, RuleMeta>;
	/** Whether this column has a 'required' rule */
	hasRequired: boolean;
	/** Whether this column has a 'unique' rule */
	hasUnique: boolean;
	/** Custom validation functions (cannot be compiled) */
	customFns: Array<{ fn: (value: string) => boolean; message?: string; code: number }>;
	/** Locale used for this column (if any) */
	locale?: string;
}

/**
 * Compiled schema validator containing all column validators.
 */
export interface CompiledSchemaValidator {
	/** Column validators indexed by column index */
	columns: ColumnValidatorInfo[];
	/** Column names in order */
	columnNames: string[];
	/** Total number of columns in schema */
	columnCount: number;
	/** Default locale for the schema */
	locale?: string;
}

// ============================================================================
// Column Compiler
// ============================================================================

/**
 * Options for compiling a column.
 */
export interface CompileColumnOptions {
	/** Default locale to use if column doesn't specify one */
	defaultLocale?: string;
}

/**
 * Compile a single column definition into a validation function.
 */
export function compileColumn(
	columnDef: ColumnDef,
	columnName: string,
	options?: CompileColumnOptions
): ColumnValidatorInfo {
	const rules = columnDef.rules ?? [];
	const type = columnDef.type;

	// Determine locale: column > schema default > undefined (no locale)
	const locale = columnDef.locale ?? options?.defaultLocale;
	const useLocale = locale !== undefined && isLocaleAwareType(type);

	const errorMap = new Map<number, RuleMeta>();
	const codeLines: string[] = [];
	const customFns: ColumnValidatorInfo["customFns"] = [];

	// Collect helpers that need to be passed to the compiled function
	const helpers: Record<string, unknown> = {};
	const helperNames: string[] = [];

	let errorCode = 1;
	let hasRequired = false;
	let hasUnique = false;

	// Process required rule first (must be checked before type)
	const requiredRule = rules.find((r) => r.rule === "required");
	if (requiredRule) {
		hasRequired = true;
		const code = genRuleCode(requiredRule, errorCode);
		if (code) {
			codeLines.push(code);
			errorMap.set(errorCode, getRuleMeta(requiredRule, errorCode));
			errorCode++;
		}
	}

	// Type checking (after required, so empty values can be skipped)
	if (useLocale && locale) {
		const localeCheck = genLocaleAwareTypeCheck(type, locale, errorCode);
		if (localeCheck.code) {
			codeLines.push(localeCheck.code);

			// Add all error codes from locale check
			for (const meta of localeCheck.errorMetas) {
				errorMap.set(meta.code, {
					code: meta.code,
					name: meta.name,
					message: meta.message,
				});
			}

			// Track highest error code used
			if (localeCheck.errorMetas.length > 0) {
				const maxOffset = Math.max(...localeCheck.errorMetas.map((m) => m.code - errorCode));
				errorCode += maxOffset + 1;
			}

			// Register helpers
			for (const [name, fn] of Object.entries(localeCheck.helpers)) {
				helpers[name] = fn;
				helperNames.push(name);
			}
		}
	} else {
		const typeCode = genTypeCheck(type, errorCode);
		if (typeCode) {
			codeLines.push(typeCode);
			errorMap.set(errorCode, {
				code: errorCode,
				name: "type",
				message: getTypeErrorMessage(type),
			});
			errorCode++;
		}
	}

	// Process remaining rules (excluding required, unique, custom)
	for (const rule of rules) {
		if (rule.rule === "required" || rule.rule === "unique" || rule.rule === "custom") {
			if (rule.rule === "unique") {
				hasUnique = true;
			}
			if (rule.rule === "custom") {
				customFns.push({
					fn: rule.fn,
					message: rule.message,
					code: ERROR_CODES.CUSTOM,
				});
			}
			continue;
		}

		// For min/max rules with locale-aware number types, we need to parse first
		if ((rule.rule === "min" || rule.rule === "max") && useLocale && locale && type === "number") {
			const parseCode = genLocaleNumberParse(locale);
			const checkCode =
				rule.rule === "min"
					? `if (v !== '') { ${parseCode}\n  if (_numVal < ${rule.value}) return ${errorCode}; }`
					: `if (v !== '') { ${parseCode}\n  if (_numVal > ${rule.value}) return ${errorCode}; }`;

			codeLines.push(checkCode);
			errorMap.set(errorCode, getRuleMeta(rule, errorCode));
			errorCode++;
			continue;
		}

		const code = genRuleCode(rule, errorCode);
		if (code) {
			codeLines.push(code);
			errorMap.set(errorCode, getRuleMeta(rule, errorCode));
			errorCode++;
		}
	}

	// Build the function body
	codeLines.push("return 0;");
	const body = codeLines.join("\n");

	// Create the compiled function
	let fn: CompiledColumnValidator;

	if (helperNames.length > 0) {
		// Need to pass helpers as closure variables
		const helperArgs = helperNames.join(", ");
		const wrapperBody = `return function(v) {\n${body}\n}`;
		const factory = new Function(helperArgs, wrapperBody) as (
			...args: unknown[]
		) => CompiledColumnValidator;
		fn = factory(...helperNames.map((name) => helpers[name]));
	} else {
		fn = new Function("v", body) as CompiledColumnValidator;
	}

	return {
		fn,
		errorMap,
		hasRequired,
		hasUnique,
		customFns,
		locale,
	};
}

/**
 * Get a human-readable error message for type validation failure.
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

// ============================================================================
// Schema Compiler
// ============================================================================

/**
 * Schema definition with ordered columns.
 */
export interface SchemaInput {
	columns: Record<string, ColumnDef>;
	/** Default locale for all columns */
	locale?: string;
}

/**
 * Compile an entire schema into a validator.
 * Columns are ordered by their keys (Object.keys order).
 */
export function compileSchema(schema: SchemaInput): CompiledSchemaValidator {
	const columnNames = Object.keys(schema.columns);
	const columns: ColumnValidatorInfo[] = [];

	const options: CompileColumnOptions = {
		defaultLocale: schema.locale,
	};

	for (const name of columnNames) {
		const columnDef = schema.columns[name];
		const compiled = compileColumn(columnDef, name, options);
		columns.push(compiled);
	}

	return {
		columns,
		columnNames,
		columnCount: columnNames.length,
		locale: schema.locale,
	};
}
