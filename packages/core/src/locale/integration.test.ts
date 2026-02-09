import { describe, expect, test } from "bun:test";
import type { Schema } from "../types";
import { CompiledValidator, validate } from "../validator";

// ============================================================================
// Integration Tests: Locale-Aware Compiled Validation
// ============================================================================

describe("Locale-Aware Validation Integration", () => {
	describe("Turkish E-commerce Schema", () => {
		const schema: Schema = {
			locale: "tr",
			columns: {
				urun_adi: { type: "string", rules: [{ rule: "required" }] },
				fiyat: { type: "number", rules: [{ rule: "min", value: 0 }] },
				tarih: { type: "date" },
				telefon: { type: "phone" },
				tutar: { type: "currency" },
				aktif: { type: "boolean" },
			},
		};

		test("validates all Turkish formatted data", () => {
			const data = [
				["Laptop", "1.234,56", "25.01.2025", "+90 532 123 45 67", "₺1.234,56", "evet"],
				["Telefon", "999,99", "15/03/2025", "0532 123 45 67", "999,99 TL", "hayır"],
			];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});

		test("rejects invalid Turkish date format", () => {
			const data = [["Laptop", "1.234,56", "2025-01-25", "+90 532 123 45 67", "₺100", "evet"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === "tarih")).toBe(true);
		});

		test("rejects invalid Turkish phone (wrong country code)", () => {
			const data = [["Laptop", "1.234", "25.01.2025", "+1 555 123 4567", "₺100", "evet"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === "telefon")).toBe(true);
		});

		test("validates Turkish boolean values", () => {
			const data = [
				["Item1", "100", "01.01.2025", "0532 123 45 67", "₺100", "evet"],
				["Item2", "200", "01.01.2025", "0532 123 45 67", "₺200", "hayır"],
				["Item3", "300", "01.01.2025", "0532 123 45 67", "₺300", "doğru"],
				["Item4", "400", "01.01.2025", "0532 123 45 67", "₺400", "yanlış"],
				["Item5", "500", "01.01.2025", "0532 123 45 67", "₺500", "e"],
				["Item6", "600", "01.01.2025", "0532 123 45 67", "₺600", "h"],
			];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});

		test("rejects invalid Turkish boolean", () => {
			const data = [["Laptop", "100", "01.01.2025", "0532 123 45 67", "₺100", "belki"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === "aktif")).toBe(true);
		});

		test("validates date with leap year correctly", () => {
			const leapYearData = [["Item", "100", "29.02.2024", "0532 123 45 67", "₺100", "evet"]];
			const nonLeapYearData = [["Item", "100", "29.02.2025", "0532 123 45 67", "₺100", "evet"]];

			expect(validate(leapYearData, schema).valid).toBe(true);
			expect(validate(nonLeapYearData, schema).valid).toBe(false);
		});

		test("validates April 30 but rejects April 31", () => {
			const april30 = [["Item", "100", "30.04.2025", "0532 123 45 67", "₺100", "evet"]];
			const april31 = [["Item", "100", "31.04.2025", "0532 123 45 67", "₺100", "evet"]];

			expect(validate(april30, schema).valid).toBe(true);
			expect(validate(april31, schema).valid).toBe(false);
		});
	});

	describe("Column-Level Locale Override", () => {
		test("uses column locale over schema locale", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					tr_fiyat: { type: "number" }, // Uses schema locale (tr)
					en_price: { type: "number", locale: "en" }, // Overrides to en
				},
			};

			// Turkish format in tr column, English format in en column
			const data = [["1.234,56", "1,234.56"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});

		test("mixed locales in same schema", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					tr_tarih: { type: "date" }, // DD.MM.YYYY
					us_date: { type: "date", locale: "en" }, // MM/DD/YYYY
					uk_date: { type: "date", locale: "en-GB" }, // DD/MM/YYYY
				},
			};

			const data = [["25.01.2025", "01/25/2025", "25/01/2025"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});
	});

	describe("No Locale (Backward Compatibility)", () => {
		test("schema without locale uses default behavior", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string" },
					age: { type: "number" },
					active: { type: "boolean" },
					date: { type: "date" },
				},
			};

			// ISO date, standard number, English boolean
			const data = [["John", "25", "true", "2025-01-25"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});

		test("column without locale uses standard format even with schema locale", () => {
			// This is a subtle test: integer type doesn't use locale
			const schema: Schema = {
				locale: "tr",
				columns: {
					count: { type: "integer" }, // integer doesn't use locale
				},
			};

			const data = [["123"]];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});
	});

	describe("Min/Max with Locale Numbers", () => {
		test("min rule works with Turkish number format", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					fiyat: { type: "number", rules: [{ rule: "min", value: 1000 }] },
				},
			};

			const validData = [["1.234,56"]]; // 1234.56 > 1000
			const invalidData = [["999,99"]]; // 999.99 < 1000

			expect(validate(validData, schema).valid).toBe(true);
			expect(validate(invalidData, schema).valid).toBe(false);
		});

		test("max rule works with Turkish number format", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					fiyat: { type: "number", rules: [{ rule: "max", value: 1000 }] },
				},
			};

			const validData = [["999,99"]]; // 999.99 < 1000
			const invalidData = [["1.234,56"]]; // 1234.56 > 1000

			expect(validate(validData, schema).valid).toBe(true);
			expect(validate(invalidData, schema).valid).toBe(false);
		});
	});

	describe("CompiledValidator Reuse", () => {
		test("compiled validator can be reused with Turkish data", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					tarih: { type: "date" },
					fiyat: { type: "number" },
				},
			};

			const validator = new CompiledValidator(schema);

			const batch1 = [
				["25.01.2025", "1.234,56"],
				["26.01.2025", "2.345,67"],
			];

			const batch2 = [
				["27.01.2025", "3.456,78"],
				["28.01.2025", "4.567,89"],
			];

			expect(validator.validateAll(batch1).valid).toBe(true);
			expect(validator.validateAll(batch2).valid).toBe(true);
		});
	});

	describe("Empty Values with Locale", () => {
		test("empty values are valid without required rule", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					fiyat: { type: "number" },
					tarih: { type: "date" },
					telefon: { type: "phone" },
					aktif: { type: "boolean" },
				},
			};

			const data = [["", "", "", ""]];

			const result = validate(data, schema);
			expect(result.valid).toBe(true);
		});

		test("empty values are invalid with required rule", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					fiyat: { type: "number", rules: [{ rule: "required" }] },
				},
			};

			const data = [[""]];

			const result = validate(data, schema);
			expect(result.valid).toBe(false);
		});
	});

	describe("Error Messages", () => {
		test("provides meaningful error messages for locale validation", () => {
			const schema: Schema = {
				locale: "tr",
				columns: {
					tarih: { type: "date" },
				},
			};

			const data = [["invalid-date"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0].message).toBeDefined();
		});
	});
});

describe("Phone/Currency Types Without Locale", () => {
	test("phone type validates digit count without locale", () => {
		const schema: Schema = {
			columns: {
				phone: { type: "phone" },
			},
		};

		const validData = [["1234567890"]]; // 10 digits
		const invalidData = [["123"]]; // Too short

		expect(validate(validData, schema).valid).toBe(true);
		expect(validate(invalidData, schema).valid).toBe(false);
	});

	test("currency type validates number without locale", () => {
		const schema: Schema = {
			columns: {
				amount: { type: "currency" },
			},
		};

		const validData = [["$100.00"]];
		const invalidData = [["abc"]];

		expect(validate(validData, schema).valid).toBe(true);
		expect(validate(invalidData, schema).valid).toBe(false);
	});
});
