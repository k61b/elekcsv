// ============================================================================
// Locale Configuration Types
// ============================================================================

/**
 * Configuration for a locale's formatting rules.
 */
export interface LocaleConfig {
	/** Locale identifier (e.g., 'tr', 'en', 'de') */
	id: string;

	// Date formatting
	/** Date formats in priority order (e.g., ['DD.MM.YYYY', 'DD/MM/YYYY']) */
	dateFormats: string[];

	// Number formatting
	/** Thousands separator (e.g., '.' for tr, ',' for en) */
	thousandsSeparator: string;
	/** Decimal separator (e.g., ',' for tr, '.' for en) */
	decimalSeparator: string;

	// Currency formatting
	/** Accepted currency symbols (e.g., ['₺', 'TL'] for tr) */
	currencySymbols: string[];
	/** Whether currency symbol can be prefix, suffix, or both */
	currencyPosition: "prefix" | "suffix" | "both";

	// Phone formatting
	/** Country calling code (e.g., '+90' for tr) */
	phoneCountryCode: string;
	/** Phone number patterns (for validation) */
	phonePatterns: RegExp[];
	/** Expected digit count including country code */
	phoneTotalDigits: number;

	// Boolean values
	/** Values that represent true */
	trueValues: string[];
	/** Values that represent false */
	falseValues: string[];
}

/**
 * Parsed date components.
 */
export interface ParsedDate {
	day: number;
	month: number;
	year: number;
}

/**
 * Date format descriptor.
 */
export interface DateFormatInfo {
	/** Original format string */
	format: string;
	/** Regex to match the format */
	regex: RegExp;
	/** Indices for extracting day, month, year from regex groups */
	dayIndex: number;
	monthIndex: number;
	yearIndex: number;
}
