import { describe, expect, test } from "bun:test";
import {
	daysInMonth,
	getLocale,
	getLocaleIds,
	hasLocale,
	isLeapYear,
	normalizeBoolean,
	normalizeCurrency,
	normalizeDateToISO,
	normalizeNumber,
	normalizePhone,
	parseBoolean,
	parseCurrency,
	parseDate,
	parseNumber,
	parsePhone,
	registerLocale,
	validateBoolean,
	validateCurrency,
	validateDate,
	validateNumber,
	validatePhone,
} from "./index";
import type { LocaleConfig } from "./types";

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe("Helper Functions", () => {
	describe("isLeapYear", () => {
		test("2024 is a leap year", () => {
			expect(isLeapYear(2024)).toBe(true);
		});

		test("2023 is not a leap year", () => {
			expect(isLeapYear(2023)).toBe(false);
		});

		test("2000 is a leap year (divisible by 400)", () => {
			expect(isLeapYear(2000)).toBe(true);
		});

		test("1900 is not a leap year (divisible by 100 but not 400)", () => {
			expect(isLeapYear(1900)).toBe(false);
		});
	});

	describe("daysInMonth", () => {
		test("February in non-leap year has 28 days", () => {
			expect(daysInMonth(2, 2023)).toBe(28);
		});

		test("February in leap year has 29 days", () => {
			expect(daysInMonth(2, 2024)).toBe(29);
		});

		test("January has 31 days", () => {
			expect(daysInMonth(1, 2024)).toBe(31);
		});

		test("April has 30 days", () => {
			expect(daysInMonth(4, 2024)).toBe(30);
		});
	});
});

// ============================================================================
// Locale Registry Tests
// ============================================================================

describe("Locale Registry", () => {
	test("hasLocale returns true for built-in locales", () => {
		expect(hasLocale("tr")).toBe(true);
		expect(hasLocale("en")).toBe(true);
		expect(hasLocale("en-GB")).toBe(true);
		expect(hasLocale("de")).toBe(true);
	});

	test("hasLocale returns false for unknown locales", () => {
		expect(hasLocale("xyz")).toBe(false);
	});

	test("getLocale falls back to en for unknown locale", () => {
		const locale = getLocale("xyz");
		expect(locale.id).toBe("en");
	});

	test("getLocaleIds returns all registered locales", () => {
		const ids = getLocaleIds();
		expect(ids).toContain("tr");
		expect(ids).toContain("en");
		expect(ids).toContain("en-GB");
		expect(ids).toContain("de");
	});

	test("registerLocale adds custom locale", () => {
		const customLocale: LocaleConfig = {
			id: "custom-test",
			dateFormats: ["YYYY-MM-DD"],
			thousandsSeparator: ",",
			decimalSeparator: ".",
			currencySymbols: ["TEST"],
			currencyPosition: "prefix",
			phoneCountryCode: "+99",
			phonePatterns: [/^\d+$/],
			phoneTotalDigits: 10,
			trueValues: ["yep"],
			falseValues: ["nope"],
		};

		registerLocale(customLocale);
		expect(hasLocale("custom-test")).toBe(true);
		expect(getLocale("custom-test").id).toBe("custom-test");
	});
});

// ============================================================================
// Turkish Date Tests
// ============================================================================

describe("Turkish Date (tr)", () => {
	describe("parseDate", () => {
		test("DD.MM.YYYY format", () => {
			const result = parseDate("25.01.2025", "tr");
			expect(result).toEqual({ day: 25, month: 1, year: 2025 });
		});

		test("DD/MM/YYYY format", () => {
			const result = parseDate("25/01/2025", "tr");
			expect(result).toEqual({ day: 25, month: 1, year: 2025 });
		});

		test("returns null for invalid month", () => {
			expect(parseDate("25.13.2025", "tr")).toBeNull();
		});

		test("returns null for invalid day", () => {
			expect(parseDate("32.01.2025", "tr")).toBeNull();
		});

		test("returns null for empty value", () => {
			expect(parseDate("", "tr")).toBeNull();
		});
	});

	describe("validateDate", () => {
		test("valid date returns 0", () => {
			expect(validateDate("25.01.2025", "tr")).toBe(0);
		});

		test("valid date with / separator", () => {
			expect(validateDate("25/01/2025", "tr")).toBe(0);
		});

		test("invalid month returns error", () => {
			expect(validateDate("01.25.2025", "tr")).not.toBe(0);
		});

		test("leap year Feb 29 is valid", () => {
			expect(validateDate("29.02.2024", "tr")).toBe(0);
		});

		test("non-leap year Feb 29 is invalid", () => {
			expect(validateDate("29.02.2025", "tr")).not.toBe(0);
		});

		test("April 31 is invalid", () => {
			expect(validateDate("31.04.2025", "tr")).not.toBe(0);
		});

		test("empty value is valid (required handles this)", () => {
			expect(validateDate("", "tr")).toBe(0);
		});

		test("ISO format is invalid in tr locale", () => {
			expect(validateDate("2025-01-25", "tr")).not.toBe(0);
		});
	});

	describe("normalizeDateToISO", () => {
		test("normalizes DD.MM.YYYY to YYYY-MM-DD", () => {
			expect(normalizeDateToISO("25.01.2025", "tr")).toBe("2025-01-25");
		});

		test("normalizes DD/MM/YYYY to YYYY-MM-DD", () => {
			expect(normalizeDateToISO("05/03/2025", "tr")).toBe("2025-03-05");
		});

		test("returns null for invalid date", () => {
			expect(normalizeDateToISO("32.01.2025", "tr")).toBeNull();
		});
	});
});

// ============================================================================
// Turkish Number Tests
// ============================================================================

describe("Turkish Number (tr)", () => {
	describe("parseNumber", () => {
		test("parses 1.234,56 to 1234.56", () => {
			expect(parseNumber("1.234,56", "tr")).toBe(1234.56);
		});

		test("parses 1234,56 (no thousands sep) to 1234.56", () => {
			expect(parseNumber("1234,56", "tr")).toBe(1234.56);
		});

		test("parses 1.234 to 1234 (integer with thousands)", () => {
			expect(parseNumber("1.234", "tr")).toBe(1234);
		});

		test("parses negative number", () => {
			expect(parseNumber("-1.234,56", "tr")).toBe(-1234.56);
		});

		test("returns NaN for invalid", () => {
			expect(Number.isNaN(parseNumber("abc", "tr"))).toBe(true);
		});
	});

	describe("validateNumber", () => {
		test("valid Turkish number format", () => {
			expect(validateNumber("1.234,56", "tr")).toBe(0);
		});

		test("valid without thousands separator", () => {
			expect(validateNumber("1234,56", "tr")).toBe(0);
		});

		test("integer with thousands separator", () => {
			expect(validateNumber("1.234", "tr")).toBe(0);
		});

		test("negative number is valid", () => {
			expect(validateNumber("-1.234,56", "tr")).toBe(0);
		});

		test("empty value is valid", () => {
			expect(validateNumber("", "tr")).toBe(0);
		});

		// Note: The current implementation is liberal - it validates format
		// but doesn't strictly reject English format. This test documents current behavior.
		test("simple number is valid", () => {
			expect(validateNumber("123", "tr")).toBe(0);
		});
	});

	describe("normalizeNumber", () => {
		test("normalizes Turkish format to standard", () => {
			expect(normalizeNumber("1.234,56", "tr")).toBe("1234.56");
		});

		test("returns null for invalid", () => {
			expect(normalizeNumber("abc", "tr")).toBeNull();
		});
	});
});

// ============================================================================
// Turkish Currency Tests
// ============================================================================

describe("Turkish Currency (tr)", () => {
	describe("parseCurrency", () => {
		test("parses ₺1.234,56", () => {
			expect(parseCurrency("₺1.234,56", "tr")).toBe(1234.56);
		});

		test("parses 1.234,56 ₺ (suffix)", () => {
			expect(parseCurrency("1.234,56 ₺", "tr")).toBe(1234.56);
		});

		test("parses 1.234,56 TL", () => {
			expect(parseCurrency("1.234,56 TL", "tr")).toBe(1234.56);
		});

		test("parses TRY prefix", () => {
			expect(parseCurrency("TRY 1.234,56", "tr")).toBe(1234.56);
		});
	});

	describe("validateCurrency", () => {
		test("₺ prefix is valid", () => {
			expect(validateCurrency("₺1.234,56", "tr")).toBe(0);
		});

		test("₺ suffix is valid", () => {
			expect(validateCurrency("1.234,56 ₺", "tr")).toBe(0);
		});

		test("TL suffix is valid", () => {
			expect(validateCurrency("1.234,56 TL", "tr")).toBe(0);
		});

		test("empty value is valid", () => {
			expect(validateCurrency("", "tr")).toBe(0);
		});
	});

	describe("normalizeCurrency", () => {
		test("normalizes to plain number", () => {
			expect(normalizeCurrency("₺1.234,56", "tr")).toBe("1234.56");
		});
	});
});

// ============================================================================
// Turkish Phone Tests
// ============================================================================

describe("Turkish Phone (tr)", () => {
	describe("validatePhone", () => {
		test("+90 532 123 45 67 is valid", () => {
			expect(validatePhone("+90 532 123 45 67", "tr")).toBe(0);
		});

		test("05321234567 is valid", () => {
			expect(validatePhone("05321234567", "tr")).toBe(0);
		});

		test("0532 123 45 67 is valid", () => {
			expect(validatePhone("0532 123 45 67", "tr")).toBe(0);
		});

		test("+90 (532) 123 45 67 is valid (with parens)", () => {
			expect(validatePhone("+90 (532) 123 45 67", "tr")).toBe(0);
		});

		test("532 123 45 67 is valid (no 0 prefix)", () => {
			expect(validatePhone("532 123 45 67", "tr")).toBe(0);
		});

		test("123 is invalid (too short)", () => {
			expect(validatePhone("123", "tr")).not.toBe(0);
		});

		test("+1 555 123 4567 is invalid (US number)", () => {
			expect(validatePhone("+1 555 123 4567", "tr")).not.toBe(0);
		});

		test("empty value is valid", () => {
			expect(validatePhone("", "tr")).toBe(0);
		});
	});

	describe("normalizePhone", () => {
		test("normalizes to E.164 format", () => {
			const result = normalizePhone("0532 123 45 67", "tr");
			expect(result).toBe("+905321234567");
		});

		test("keeps already normalized format", () => {
			const result = normalizePhone("+905321234567", "tr");
			expect(result).toBe("+905321234567");
		});
	});
});

// ============================================================================
// Turkish Boolean Tests
// ============================================================================

describe("Turkish Boolean (tr)", () => {
	describe("parseBoolean", () => {
		test("evet → true", () => {
			expect(parseBoolean("evet", "tr")).toBe(true);
		});

		test("hayır → false", () => {
			expect(parseBoolean("hayır", "tr")).toBe(false);
		});

		test("Evet → true (case-insensitive)", () => {
			expect(parseBoolean("Evet", "tr")).toBe(true);
		});

		test("doğru → true", () => {
			expect(parseBoolean("doğru", "tr")).toBe(true);
		});

		test("yanlış → false", () => {
			expect(parseBoolean("yanlış", "tr")).toBe(false);
		});

		test("e → true (abbreviation)", () => {
			expect(parseBoolean("e", "tr")).toBe(true);
		});

		test("h → false (abbreviation)", () => {
			expect(parseBoolean("h", "tr")).toBe(false);
		});

		test("1 → true", () => {
			expect(parseBoolean("1", "tr")).toBe(true);
		});

		test("0 → false", () => {
			expect(parseBoolean("0", "tr")).toBe(false);
		});

		test("belki → null (invalid)", () => {
			expect(parseBoolean("belki", "tr")).toBeNull();
		});
	});

	describe("validateBoolean", () => {
		test("evet is valid", () => {
			expect(validateBoolean("evet", "tr")).toBe(0);
		});

		test("hayır is valid", () => {
			expect(validateBoolean("hayır", "tr")).toBe(0);
		});

		test("belki is invalid", () => {
			expect(validateBoolean("belki", "tr")).not.toBe(0);
		});

		test("empty value is valid", () => {
			expect(validateBoolean("", "tr")).toBe(0);
		});
	});

	describe("normalizeBoolean", () => {
		test("evet → 'true'", () => {
			expect(normalizeBoolean("evet", "tr")).toBe("true");
		});

		test("hayır → 'false'", () => {
			expect(normalizeBoolean("hayır", "tr")).toBe("false");
		});
	});
});

// ============================================================================
// English (US) Tests - Cross-check
// ============================================================================

describe("English (en) Cross-check", () => {
	describe("Date", () => {
		test("MM/DD/YYYY format (US)", () => {
			expect(validateDate("01/25/2025", "en")).toBe(0);
		});

		test("ISO format is also valid", () => {
			expect(validateDate("2025-01-25", "en")).toBe(0);
		});
	});

	describe("Number", () => {
		test("1,234.56 is valid", () => {
			expect(validateNumber("1,234.56", "en")).toBe(0);
		});

		test("parses correctly", () => {
			expect(parseNumber("1,234.56", "en")).toBe(1234.56);
		});
	});

	describe("Phone", () => {
		test("+1 (555) 123-4567 is valid", () => {
			expect(validatePhone("+1 (555) 123-4567", "en")).toBe(0);
		});

		test("555-123-4567 is valid", () => {
			expect(validatePhone("555-123-4567", "en")).toBe(0);
		});
	});

	describe("Boolean", () => {
		test("yes → true", () => {
			expect(parseBoolean("yes", "en")).toBe(true);
		});

		test("no → false", () => {
			expect(parseBoolean("no", "en")).toBe(false);
		});
	});
});

// ============================================================================
// English (GB) Tests
// ============================================================================

describe("English (en-GB)", () => {
	describe("Date", () => {
		test("DD/MM/YYYY format (UK)", () => {
			expect(validateDate("25/01/2025", "en-GB")).toBe(0);
		});
	});
});

// ============================================================================
// German Tests
// ============================================================================

describe("German (de)", () => {
	describe("Date", () => {
		test("DD.MM.YYYY format", () => {
			expect(validateDate("25.01.2025", "de")).toBe(0);
		});
	});

	describe("Number", () => {
		test("1.234,56 is valid (same as Turkish)", () => {
			expect(validateNumber("1.234,56", "de")).toBe(0);
		});
	});

	describe("Boolean", () => {
		test("ja → true", () => {
			expect(parseBoolean("ja", "de")).toBe(true);
		});

		test("nein → false", () => {
			expect(parseBoolean("nein", "de")).toBe(false);
		});

		test("wahr → true", () => {
			expect(parseBoolean("wahr", "de")).toBe(true);
		});

		test("falsch → false", () => {
			expect(parseBoolean("falsch", "de")).toBe(false);
		});
	});
});

// ============================================================================
// French Tests
// ============================================================================

describe("French (fr)", () => {
	describe("Number", () => {
		test("1 234,56 is valid (space as thousands)", () => {
			expect(validateNumber("1 234,56", "fr")).toBe(0);
		});

		test("parses correctly", () => {
			expect(parseNumber("1 234,56", "fr")).toBe(1234.56);
		});
	});

	describe("Boolean", () => {
		test("oui → true", () => {
			expect(parseBoolean("oui", "fr")).toBe(true);
		});

		test("non → false", () => {
			expect(parseBoolean("non", "fr")).toBe(false);
		});
	});
});
