import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearParserCache, compileParser, parseCodegen } from "./codegen";

// Helper to read fixture files
const fixturesDir = join(__dirname, "../../../../fixtures");
const readFixture = (name: string) => readFileSync(join(fixturesDir, name), "utf-8");

describe("compileParser", () => {
	beforeEach(() => {
		clearParserCache();
	});

	test("returns a function for simple CSV", () => {
		const sample = "a,b,c\n1,2,3\n4,5,6";
		const compiled = compileParser(sample);

		expect(typeof compiled.fn).toBe("function");
		expect(compiled.fieldCount).toBe(3);
		expect(compiled.hasQuotes).toBe(false);
		expect(compiled.lineEnding).toBe("\n");
	});

	test("detects \\r\\n line endings", () => {
		const sample = "a,b,c\r\n1,2,3\r\n4,5,6";
		const compiled = compileParser(sample);

		expect(compiled.lineEnding).toBe("\r\n");
	});

	test("detects quoted fields", () => {
		const sample = 'a,b,c\n"hello",2,3';
		const compiled = compileParser(sample);

		expect(compiled.hasQuotes).toBe(true);
	});

	test("correctly counts fields in quoted first row", () => {
		const sample = '"a,b",c,d\n1,2,3';
		const compiled = compileParser(sample);

		expect(compiled.fieldCount).toBe(3);
	});
});

describe("compiled function output", () => {
	beforeEach(() => {
		clearParserCache();
	});

	test("produces correct output for 3-col unquoted CSV", () => {
		const sample = "a,b,c\n1,2,3\n4,5,6\n7,8,9";
		const compiled = compileParser(sample);

		// Parse from start of data (after header)
		const rows = compiled.fn(sample, 6); // After "a,b,c\n"

		expect(rows).toEqual([
			["1", "2", "3"],
			["4", "5", "6"],
			["7", "8", "9"],
		]);
	});

	test("produces correct output for CSV with quoted fields", () => {
		const sample = 'a,b,c\n"hello, world",2,3\n4,"test",6';
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 6);

		expect(rows).toEqual([
			["hello, world", "2", "3"],
			["4", "test", "6"],
		]);
	});

	test("handles escaped quotes in quoted fields", () => {
		const sample = 'a,b\n"say ""hello""",2\n3,4';
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 4);

		expect(rows[0][0]).toBe('say "hello"');
		expect(rows[0][1]).toBe("2");
	});

	test("handles \\r\\n line endings", () => {
		const sample = "a,b,c\r\n1,2,3\r\n4,5,6";
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 7); // After "a,b,c\r\n"

		expect(rows).toEqual([
			["1", "2", "3"],
			["4", "5", "6"],
		]);
	});

	test("handles empty last line (trailing newline)", () => {
		const sample = "a,b\n1,2\n3,4\n";
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 4);

		expect(rows).toEqual([
			["1", "2"],
			["3", "4"],
		]);
	});

	test("handles single-row input (no trailing newline)", () => {
		const sample = "a,b\n1,2";
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 4);

		expect(rows).toEqual([["1", "2"]]);
	});

	test("handles single column CSV", () => {
		const sample = "name\nAlice\nBob\nCharlie";
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 5);

		expect(rows).toEqual([["Alice"], ["Bob"], ["Charlie"]]);
	});

	test("handles empty fields", () => {
		const sample = "a,b,c\n,2,\n1,,3";
		const compiled = compileParser(sample);

		const rows = compiled.fn(sample, 6);

		expect(rows).toEqual([
			["", "2", ""],
			["1", "", "3"],
		]);
	});
});

describe("cache", () => {
	beforeEach(() => {
		clearParserCache();
	});

	test("returns same function for same structure", () => {
		const sample1 = "a,b,c\n1,2,3";
		const sample2 = "x,y,z\n4,5,6"; // Same structure: 3 cols, no quotes, \n

		const compiled1 = compileParser(sample1);
		const compiled2 = compileParser(sample2);

		expect(compiled1.fn).toBe(compiled2.fn);
	});

	test("returns different function for different field count", () => {
		const sample1 = "a,b\n1,2";
		const sample2 = "a,b,c\n1,2,3";

		const compiled1 = compileParser(sample1);
		const compiled2 = compileParser(sample2);

		expect(compiled1.fn).not.toBe(compiled2.fn);
	});

	test("returns different function for quoted vs unquoted", () => {
		const sample1 = "a,b\n1,2";
		const sample2 = 'a,b\n"1",2';

		const compiled1 = compileParser(sample1);
		const compiled2 = compileParser(sample2);

		expect(compiled1.fn).not.toBe(compiled2.fn);
	});

	test("returns different function for different quote characters", () => {
		const sample = "'a',\"b\"\n'1',\"2\"";

		const compiled1 = compileParser(sample, { quote: '"' });
		const compiled2 = compileParser(sample, { quote: "'" });

		expect(compiled1.fn).not.toBe(compiled2.fn);
	});
});

describe("parseCodegen", () => {
	beforeEach(() => {
		clearParserCache();
	});

	describe("simple.csv", () => {
		const input = readFixture("simple.csv");

		test("should extract headers correctly", () => {
			const result = parseCodegen(input);
			expect(result.headers).toEqual(["name", "email", "age", "status"]);
		});

		test("should have 5 data rows (excluding header)", () => {
			const result = parseCodegen(input);
			expect(result.rowCount).toBe(5);
			expect(result.rows.length).toBe(5);
		});

		test("should correctly parse first data row with Turkish characters", () => {
			const result = parseCodegen(input);
			expect(result.rows[0]).toEqual(["Ömer", "omer@test.com", "28", "active"]);
		});

		test("should correctly parse all data rows", () => {
			const result = parseCodegen(input);
			expect(result.rows[1]).toEqual(["Şebnem", "sebnem@test.com", "34", "inactive"]);
			expect(result.rows[2]).toEqual(["Ali", "ali@example.com", "22", "active"]);
			expect(result.rows[3]).toEqual(["Ayşe", "ayse@test.com", "41", "pending"]);
			expect(result.rows[4]).toEqual(["Mehmet", "mehmet@test.com", "19", "active"]);
		});
	});

	describe("header:false", () => {
		test("should have null headers", () => {
			const input = "a,b,c\n1,2,3";
			const result = parseCodegen(input, { header: false });

			expect(result.headers).toBeNull();
			expect(result.rowCount).toBe(2);
			expect(result.rows[0]).toEqual(["a", "b", "c"]);
			expect(result.rows[1]).toEqual(["1", "2", "3"]);
		});
	});

	describe("empty input", () => {
		test("should handle empty string", () => {
			const result = parseCodegen("");

			expect(result.rows).toEqual([]);
			expect(result.headers).toBeNull();
			expect(result.rowCount).toBe(0);
			expect(result.fieldCount).toBe(0);
		});
	});

	describe("header only", () => {
		test("should handle header with no data", () => {
			const result = parseCodegen("a,b,c");

			expect(result.headers).toEqual(["a", "b", "c"]);
			expect(result.rows).toEqual([]);
			expect(result.rowCount).toBe(0);
		});

		test("should handle header with trailing newline", () => {
			const result = parseCodegen("a,b,c\n");

			expect(result.headers).toEqual(["a", "b", "c"]);
			expect(result.rows).toEqual([]);
			expect(result.rowCount).toBe(0);
		});
	});

	describe("skipEmptyLines", () => {
		test("should skip rows with all empty fields when enabled", () => {
			const input = "a,b,c\n1,2,3\n,,\n4,5,6";
			const result = parseCodegen(input, { skipEmptyLines: true });

			expect(result.rowCount).toBe(2);
			expect(result.rows[0]).toEqual(["1", "2", "3"]);
			expect(result.rows[1]).toEqual(["4", "5", "6"]);
		});

		test("should keep empty rows when disabled (default)", () => {
			const input = "a,b,c\n1,2,3\n,,\n4,5,6";
			const result = parseCodegen(input, { skipEmptyLines: false });

			expect(result.rowCount).toBe(3);
			expect(result.rows[1]).toEqual(["", "", ""]);
		});
	});

	describe("quoted fields", () => {
		test("should handle quoted fields with commas", () => {
			const input = 'name,description\nTest,"Hello, World"';
			const result = parseCodegen(input);

			expect(result.rows[0]).toEqual(["Test", "Hello, World"]);
		});

		test("should handle escaped quotes", () => {
			const input = 'name,quote\nTest,"She said ""Hello"""';
			const result = parseCodegen(input);

			expect(result.rows[0]).toEqual(["Test", 'She said "Hello"']);
		});

		test("should handle multiline quoted fields", () => {
			const input = 'name,text\nTest,"Line 1\nLine 2"';
			const result = parseCodegen(input);

			expect(result.rows[0]).toEqual(["Test", "Line 1\nLine 2"]);
		});
	});

	describe("custom delimiter", () => {
		test("should parse semicolon-separated values", () => {
			const input = "a;b;c\n1;2;3";
			const result = parseCodegen(input, { delimiter: ";" });

			expect(result.headers).toEqual(["a", "b", "c"]);
			expect(result.rows[0]).toEqual(["1", "2", "3"]);
		});

		test("should parse tab-separated values", () => {
			const input = "name\temail\tage\nJohn\tjohn@test.com\t25";
			const result = parseCodegen(input, { delimiter: "\t" });

			expect(result.headers).toEqual(["name", "email", "age"]);
			expect(result.rows[0]).toEqual(["John", "john@test.com", "25"]);
		});
	});

	describe("edge cases", () => {
		test("should handle single value", () => {
			const input = "value";
			const result = parseCodegen(input, { header: false });

			expect(result.rowCount).toBe(1);
			expect(result.rows[0]).toEqual(["value"]);
		});

		test("should handle Windows line endings", () => {
			const input = "a,b\r\n1,2\r\n3,4";
			const result = parseCodegen(input);

			expect(result.rowCount).toBe(2);
			expect(result.rows[0]).toEqual(["1", "2"]);
			expect(result.rows[1]).toEqual(["3", "4"]);
		});

		test("should handle trailing newline", () => {
			const input = "a,b\n1,2\n";
			const result = parseCodegen(input);

			expect(result.rowCount).toBe(1);
			expect(result.rows[0]).toEqual(["1", "2"]);
		});
	});

	describe("turkish-dates.csv", () => {
		const input = readFixture("turkish-dates.csv");

		test("should have correct headers", () => {
			const result = parseCodegen(input);
			expect(result.headers).toEqual(["ad", "tarih", "fiyat"]);
		});

		test("should preserve quoted Turkish price format (1.234,56)", () => {
			const result = parseCodegen(input);
			expect(result.rows[0][2]).toBe("1.234,56");
		});
	});
});
