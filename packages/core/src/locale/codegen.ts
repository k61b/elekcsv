import { daysInMonth, isLeapYear } from "./parsers";
import { getDateFormats, getLocale } from "./registry";
import type { LocaleConfig } from "./types";

// ============================================================================
// Helper Function References
// ============================================================================

// These functions are passed to compiled validators at compile time
// to avoid repeated lookups at runtime.

/**
 * Create a days-in-month lookup function for compiled code.
 */
function createDaysInMonthFn(): (month: number, year: number) => number {
	return daysInMonth;
}

/**
 * Create a leap year check function for compiled code.
 */
function createIsLeapYearFn(): (year: number) => boolean {
	return isLeapYear;
}

// ============================================================================
// Date Validation Code Generation
// ============================================================================

/**
 * Generate code for locale-aware date validation.
 */
export function genLocaleDateCheck(
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
} {
	const formats = getDateFormats(localeId);
	const helperName = `_dim_${localeId.replace("-", "_")}`;

	// Build pattern matching for all formats
	const formatChecks: string[] = [];

	for (let i = 0; i < formats.length; i++) {
		const format = formats[i];
		// Use the regex source directly
		const regexStr = format.regex.source;

		formatChecks.push(`
    var _m${i} = v.match(/^${regexStr.slice(1, -1)}$/);
    if (_m${i}) {
      var _d = +_m${i}[${format.dayIndex}];
      var _mo = +_m${i}[${format.monthIndex}];
      var _y = +_m${i}[${format.yearIndex}];
      if (_y < 1900 || _y > 2100) return ${errorCode + 3};
      if (_mo < 1 || _mo > 12) return ${errorCode + 1};
      if (_d < 1 || _d > ${helperName}(_mo, _y)) return ${errorCode + 2};
      _matched = true;
    }`);
	}

	const code = `if (v !== '') {
  var _matched = false;
  ${formatChecks.join("\n  ")}
  if (!_matched) return ${errorCode};
}`;

	return {
		code,
		helpers: {
			[helperName]: createDaysInMonthFn(),
		},
	};
}

// ============================================================================
// Number Validation Code Generation
// ============================================================================

/**
 * Generate code for locale-aware number validation.
 */
export function genLocaleNumberCheck(
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
} {
	const locale = getLocale(localeId);
	const { thousandsSeparator, decimalSeparator } = locale;

	// Escape separators for regex
	const escapedThousands = thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedDecimal = decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Build validation regex for the locale's number format
	// Allows: optional minus, digits with optional thousands separators, optional decimal part
	let pattern: string;

	if (thousandsSeparator === " ") {
		// French format: spaces are optional between digit groups
		pattern = `^-?\\d{1,3}(?:\\s\\d{3})*(?:${escapedDecimal}\\d+)?$|^-?\\d+(?:${escapedDecimal}\\d+)?$`;
	} else {
		// Standard format: dot or comma as separator
		pattern = `^-?\\d{1,3}(?:${escapedThousands}\\d{3})*(?:${escapedDecimal}\\d+)?$|^-?\\d+(?:${escapedDecimal}\\d+)?$`;
	}

	const code = `if (v !== '' && !/${pattern}/.test(v)) return ${errorCode};`;

	return {
		code,
		helpers: {},
	};
}

/**
 * Generate code for locale-aware number parsing (for min/max checks).
 * Returns code that sets _numVal variable.
 */
export function genLocaleNumberParse(localeId: string): string {
	const locale = getLocale(localeId);
	const { thousandsSeparator, decimalSeparator } = locale;

	// Escape for string replacement
	const escapedThousands = JSON.stringify(thousandsSeparator);
	const escapedDecimal = JSON.stringify(decimalSeparator);

	let parseCode: string;

	if (thousandsSeparator === " ") {
		parseCode = `var _clean = v.replace(/\\s/g, '');`;
	} else {
		parseCode = `var _clean = v.split(${escapedThousands}).join('');`;
	}

	if (decimalSeparator !== ".") {
		parseCode += `\n  _clean = _clean.replace(${escapedDecimal}, '.');`;
	}

	parseCode += "\n  var _numVal = +_clean;";

	return parseCode;
}

// ============================================================================
// Currency Validation Code Generation
// ============================================================================

/**
 * Generate code for locale-aware currency validation.
 */
export function genLocaleCurrencyCheck(
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
} {
	const locale = getLocale(localeId);
	const { currencySymbols } = locale;

	// Build symbol stripping regex
	const escapedSymbols = currencySymbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const symbolPattern = escapedSymbols.join("|");

	// First strip symbols, then validate as number
	const numCheck = genLocaleNumberCheck(localeId, errorCode);

	const code = `if (v !== '') {
  var _cv = v.trim().replace(/^(${symbolPattern})\\s*/, '').replace(/\\s*(${symbolPattern})$/, '').trim();
  if (!_cv) return ${errorCode};
  v = _cv;
  ${numCheck.code.replace("if (v !== '' && ", "if (").replace(`return ${errorCode}`, `return ${errorCode + 1}`)}
}`;

	return {
		code,
		helpers: numCheck.helpers,
	};
}

// ============================================================================
// Phone Validation Code Generation
// ============================================================================

/**
 * Generate code for locale-aware phone validation.
 */
export function genLocalePhoneCheck(
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
} {
	const locale = getLocale(localeId);
	const { phoneCountryCode, phoneTotalDigits } = locale;

	const escapedCountryCode = phoneCountryCode.replace("+", "\\+").replace(/\s/g, "");
	const minDigits = phoneTotalDigits - 2;
	const maxDigits = phoneTotalDigits + 2;

	// Strip formatting and check digit count
	const code = `if (v !== '') {
  var _pv = v.replace(/[\\s\\-\\(\\)\\.]/g, '');
  var _pd = _pv.replace(/\\D/g, '');
  if (_pd.length < ${minDigits} || _pd.length > ${maxDigits}) return ${errorCode};
  if (_pv.startsWith('+') && !_pv.startsWith('${escapedCountryCode}')) return ${errorCode + 1};
}`;

	return {
		code,
		helpers: {},
	};
}

// ============================================================================
// Boolean Validation Code Generation
// ============================================================================

/**
 * Generate code for locale-aware boolean validation.
 */
export function genLocaleBooleanCheck(
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
} {
	const locale = getLocale(localeId);
	const allValues = [...locale.trueValues, ...locale.falseValues];

	// Build set of valid values (case-insensitive)
	const valuesSet = JSON.stringify(allValues);

	const code = `if (v !== '' && !${valuesSet}.includes(v.toLowerCase().trim())) return ${errorCode};`;

	return {
		code,
		helpers: {},
	};
}

// ============================================================================
// Main Code Generator
// ============================================================================

export type LocaleFieldType = "date" | "number" | "currency" | "phone" | "boolean";

/**
 * Generate validation code for a locale-aware field type.
 */
export function genLocaleTypeCheck(
	type: LocaleFieldType,
	localeId: string,
	errorCode: number
): {
	code: string;
	helpers: Record<string, unknown>;
	errorCodes: Array<{ offset: number; message: string }>;
} {
	switch (type) {
		case "date": {
			const result = genLocaleDateCheck(localeId, errorCode);
			return {
				...result,
				errorCodes: [
					{ offset: 0, message: "Invalid date format" },
					{ offset: 1, message: "Invalid month (1-12)" },
					{ offset: 2, message: "Invalid day for month" },
					{ offset: 3, message: "Invalid year (1900-2100)" },
				],
			};
		}
		case "number": {
			const result = genLocaleNumberCheck(localeId, errorCode);
			return {
				...result,
				errorCodes: [{ offset: 0, message: "Invalid number format" }],
			};
		}
		case "currency": {
			const result = genLocaleCurrencyCheck(localeId, errorCode);
			return {
				...result,
				errorCodes: [
					{ offset: 0, message: "Invalid currency format" },
					{ offset: 1, message: "Invalid number in currency" },
				],
			};
		}
		case "phone": {
			const result = genLocalePhoneCheck(localeId, errorCode);
			return {
				...result,
				errorCodes: [
					{ offset: 0, message: "Invalid phone number" },
					{ offset: 1, message: "Wrong country code" },
				],
			};
		}
		case "boolean": {
			const result = genLocaleBooleanCheck(localeId, errorCode);
			return {
				...result,
				errorCodes: [{ offset: 0, message: "Invalid boolean value" }],
			};
		}
		default:
			return {
				code: "",
				helpers: {},
				errorCodes: [],
			};
	}
}
