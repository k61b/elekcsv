import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Schema } from "@elekcsv/core";

// Since we can't use @testing-library/react-hooks with bun:test easily,
// we'll test the core logic by importing the helper functions and
// testing the state machine integration.

import { createInitialState, importerReducer } from "./state-machine";
import type { ImporterAction, ImporterState } from "./types";

// ============================================================================
// Test Schema
// ============================================================================

const testSchema: Schema = {
	columns: {
		name: {
			type: "string",
			rules: [{ rule: "required" }, { rule: "minLength", value: 2 }],
		},
		email: {
			type: "string",
			rules: [{ rule: "required" }, { rule: "email" }],
		},
		age: {
			type: "integer",
			rules: [
				{ rule: "min", value: 0 },
				{ rule: "max", value: 150 },
			],
		},
	},
};

const schemaWithAliases: Schema = {
	columns: {
		name: {
			type: "string",
			rules: [{ rule: "required" }],
			aliases: ["full_name", "user_name", "ad"],
		},
		email: {
			type: "string",
			rules: [{ rule: "required" }, { rule: "email" }],
			aliases: ["email_address", "e-mail"],
		},
	},
};

// ============================================================================
// Integration Tests with Core
// ============================================================================

describe("integration with @elekcsv/core", () => {
	describe("parse integration", () => {
		test("parse function processes CSV correctly", async () => {
			const { parse } = await import("@elekcsv/core");

			const csv = "name,email,age\nJohn Doe,john@example.com,30\nJane Smith,jane@example.com,25";
			const result = parse(csv);

			expect(result.headers).toEqual(["name", "email", "age"]);
			expect(result.rows).toHaveLength(2);
			expect(result.rows[0]).toEqual(["John Doe", "john@example.com", "30"]);
		});

		test("parse handles custom delimiter", async () => {
			const { parse } = await import("@elekcsv/core");

			const csv = "name;email;age\nJohn;john@example.com;30";
			const result = parse(csv, { delimiter: ";" });

			expect(result.headers).toEqual(["name", "email", "age"]);
			expect(result.rows[0]).toEqual(["John", "john@example.com", "30"]);
		});

		test("parse handles quoted fields", async () => {
			const { parse } = await import("@elekcsv/core");

			const csv = 'name,email\n"John, Jr.",john@example.com';
			const result = parse(csv);

			expect(result.rows[0][0]).toBe("John, Jr.");
		});
	});

	describe("mapColumns integration", () => {
		test("exact matching works", async () => {
			const { mapColumns } = await import("@elekcsv/core");

			const headers = ["name", "email", "age"];
			const result = mapColumns(headers, testSchema);

			expect(result.autoMapped).toBe(3);
			expect(result.needsReview).toBe(0);
			expect(result.unmapped).toBe(0);
			expect(result.unmappedSchemaColumns).toHaveLength(0);

			expect(result.mappings[0].schemaColumn).toBe("name");
			expect(result.mappings[0].confidence).toBe("exact");
			expect(result.mappings[1].schemaColumn).toBe("email");
			expect(result.mappings[2].schemaColumn).toBe("age");
		});

		test("alias matching works", async () => {
			const { mapColumns } = await import("@elekcsv/core");

			const headers = ["full_name", "email_address"];
			const result = mapColumns(headers, schemaWithAliases);

			expect(result.mappings[0].schemaColumn).toBe("name");
			expect(result.mappings[0].confidence).toBe("alias");
			expect(result.mappings[1].schemaColumn).toBe("email");
			expect(result.mappings[1].confidence).toBe("alias");
		});

		test("fuzzy matching works", async () => {
			const { mapColumns } = await import("@elekcsv/core");

			const headers = ["user_email", "user_name"];
			const result = mapColumns(headers, testSchema, { fuzzyThreshold: 0.5 });

			// Should find fuzzy matches
			const emailMapping = result.mappings.find((m) => m.schemaColumn === "email");
			const nameMapping = result.mappings.find((m) => m.schemaColumn === "name");

			expect(emailMapping?.confidence).toBe("fuzzy");
			expect(nameMapping?.confidence).toBe("fuzzy");
		});

		test("unmapped columns are tracked", async () => {
			const { mapColumns } = await import("@elekcsv/core");

			const headers = ["name", "xyz123"];
			const result = mapColumns(headers, testSchema);

			expect(result.unmappedCsvColumns).toContain(1);
			expect(result.unmappedSchemaColumns).toContain("email");
			expect(result.unmappedSchemaColumns).toContain("age");
		});
	});

	describe("applyMapping integration", () => {
		test("reorders columns to match schema", async () => {
			const { mapColumns, applyMapping } = await import("@elekcsv/core");

			const headers = ["email", "name", "age"];
			const data = [
				["john@example.com", "John", "30"],
				["jane@example.com", "Jane", "25"],
			];

			const mapping = mapColumns(headers, testSchema);
			// hasHeader: false because data doesn't include header row
			const result = applyMapping(data, mapping.mappings, testSchema, { hasHeader: false });

			// Schema order is: name, email, age
			expect(result[0]).toEqual(["John", "john@example.com", "30"]);
			expect(result[1]).toEqual(["Jane", "jane@example.com", "25"]);
		});

		test("fills empty string for unmapped schema columns", async () => {
			const { mapColumns, applyMapping } = await import("@elekcsv/core");

			const headers = ["name"];
			const data = [["John"]];

			const mapping = mapColumns(headers, testSchema);
			// hasHeader: false because data doesn't include header row
			const result = applyMapping(data, mapping.mappings, testSchema, { hasHeader: false });

			// Schema has: name, email, age - only name is mapped
			expect(result[0]).toEqual(["John", "", ""]);
		});
	});

	describe("validate integration", () => {
		test("validates data against schema", async () => {
			const { validate } = await import("@elekcsv/core");

			const data = [
				["John", "john@example.com", "30"],
				["", "invalid-email", "200"], // All invalid
			];

			const result = validate(data, testSchema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.stats.errorRows).toBe(1);
			expect(result.stats.validRows).toBe(1);
		});

		test("returns valid for correct data", async () => {
			const { validate } = await import("@elekcsv/core");

			const data = [
				["John", "john@example.com", "30"],
				["Jane", "jane@example.com", "25"],
			];

			const result = validate(data, testSchema);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.stats.validRows).toBe(2);
		});

		test("validates required fields", async () => {
			const { validate } = await import("@elekcsv/core");

			const data = [
				["", "john@example.com", "30"], // name is required
			];

			const result = validate(data, testSchema);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === "name")).toBe(true);
		});

		test("validates email format", async () => {
			const { validate } = await import("@elekcsv/core");

			const data = [["John", "not-an-email", "30"]];

			const result = validate(data, testSchema);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.field === "email")).toBe(true);
		});

		test("validates min/max rules", async () => {
			const { validate } = await import("@elekcsv/core");

			const data = [
				["John", "john@example.com", "-5"], // age < 0
				["Jane", "jane@example.com", "200"], // age > 150
			];

			const result = validate(data, testSchema);

			expect(result.valid).toBe(false);
			expect(result.errors.filter((e) => e.field === "age")).toHaveLength(2);
		});
	});

	describe("validateBitmap integration", () => {
		test("returns bitmap result with lazy error access", async () => {
			const { validateBitmap } = await import("@elekcsv/core");

			const data = [
				["John", "john@example.com", "30"],
				["", "invalid", "999"], // errors
			];

			const result = validateBitmap(data, testSchema);

			expect(result.valid).toBe(false);
			expect(result.rowCount).toBe(2);
			expect(result.errorCount).toBeGreaterThan(0);

			// Test lazy error access
			const errors = result.getErrors({ limit: 10 });
			expect(errors.length).toBeGreaterThan(0);

			const rowErrors = result.getRowErrors(1);
			expect(rowErrors.length).toBeGreaterThan(0);

			const cellError = result.getCellError(1, 0); // row 1, col 0 (name)
			expect(cellError).not.toBeNull();
		});
	});

	describe("updateMapping integration", () => {
		test("updates mapping correctly", async () => {
			const { mapColumns, updateMapping } = await import("@elekcsv/core");

			const headers = ["col1", "col2"];
			const mapping = mapColumns(headers, testSchema);

			// Update col1 to map to email
			const updated = updateMapping(mapping.mappings, 0, "email");

			expect(updated[0].schemaColumn).toBe("email");
		});
	});
});

// ============================================================================
// Full Pipeline Tests
// ============================================================================

describe("full pipeline simulation", () => {
	test("complete import flow with validation errors", async () => {
		const { parse, mapColumns, applyMapping, validate } = await import("@elekcsv/core");

		// Step 1: Parse
		const csv = "name,email,age\nJohn Doe,john@example.com,30\nJane,invalid-email,25";
		const parseResult = parse(csv);

		expect(parseResult.headers).toEqual(["name", "email", "age"]);
		expect(parseResult.rows).toHaveLength(2);

		// Step 2: Map columns
		const headers = parseResult.headers ?? [];
		const mappingResult = mapColumns(headers, testSchema);

		expect(mappingResult.autoMapped).toBe(3);
		expect(mappingResult.unmappedSchemaColumns).toHaveLength(0);

		// Step 3: Apply mapping (reorder data) - hasHeader: false since parseResult.rows doesn't include header
		const mappedData = applyMapping(parseResult.rows, mappingResult.mappings, testSchema, {
			hasHeader: false,
		});

		expect(mappedData).toHaveLength(2);

		// Step 4: Validate
		const validationResult = validate(mappedData, testSchema);

		expect(validationResult.valid).toBe(false);
		expect(validationResult.stats.totalRows).toBe(2);
		expect(validationResult.stats.validRows).toBe(1);
		expect(validationResult.stats.errorRows).toBe(1);

		// Should have email error on row 1
		const emailError = validationResult.errors.find((e) => e.row === 1 && e.field === "email");
		expect(emailError).toBeDefined();
	});

	test("complete import flow with column reordering", async () => {
		const { parse, mapColumns, applyMapping, validate } = await import("@elekcsv/core");

		// CSV has columns in different order than schema
		const csv = "age,email,name\n30,john@example.com,John\n25,jane@example.com,Jane";
		const parseResult = parse(csv);

		const headers = parseResult.headers ?? [];
		const mappingResult = mapColumns(headers, testSchema);

		// Apply mapping to reorder to schema order (name, email, age) - hasHeader: false
		const mappedData = applyMapping(parseResult.rows, mappingResult.mappings, testSchema, {
			hasHeader: false,
		});

		// Verify reordering
		expect(mappedData[0]).toEqual(["John", "john@example.com", "30"]);
		expect(mappedData[1]).toEqual(["Jane", "jane@example.com", "25"]);

		// Validate reordered data
		const validationResult = validate(mappedData, testSchema);
		expect(validationResult.valid).toBe(true);
	});

	test("handles missing columns gracefully", async () => {
		const { parse, mapColumns, applyMapping, validate } = await import("@elekcsv/core");

		// CSV missing 'age' column
		const csv = "name,email\nJohn,john@example.com";
		const parseResult = parse(csv);

		const headers = parseResult.headers ?? [];
		const mappingResult = mapColumns(headers, testSchema);

		expect(mappingResult.unmappedSchemaColumns).toContain("age");

		// Apply mapping - age column should be empty - hasHeader: false
		const mappedData = applyMapping(parseResult.rows, mappingResult.mappings, testSchema, {
			hasHeader: false,
		});

		expect(mappedData[0]).toEqual(["John", "john@example.com", ""]);

		// Validate - age is optional (no required rule), so should pass
		const validationResult = validate(mappedData, testSchema);
		expect(validationResult.valid).toBe(true);
	});

	test("handles extra CSV columns", async () => {
		const { parse, mapColumns, applyMapping, validate } = await import("@elekcsv/core");

		// CSV has extra 'phone' column not in schema
		const csv = "name,email,age,phone\nJohn,john@example.com,30,555-1234";
		const parseResult = parse(csv);

		const headers = parseResult.headers ?? [];
		const mappingResult = mapColumns(headers, testSchema);

		expect(mappingResult.unmappedCsvColumns).toContain(3); // phone index

		// Apply mapping - phone should be dropped - hasHeader: false
		const mappedData = applyMapping(parseResult.rows, mappingResult.mappings, testSchema, {
			hasHeader: false,
		});

		expect(mappedData[0]).toEqual(["John", "john@example.com", "30"]);

		const validationResult = validate(mappedData, testSchema);
		expect(validationResult.valid).toBe(true);
	});
});

// ============================================================================
// Reducer Integration Tests
// ============================================================================

describe("reducer with real core data", () => {
	test("flows through states correctly with parsed data", async () => {
		const { parse, mapColumns, applyMapping, validate } = await import("@elekcsv/core");

		let state = createInitialState();

		// Load file
		const file = new File(["test"], "test.csv");
		state = importerReducer(state, { type: "LOAD_FILE", file });
		expect(state.step).toBe("parsing");

		// Parse
		const csv = "name,email,age\nJohn,john@example.com,30";
		const parseResult = parse(csv);

		const headers = parseResult.headers ?? [];
		state = importerReducer(state, {
			type: "PARSE_COMPLETE",
			data: parseResult.rows,
			headers,
			time: 5,
		});
		expect(state.step).toBe("mapping");
		expect(state.headers).toEqual(["name", "email", "age"]);

		// Set mapping
		const mapping = mapColumns(headers, testSchema);
		state = importerReducer(state, { type: "SET_MAPPING", mapping });
		expect(state.mapping?.autoMapped).toBe(3);

		// Apply mapping and confirm - hasHeader: false since rows don't include header
		const mappedData = applyMapping(parseResult.rows, mapping.mappings, testSchema, {
			hasHeader: false,
		});
		state = importerReducer(state, { type: "CONFIRM_MAPPING", mappedData });
		expect(state.step).toBe("validating");

		// Validate
		const validationResult = validate(mappedData, testSchema);
		state = importerReducer(state, {
			type: "VALIDATE_COMPLETE",
			result: validationResult,
			time: 10,
			isBitmap: false,
		});
		expect(state.step).toBe("review");
		expect(state.validation?.valid).toBe(true);

		// Accept
		state = importerReducer(state, { type: "ACCEPT" });
		expect(state.step).toBe("complete");
	});
});

// ============================================================================
// Options Tests
// ============================================================================

describe("hook options behavior", () => {
	test("maxRows limits data", async () => {
		const { parse } = await import("@elekcsv/core");

		const csv = "name\nRow1\nRow2\nRow3\nRow4\nRow5";
		const result = parse(csv);

		// Simulate maxRows option
		const maxRows = 3;
		const limitedData = result.rows.slice(0, maxRows);

		expect(limitedData).toHaveLength(3);
		expect(limitedData[2][0]).toBe("Row3");
	});

	test("custom delimiter is passed through", async () => {
		const { parse } = await import("@elekcsv/core");

		const csv = "name|email\nJohn|john@example.com";
		const result = parse(csv, { delimiter: "|" });

		expect(result.headers).toEqual(["name", "email"]);
		expect(result.rows[0]).toEqual(["John", "john@example.com"]);
	});

	test("locale-aware parsing works", async () => {
		const { validate } = await import("@elekcsv/core");

		const schemaWithLocale: Schema = {
			locale: "tr",
			columns: {
				price: {
					type: "number",
					locale: "tr",
				},
			},
		};

		// Turkish format: 1.234,56
		const data = [["1.234,56"]];
		const result = validate(data, schemaWithLocale);

		expect(result.valid).toBe(true);
	});
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("error handling", () => {
	test("parse errors are caught", () => {
		let state = createInitialState();

		state = importerReducer(state, {
			type: "LOAD_FILE",
			file: new File([""], "test.csv"),
		});

		// Simulate parse error
		state = importerReducer(state, {
			type: "PARSE_ERROR",
			error: "Empty file",
		});

		expect(state.step).toBe("error");
		expect(state.error).toBe("Empty file");
	});

	test("validation errors are caught", () => {
		let state: ImporterState = {
			...createInitialState(),
			step: "validating",
		};

		state = importerReducer(state, {
			type: "VALIDATE_ERROR",
			error: "Schema mismatch",
		});

		expect(state.step).toBe("error");
		expect(state.error).toBe("Schema mismatch");
	});

	test("reset clears error state", () => {
		let state: ImporterState = {
			...createInitialState(),
			step: "error",
			error: "Some error",
		};

		state = importerReducer(state, { type: "RESET" });

		expect(state.step).toBe("idle");
		expect(state.error).toBeNull();
	});
});

// ============================================================================
// Computed Values Tests
// ============================================================================

describe("computed values", () => {
	test("hasErrors detection from validation result", async () => {
		const { validate } = await import("@elekcsv/core");

		// Valid data
		const validData = [["John", "john@example.com", "30"]];
		const validResult = validate(validData, testSchema);
		expect(validResult.errors.length === 0).toBe(true); // No errors

		// Invalid data
		const invalidData = [["", "invalid", "999"]];
		const invalidResult = validate(invalidData, testSchema);
		expect(invalidResult.errors.length > 0).toBe(true); // Has errors
	});

	test("error summary calculation", async () => {
		const { validate } = await import("@elekcsv/core");

		const data = [
			["", "invalid-email", "30"], // required + email errors
			["John", "also-invalid", "25"], // email error
		];

		const result = validate(data, testSchema);

		expect(result.stats.errorsByRule.required).toBe(1);
		expect(result.stats.errorsByRule.email).toBe(2);
	});
});
