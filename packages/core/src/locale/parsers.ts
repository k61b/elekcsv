import { getDateFormats, getLocale } from "./registry";
import type { ParsedDate } from "./types";

// ============================================================================
// Date Parsing & Validation
// ============================================================================

/** Days in each month (non-leap year) */
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Check if a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Get the number of days in a month, accounting for leap years.
 */
export function daysInMonth(month: number, year: number): number {
	if (month === 2 && isLeapYear(year)) {
		return 29;
	}
	return DAYS_IN_MONTH[month] || 0;
}

/**
 * Parse a date string according to locale formats.
 * Returns null if the date is invalid.
 */
export function parseDate(value: string, localeId: string): ParsedDate | null {
	if (!value) return null;

	const formats = getDateFormats(localeId);

	for (const format of formats) {
		const match = value.match(format.regex);
		if (match) {
			const day = Number.parseInt(match[format.dayIndex], 10);
			const month = Number.parseInt(match[format.monthIndex], 10);
			const year = Number.parseInt(match[format.yearIndex], 10);

			// Validate ranges
			if (month < 1 || month > 12) return null;
			if (year < 1900 || year > 2100) return null;
			if (day < 1 || day > daysInMonth(month, year)) return null;

			return { day, month, year };
		}
	}

	return null;
}

/**
 * Validate a date string according to locale formats.
 * Returns 0 if valid, error code otherwise:
 * 1 = format error, 2 = invalid month, 3 = invalid day, 4 = invalid year
 */
export function validateDate(value: string, localeId: string): number {
	if (!value) return 0; // Empty is valid (required rule handles this)

	const formats = getDateFormats(localeId);

	for (const format of formats) {
		const match = value.match(format.regex);
		if (match) {
			const day = Number.parseInt(match[format.dayIndex], 10);
			const month = Number.parseInt(match[format.monthIndex], 10);
			const year = Number.parseInt(match[format.yearIndex], 10);

			if (year < 1900 || year > 2100) return 4;
			if (month < 1 || month > 12) return 2;
			if (day < 1 || day > daysInMonth(month, year)) return 3;

			return 0;
		}
	}

	return 1; // Format error
}

/**
 * Normalize a locale-formatted date to ISO format (YYYY-MM-DD).
 */
export function normalizeDateToISO(value: string, localeId: string): string | null {
	const parsed = parseDate(value, localeId);
	if (!parsed) return null;

	const { day, month, year } = parsed;
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ============================================================================
// Number Parsing & Validation
// ============================================================================

/**
 * Parse a locale-formatted number string to a JavaScript number.
 * Returns NaN if invalid.
 */
export function parseNumber(value: string, localeId: string): number {
	if (!value) return Number.NaN;

	const locale = getLocale(localeId);
	const { thousandsSeparator, decimalSeparator } = locale;

	// Remove thousands separators and replace decimal separator with '.'
	let cleaned = value.trim();

	// Handle negative numbers
	const isNegative = cleaned.startsWith("-");
	if (isNegative) {
		cleaned = cleaned.slice(1);
	}

	// Remove thousands separators
	if (thousandsSeparator) {
		// Escape the separator for regex
		const escapedSep = thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		cleaned = cleaned.replace(new RegExp(escapedSep, "g"), "");
	}

	// Replace decimal separator with '.'
	if (decimalSeparator !== ".") {
		cleaned = cleaned.replace(decimalSeparator, ".");
	}

	const result = Number.parseFloat(cleaned);
	return isNegative ? -result : result;
}

/**
 * Validate a locale-formatted number string.
 * Returns 0 if valid, 1 if invalid.
 */
export function validateNumber(value: string, localeId: string): number {
	if (!value) return 0; // Empty is valid

	const parsed = parseNumber(value, localeId);
	return Number.isNaN(parsed) ? 1 : 0;
}

/**
 * Normalize a locale-formatted number to standard format.
 */
export function normalizeNumber(value: string, localeId: string): string | null {
	if (!value) return null;

	const parsed = parseNumber(value, localeId);
	if (Number.isNaN(parsed)) return null;

	return String(parsed);
}

// ============================================================================
// Currency Parsing & Validation
// ============================================================================

/**
 * Strip currency symbol from a value.
 */
export function stripCurrencySymbol(value: string, localeId: string): string {
	if (!value) return "";

	const locale = getLocale(localeId);
	let cleaned = value.trim();

	// Remove currency symbols
	for (const symbol of locale.currencySymbols) {
		// Handle both prefix and suffix
		if (cleaned.startsWith(symbol)) {
			cleaned = cleaned.slice(symbol.length).trim();
		}
		if (cleaned.endsWith(symbol)) {
			cleaned = cleaned.slice(0, -symbol.length).trim();
		}
	}

	return cleaned;
}

/**
 * Parse a currency string to a number.
 */
export function parseCurrency(value: string, localeId: string): number {
	const stripped = stripCurrencySymbol(value, localeId);
	return parseNumber(stripped, localeId);
}

/**
 * Validate a currency string.
 * Returns 0 if valid, 1 if invalid format, 2 if invalid number.
 */
export function validateCurrency(value: string, localeId: string): number {
	if (!value) return 0;

	const stripped = stripCurrencySymbol(value, localeId);
	if (!stripped) return 1; // Only symbol, no number

	return validateNumber(stripped, localeId);
}

/**
 * Normalize a currency value to plain number string.
 */
export function normalizeCurrency(value: string, localeId: string): string | null {
	if (!value) return null;

	const parsed = parseCurrency(value, localeId);
	if (Number.isNaN(parsed)) return null;

	return String(parsed);
}

// ============================================================================
// Phone Parsing & Validation
// ============================================================================

/**
 * Strip formatting characters from phone number.
 */
export function stripPhoneFormatting(value: string): string {
	// Remove spaces, dashes, parentheses, dots
	return value.replace(/[\s\-\(\)\.]/g, "");
}

/**
 * Parse a phone number to digits only.
 */
export function parsePhone(value: string, localeId: string): string {
	if (!value) return "";

	const locale = getLocale(localeId);
	const stripped = stripPhoneFormatting(value);

	// If starts with +, keep the +
	if (stripped.startsWith("+")) {
		return stripped;
	}

	// If starts with 0, might be local format
	if (stripped.startsWith("0")) {
		// Convert to international format
		const countryCode = locale.phoneCountryCode.replace("+", "");
		return `+${countryCode}${stripped.slice(1)}`;
	}

	// Already without prefix, add country code
	const countryCode = locale.phoneCountryCode.replace("+", "");
	return `+${countryCode}${stripped}`;
}

/**
 * Validate a phone number for the locale.
 * Returns 0 if valid, 1 if invalid.
 */
export function validatePhone(value: string, localeId: string): number {
	if (!value) return 0;

	const locale = getLocale(localeId);
	const stripped = stripPhoneFormatting(value);

	// Check digit count (liberal approach)
	const digitsOnly = stripped.replace(/\D/g, "");

	// Accept if digit count is reasonable for this locale
	// Turkish: 10 digits local, 12 with country code
	// US: 10 digits local, 11 with country code
	const minDigits = locale.phoneTotalDigits - 2;
	const maxDigits = locale.phoneTotalDigits + 2;

	if (digitsOnly.length < minDigits || digitsOnly.length > maxDigits) {
		return 1;
	}

	// If starts with +, check country code
	if (stripped.startsWith("+")) {
		const countryCode = locale.phoneCountryCode;
		if (!stripped.startsWith(countryCode.replace(/\s/g, ""))) {
			return 1; // Wrong country code
		}
	}

	return 0;
}

/**
 * Normalize a phone number to E.164 format.
 */
export function normalizePhone(value: string, localeId: string): string | null {
	if (!value) return null;

	if (validatePhone(value, localeId) !== 0) return null;

	return parsePhone(value, localeId);
}

// ============================================================================
// Boolean Parsing & Validation
// ============================================================================

/**
 * Parse a boolean string according to locale.
 * Returns true, false, or null if invalid.
 */
export function parseBoolean(value: string, localeId: string): boolean | null {
	if (!value) return null;

	const locale = getLocale(localeId);
	const lower = value.toLowerCase().trim();

	if (locale.trueValues.includes(lower)) return true;
	if (locale.falseValues.includes(lower)) return false;

	return null;
}

/**
 * Validate a boolean string for the locale.
 * Returns 0 if valid, 1 if invalid.
 */
export function validateBoolean(value: string, localeId: string): number {
	if (!value) return 0;

	const result = parseBoolean(value, localeId);
	return result === null ? 1 : 0;
}

/**
 * Normalize a locale boolean to 'true' or 'false'.
 */
export function normalizeBoolean(value: string, localeId: string): string | null {
	const parsed = parseBoolean(value, localeId);
	if (parsed === null) return null;

	return String(parsed);
}
