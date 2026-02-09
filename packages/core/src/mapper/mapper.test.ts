import { describe, expect, test } from "bun:test";
import type { Schema } from "../types";
import { applyMapping, mapAndValidate, mapColumns, updateMapping } from "./mapper";

// ============================================================================
// Test Schema
// ============================================================================

const testSchema: Schema = {
	columns: {
		price: {
			type: "number",
			aliases: ["fiyat", "ürün fiyatı", "birim fiyat", "unit price", "amount"],
		},
		email: {
			type: "string",
			aliases: ["e-posta", "eposta", "mail", "email address", "e-mail"],
			rules: [{ rule: "email" }],
		},
		phone: {
			type: "phone",
			aliases: ["telefon", "tel", "phone number", "gsm", "cep"],
		},
		created_at: {
			type: "date",
			aliases: ["tarih", "kayıt tarihi", "date", "creation date", "oluşturma tarihi"],
		},
		name: {
			type: "string",
			aliases: ["ad", "ürün adı", "isim", "product name", "başlık", "title"],
		},
		sku: {
			type: "string",
			aliases: ["stok kodu", "ürün kodu", "product code", "barkod", "barcode"],
		},
		stock: {
			type: "integer",
			aliases: ["stok", "adet", "miktar", "quantity", "qty"],
		},
		category: {
			type: "string",
			aliases: ["kategori", "kat", "tür", "tip"],
		},
		active: {
			type: "boolean",
			aliases: ["aktif", "durum", "status", "enabled"],
		},
	},
};

// ============================================================================
// Exact Match Tests
// ============================================================================

describe("mapColumns - Exact Match", () => {
	test("exact match with same case", () => {
		const headers = ["price", "email", "name"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings).toHaveLength(3);
		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("exact");
		expect(result.mappings[0].score).toBe(1);

		expect(result.mappings[1].schemaColumn).toBe("email");
		expect(result.mappings[1].confidence).toBe("exact");

		expect(result.mappings[2].schemaColumn).toBe("name");
		expect(result.mappings[2].confidence).toBe("exact");

		expect(result.autoMapped).toBe(3);
		expect(result.needsReview).toBe(0);
		expect(result.unmapped).toBe(0);
	});

	test("case-insensitive exact match", () => {
		const headers = ["PRICE", "Email", "NAME"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("exact");

		expect(result.mappings[1].schemaColumn).toBe("email");
		expect(result.mappings[1].confidence).toBe("exact");

		expect(result.mappings[2].schemaColumn).toBe("name");
		expect(result.mappings[2].confidence).toBe("exact");

		expect(result.autoMapped).toBe(3);
	});

	test("trimmed exact match", () => {
		const headers = ["  price  ", " email ", "name"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("exact");
		expect(result.autoMapped).toBe(3);
	});
});

// ============================================================================
// Alias Match Tests
// ============================================================================

describe("mapColumns - Alias Match", () => {
	test("Turkish aliases", () => {
		const headers = ["Ürün Fiyatı", "E-Posta", "Telefon"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("alias");

		expect(result.mappings[1].schemaColumn).toBe("email");
		expect(result.mappings[1].confidence).toBe("alias");

		expect(result.mappings[2].schemaColumn).toBe("phone");
		expect(result.mappings[2].confidence).toBe("alias");

		expect(result.autoMapped).toBe(3);
	});

	test("single word alias", () => {
		const headers = ["fiyat"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("alias");
	});

	test("stok kodu alias", () => {
		const headers = ["stok kodu"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("sku");
		expect(result.mappings[0].confidence).toBe("alias");
	});

	test("mixed exact and alias", () => {
		const headers = ["price", "telefon", "name"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].confidence).toBe("exact");
		expect(result.mappings[1].confidence).toBe("alias");
		expect(result.mappings[1].schemaColumn).toBe("phone");
		expect(result.mappings[2].confidence).toBe("exact");
	});
});

// ============================================================================
// Fuzzy Match Tests
// ============================================================================

describe("mapColumns - Fuzzy Match", () => {
	test("typo in column name", () => {
		const headers = ["pricee"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].confidence).toBe("fuzzy");
		expect(result.mappings[0].score).toBeGreaterThan(0.6);
	});

	test("e-mail address fuzzy match", () => {
		const headers = ["e-mail address"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("email");
		// Could be alias or fuzzy depending on exact matching
	});

	test("product_name fuzzy match", () => {
		const headers = ["product_name"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("name");
	});

	test("fiyatı fuzzy match to alias", () => {
		const headers = ["fiyatı"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[0].score).toBeGreaterThan(0.6);
	});

	test("fuzzy threshold option", () => {
		const headers = ["xyz_random"];
		const result = mapColumns(headers, testSchema, { fuzzyThreshold: 0.9 });

		// With high threshold, shouldn't match anything
		expect(result.mappings[0].schemaColumn).toBe("");
		expect(result.unmapped).toBe(1);
	});
});

// ============================================================================
// Unmapped Tests
// ============================================================================

describe("mapColumns - Unmapped Columns", () => {
	test("completely unrelated column", () => {
		const headers = ["random_column"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("");
		expect(result.mappings[0].confidence).toBe("none");
		expect(result.unmappedCsvColumns).toContain(0);
		expect(result.unmapped).toBe(1);
	});

	test("schema column not in CSV", () => {
		const headers = ["price", "email"];
		const result = mapColumns(headers, testSchema);

		// Many schema columns won't be mapped
		expect(result.unmappedSchemaColumns).toContain("phone");
		expect(result.unmappedSchemaColumns).toContain("name");
		expect(result.unmappedSchemaColumns).toContain("sku");
	});

	test("empty header", () => {
		const headers = ["price", "", "email"];
		const result = mapColumns(headers, testSchema);

		expect(result.mappings[0].schemaColumn).toBe("price");
		expect(result.mappings[1].schemaColumn).toBe("");
		expect(result.mappings[1].confidence).toBe("none");
		expect(result.mappings[2].schemaColumn).toBe("email");
	});
});

// ============================================================================
// Conflict Resolution Tests
// ============================================================================

describe("mapColumns - Conflict Resolution", () => {
	test("two CSV columns match same schema column - best wins", () => {
		// "price" is exact, "amount" is alias - price should win
		const headers = ["amount", "price"];
		const result = mapColumns(headers, testSchema);

		// "price" (exact) should get the mapping
		expect(result.mappings[1].schemaColumn).toBe("price");
		expect(result.mappings[1].confidence).toBe("exact");

		// "amount" should be unmapped (since price is already taken)
		expect(result.mappings[0].schemaColumn).toBe("");
		expect(result.unmapped).toBe(1);
	});

	test("duplicate headers - first match wins", () => {
		const headers = ["price", "price"];
		const result = mapColumns(headers, testSchema);

		// First one should get the mapping (both have same score, first processed wins)
		const priceMapping = result.mappings.find((m) => m.schemaColumn === "price");
		expect(priceMapping).toBeDefined();

		// One should be unmapped
		const unmappedCount = result.mappings.filter((m) => m.schemaColumn === "").length;
		expect(unmappedCount).toBe(1);
	});

	test("greedy assignment picks highest score first", () => {
		const headers = ["fiyat", "price"];
		const result = mapColumns(headers, testSchema);

		// "price" (exact, score=1) should win over "fiyat" (alias, score=1)
		// But both have score 1, so first processed after sorting wins
		const priceCount = result.mappings.filter((m) => m.schemaColumn === "price").length;
		expect(priceCount).toBe(1);
	});
});

// ============================================================================
// applyMapping Tests
// ============================================================================

describe("applyMapping", () => {
	test("reorders columns to schema order", () => {
		const simpleSchema: Schema = {
			columns: {
				first: { type: "string" },
				second: { type: "string" },
				third: { type: "string" },
			},
		};

		const data = [
			["third", "first", "second"], // headers (reversed)
			["c1", "a1", "b1"],
			["c2", "a2", "b2"],
		];

		const mapping = mapColumns(data[0], simpleSchema);
		const result = applyMapping(data, mapping.mappings, simpleSchema);

		// Header row should be in schema order
		expect(result[0]).toEqual(["first", "second", "third"]);

		// Data should be reordered
		expect(result[1]).toEqual(["a1", "b1", "c1"]);
		expect(result[2]).toEqual(["a2", "b2", "c2"]);
	});

	test("fills empty for missing schema columns", () => {
		const data = [
			["price", "email"],
			["100", "a@b.com"],
		];

		const mapping = mapColumns(data[0], testSchema);
		const result = applyMapping(data, mapping.mappings, testSchema);

		// Should have all schema columns (9 columns)
		expect(result[0]).toHaveLength(9);
		expect(result[1]).toHaveLength(9);

		// price and email should have values
		const priceIdx = result[0].indexOf("price");
		const emailIdx = result[0].indexOf("email");
		expect(result[1][priceIdx]).toBe("100");
		expect(result[1][emailIdx]).toBe("a@b.com");

		// Other columns should be empty
		const phoneIdx = result[0].indexOf("phone");
		expect(result[1][phoneIdx]).toBe("");
	});

	test("drops unmapped CSV columns", () => {
		const simpleSchema: Schema = {
			columns: {
				name: { type: "string" },
			},
		};

		const data = [
			["name", "extra_col"],
			["John", "ignored"],
		];

		const mapping = mapColumns(data[0], simpleSchema);
		const result = applyMapping(data, mapping.mappings, simpleSchema);

		// Only schema columns in output
		expect(result[0]).toEqual(["name"]);
		expect(result[1]).toEqual(["John"]);
	});

	test("handles empty data", () => {
		const result = applyMapping([], [], testSchema);
		expect(result).toEqual([]);
	});

	test("headerless mode", () => {
		const simpleSchema: Schema = {
			columns: {
				col1: { type: "string" },
				col2: { type: "string" },
			},
		};

		// No header row
		const data = [
			["a", "b"],
			["c", "d"],
		];

		// Create manual mappings (no headers to map)
		const mappings = [
			{ csvIndex: 0, csvHeader: "", schemaColumn: "col2", confidence: "exact" as const, score: 1 },
			{ csvIndex: 1, csvHeader: "", schemaColumn: "col1", confidence: "exact" as const, score: 1 },
		];

		const result = applyMapping(data, mappings, simpleSchema, { hasHeader: false });

		// No header row added when hasHeader=false
		expect(result[0]).toEqual(["b", "a"]); // Reordered to schema order
		expect(result[1]).toEqual(["d", "c"]);
	});
});

// ============================================================================
// mapAndValidate Pipeline Tests
// ============================================================================

describe("mapAndValidate", () => {
	test("end-to-end: Turkish headers to validation", () => {
		const schema: Schema = {
			columns: {
				price: { type: "number", aliases: ["fiyat"] },
				email: { type: "string", aliases: ["eposta"], rules: [{ rule: "email" }] },
			},
		};

		const data = [
			["Fiyat", "Eposta"],
			["100", "test@example.com"],
			["200", "valid@test.org"],
		];

		const result = mapAndValidate(data, schema);

		expect(result.mapping.autoMapped).toBe(2);
		expect(result.validation.valid).toBe(true);
		expect(result.validation.stats.totalRows).toBe(2);
		expect(result.mappedData[0]).toEqual(["price", "email"]);
	});

	test("validation errors have correct column references", () => {
		const schema: Schema = {
			columns: {
				email: { type: "string", rules: [{ rule: "email" }] },
				price: { type: "number", aliases: ["fiyat"] },
			},
		};

		const data = [
			["Fiyat", "email"],
			["not_a_number", "invalid-email"],
		];

		const result = mapAndValidate(data, schema);

		expect(result.validation.valid).toBe(false);
		expect(result.validation.errors.length).toBeGreaterThan(0);
	});

	test("empty data returns valid result", () => {
		const result = mapAndValidate([], testSchema);

		expect(result.mapping.mappings).toHaveLength(0);
		expect(result.validation.valid).toBe(true);
		expect(result.mappedData).toHaveLength(0);
	});
});

// ============================================================================
// updateMapping Tests
// ============================================================================

describe("updateMapping", () => {
	test("updates mapping for CSV column", () => {
		const mappings = [
			{ csvIndex: 0, csvHeader: "col1", schemaColumn: "", confidence: "none" as const, score: 0 },
			{
				csvIndex: 1,
				csvHeader: "col2",
				schemaColumn: "name",
				confidence: "exact" as const,
				score: 1,
			},
		];

		const updated = updateMapping(mappings, 0, "price");

		expect(updated[0].schemaColumn).toBe("price");
		expect(updated[0].confidence).toBe("exact");
		expect(updated[0].score).toBe(1);
	});

	test("unmaps existing column when reassigning", () => {
		const mappings = [
			{
				csvIndex: 0,
				csvHeader: "col1",
				schemaColumn: "price",
				confidence: "exact" as const,
				score: 1,
			},
			{ csvIndex: 1, csvHeader: "col2", schemaColumn: "", confidence: "none" as const, score: 0 },
		];

		const updated = updateMapping(mappings, 1, "price");

		// col2 should now have price
		expect(updated[1].schemaColumn).toBe("price");

		// col1 should be unmapped
		expect(updated[0].schemaColumn).toBe("");
		expect(updated[0].confidence).toBe("none");
	});

	test("clears mapping when empty string passed", () => {
		const mappings = [
			{
				csvIndex: 0,
				csvHeader: "col1",
				schemaColumn: "price",
				confidence: "exact" as const,
				score: 1,
			},
		];

		const updated = updateMapping(mappings, 0, "");

		expect(updated[0].schemaColumn).toBe("");
		expect(updated[0].confidence).toBe("none");
		expect(updated[0].score).toBe(0);
	});

	test("returns unchanged for invalid csvIndex", () => {
		const mappings = [
			{
				csvIndex: 0,
				csvHeader: "col1",
				schemaColumn: "price",
				confidence: "exact" as const,
				score: 1,
			},
		];

		const updated = updateMapping(mappings, 99, "email");

		expect(updated).toEqual(mappings);
	});
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
	test("single column CSV", () => {
		const schema: Schema = {
			columns: {
				name: { type: "string" },
			},
		};

		const headers = ["name"];
		const result = mapColumns(headers, schema);

		expect(result.mappings).toHaveLength(1);
		expect(result.mappings[0].schemaColumn).toBe("name");
		expect(result.autoMapped).toBe(1);
	});

	test("schema with no aliases", () => {
		const schema: Schema = {
			columns: {
				simple: { type: "string" },
			},
		};

		const headers = ["simple"];
		const result = mapColumns(headers, schema);

		expect(result.mappings[0].schemaColumn).toBe("simple");
		expect(result.mappings[0].confidence).toBe("exact");
	});

	test("all columns exact match", () => {
		const schema: Schema = {
			columns: {
				a: { type: "string" },
				b: { type: "string" },
				c: { type: "string" },
			},
		};

		const headers = ["a", "b", "c"];
		const result = mapColumns(headers, schema);

		expect(result.autoMapped).toBe(3);
		expect(result.needsReview).toBe(0);
		expect(result.unmapped).toBe(0);
	});

	test("CSV has more columns than schema", () => {
		const schema: Schema = {
			columns: {
				keep: { type: "string" },
			},
		};

		const headers = ["keep", "drop1", "drop2"];
		const result = mapColumns(headers, schema);

		expect(result.mappings[0].schemaColumn).toBe("keep");
		expect(result.unmappedCsvColumns).toEqual([1, 2]);
		expect(result.unmapped).toBe(2);
	});

	test("schema has more columns than CSV", () => {
		const schema: Schema = {
			columns: {
				a: { type: "string" },
				b: { type: "string" },
				c: { type: "string" },
			},
		};

		const headers = ["a"];
		const result = mapColumns(headers, schema);

		expect(result.mappings[0].schemaColumn).toBe("a");
		expect(result.unmappedSchemaColumns).toContain("b");
		expect(result.unmappedSchemaColumns).toContain("c");
	});

	test("autoAcceptThreshold option affects needsReview count", () => {
		const schema: Schema = {
			columns: {
				email: { type: "string", aliases: ["mail"] },
			},
		};

		const headers = ["e-mail"]; // Fuzzy match

		// With high threshold, should need review
		const result1 = mapColumns(headers, schema, { autoAcceptThreshold: 0.95 });
		expect(result1.needsReview).toBe(1);

		// With low threshold, should auto-accept
		const result2 = mapColumns(headers, schema, { autoAcceptThreshold: 0.5 });
		expect(result2.autoMapped).toBe(1);
	});
});
