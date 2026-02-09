import type { DateFormatInfo, LocaleConfig } from "./types";

// ============================================================================
// Built-in Locale Configurations
// ============================================================================

const trLocale: LocaleConfig = {
	id: "tr",

	// Date: DD.MM.YYYY or DD/MM/YYYY
	dateFormats: ["DD.MM.YYYY", "DD/MM/YYYY"],

	// Number: 1.234,56
	thousandsSeparator: ".",
	decimalSeparator: ",",

	// Currency: ₺ or TL
	currencySymbols: ["₺", "TL", "TRY"],
	currencyPosition: "both",

	// Phone: +90 5XX XXX XX XX
	phoneCountryCode: "+90",
	phonePatterns: [
		/^\+90\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}$/, // +90 532 123 45 67
		/^0\s?\d{3}\s?\d{3}\s?\d{2}\s?\d{2}$/, // 0532 123 45 67
		/^\d{10}$/, // 5321234567
		/^0\d{10}$/, // 05321234567
	],
	phoneTotalDigits: 12, // +90 + 10 digits

	// Boolean: evet/hayır
	trueValues: ["evet", "doğru", "e", "1", "true", "yes"],
	falseValues: ["hayır", "yanlış", "h", "0", "false", "no"],
};

const enLocale: LocaleConfig = {
	id: "en",

	// Date: MM/DD/YYYY (US default)
	dateFormats: ["MM/DD/YYYY", "YYYY-MM-DD"],

	// Number: 1,234.56
	thousandsSeparator: ",",
	decimalSeparator: ".",

	// Currency: $ or USD
	currencySymbols: ["$", "USD"],
	currencyPosition: "prefix",

	// Phone: +1 (XXX) XXX-XXXX
	phoneCountryCode: "+1",
	phonePatterns: [
		/^\+1\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}$/, // +1 (555) 123-4567
		/^\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}$/, // (555) 123-4567
		/^\d{10}$/, // 5551234567
	],
	phoneTotalDigits: 11, // +1 + 10 digits

	// Boolean
	trueValues: ["true", "yes", "y", "1"],
	falseValues: ["false", "no", "n", "0"],
};

const enGBLocale: LocaleConfig = {
	id: "en-GB",

	// Date: DD/MM/YYYY (UK format)
	dateFormats: ["DD/MM/YYYY", "YYYY-MM-DD"],

	// Number: same as US
	thousandsSeparator: ",",
	decimalSeparator: ".",

	// Currency: £ or GBP
	currencySymbols: ["£", "GBP"],
	currencyPosition: "prefix",

	// Phone: +44
	phoneCountryCode: "+44",
	phonePatterns: [
		/^\+44\s?\d{4}\s?\d{6}$/, // +44 XXXX XXXXXX
		/^\+44\s?\d{3}\s?\d{3}\s?\d{4}$/, // +44 XXX XXX XXXX
		/^0\d{10}$/, // 0XXXXXXXXXX
	],
	phoneTotalDigits: 12, // +44 + 10 digits

	// Boolean
	trueValues: ["true", "yes", "y", "1"],
	falseValues: ["false", "no", "n", "0"],
};

const deLocale: LocaleConfig = {
	id: "de",

	// Date: DD.MM.YYYY
	dateFormats: ["DD.MM.YYYY", "YYYY-MM-DD"],

	// Number: 1.234,56 (same as tr)
	thousandsSeparator: ".",
	decimalSeparator: ",",

	// Currency: € or EUR
	currencySymbols: ["€", "EUR"],
	currencyPosition: "both",

	// Phone: +49
	phoneCountryCode: "+49",
	phonePatterns: [
		/^\+49\s?\d{3,4}\s?\d{7,8}$/, // +49 XXX XXXXXXX
		/^0\d{10,11}$/, // 0XXXXXXXXXX
	],
	phoneTotalDigits: 13, // +49 + 10-11 digits

	// Boolean: ja/nein
	trueValues: ["ja", "wahr", "j", "1", "true", "yes"],
	falseValues: ["nein", "falsch", "n", "0", "false", "no"],
};

const frLocale: LocaleConfig = {
	id: "fr",

	// Date: DD/MM/YYYY
	dateFormats: ["DD/MM/YYYY", "YYYY-MM-DD"],

	// Number: 1 234,56 (space as thousands separator)
	thousandsSeparator: " ",
	decimalSeparator: ",",

	// Currency: € or EUR
	currencySymbols: ["€", "EUR"],
	currencyPosition: "suffix",

	// Phone: +33
	phoneCountryCode: "+33",
	phonePatterns: [
		/^\+33\s?\d\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/, // +33 X XX XX XX XX
		/^0\d\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/, // 0X XX XX XX XX
	],
	phoneTotalDigits: 11, // +33 + 9 digits

	// Boolean: oui/non
	trueValues: ["oui", "vrai", "o", "1", "true", "yes"],
	falseValues: ["non", "faux", "n", "0", "false", "no"],
};

// ============================================================================
// Locale Registry
// ============================================================================

const localeRegistry = new Map<string, LocaleConfig>();

// Register built-in locales
localeRegistry.set("tr", trLocale);
localeRegistry.set("en", enLocale);
localeRegistry.set("en-US", enLocale); // Alias
localeRegistry.set("en-GB", enGBLocale);
localeRegistry.set("de", deLocale);
localeRegistry.set("fr", frLocale);

// Default fallback locale
const fallbackLocale = enLocale;

/**
 * Get a locale configuration by ID.
 * Falls back to 'en' if locale is not found.
 */
export function getLocale(localeId: string): LocaleConfig {
	return localeRegistry.get(localeId) ?? fallbackLocale;
}

/**
 * Check if a locale is registered.
 */
export function hasLocale(localeId: string): boolean {
	return localeRegistry.has(localeId);
}

/**
 * Register a custom locale configuration.
 */
export function registerLocale(config: LocaleConfig): void {
	localeRegistry.set(config.id, config);
}

/**
 * Get all registered locale IDs.
 */
export function getLocaleIds(): string[] {
	return Array.from(localeRegistry.keys());
}

// ============================================================================
// Date Format Parsing
// ============================================================================

const dateFormatCache = new Map<string, DateFormatInfo[]>();

/**
 * Parse date format string into regex and index mappings.
 */
function parseDateFormat(format: string): DateFormatInfo {
	// Convert format to regex and track positions
	let regex = "";
	let dayIndex = 0;
	let monthIndex = 0;
	let yearIndex = 0;
	let groupIndex = 0;

	const parts = format.split(/([DMY]+)/);

	for (const part of parts) {
		if (!part) continue;

		if (part === "DD") {
			groupIndex++;
			dayIndex = groupIndex;
			regex += "(\\d{2})";
		} else if (part === "MM") {
			groupIndex++;
			monthIndex = groupIndex;
			regex += "(\\d{2})";
		} else if (part === "YYYY") {
			groupIndex++;
			yearIndex = groupIndex;
			regex += "(\\d{4})";
		} else {
			// Separator - escape regex special chars
			regex += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	}

	return {
		format,
		regex: new RegExp(`^${regex}$`),
		dayIndex,
		monthIndex,
		yearIndex,
	};
}

/**
 * Get parsed date formats for a locale.
 */
export function getDateFormats(localeId: string): DateFormatInfo[] {
	const cached = dateFormatCache.get(localeId);
	if (cached) return cached;

	const locale = getLocale(localeId);
	const formats = locale.dateFormats.map(parseDateFormat);

	dateFormatCache.set(localeId, formats);
	return formats;
}

// ============================================================================
// Exports
// ============================================================================

export { trLocale, enLocale, enGBLocale, deLocale, frLocale };
