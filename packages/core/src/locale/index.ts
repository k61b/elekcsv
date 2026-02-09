// Types
export type { LocaleConfig, ParsedDate, DateFormatInfo } from "./types";

// Registry
export {
	getLocale,
	hasLocale,
	registerLocale,
	getLocaleIds,
	getDateFormats,
	trLocale,
	enLocale,
	enGBLocale,
	deLocale,
	frLocale,
} from "./registry";

// Parsers
export {
	// Date
	parseDate,
	validateDate,
	normalizeDateToISO,
	daysInMonth,
	isLeapYear,
	// Number
	parseNumber,
	validateNumber,
	normalizeNumber,
	// Currency
	parseCurrency,
	validateCurrency,
	normalizeCurrency,
	stripCurrencySymbol,
	// Phone
	parsePhone,
	validatePhone,
	normalizePhone,
	stripPhoneFormatting,
	// Boolean
	parseBoolean,
	validateBoolean,
	normalizeBoolean,
} from "./parsers";

// Code generation
export {
	genLocaleDateCheck,
	genLocaleNumberCheck,
	genLocaleNumberParse,
	genLocaleCurrencyCheck,
	genLocalePhoneCheck,
	genLocaleBooleanCheck,
	genLocaleTypeCheck,
} from "./codegen";
export type { LocaleFieldType } from "./codegen";
