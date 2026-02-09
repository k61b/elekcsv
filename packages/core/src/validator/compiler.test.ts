import { describe, expect, test } from "bun:test";
import type { ColumnDef, Rule } from "../types";
import { compileColumn, compileSchema } from "./compiler";

describe("compileColumn", () => {
	describe("required rule", () => {
		test("fails on empty string", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "required" }],
			};
			const compiled = compileColumn(col, "name");
			expect(compiled.fn("")).not.toBe(0);
		});

		test("passes on non-empty string", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "required" }],
			};
			const compiled = compileColumn(col, "name");
			expect(compiled.fn("hello")).toBe(0);
		});

		test("passes on whitespace-only string (not trimmed)", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "required" }],
			};
			const compiled = compileColumn(col, "name");
			expect(compiled.fn("   ")).toBe(0);
		});
	});

	describe("min/max rules", () => {
		test("min rule - fails when value is below minimum", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "min", value: 0 }],
			};
			const compiled = compileColumn(col, "price");
			expect(compiled.fn("-1")).not.toBe(0);
		});

		test("min rule - passes at boundary", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "min", value: 0 }],
			};
			const compiled = compileColumn(col, "price");
			expect(compiled.fn("0")).toBe(0);
		});

		test("min rule - passes above boundary", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "min", value: 0 }],
			};
			const compiled = compileColumn(col, "price");
			expect(compiled.fn("1")).toBe(0);
		});

		test("max rule - fails when value is above maximum", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "max", value: 100 }],
			};
			const compiled = compileColumn(col, "score");
			expect(compiled.fn("101")).not.toBe(0);
		});

		test("max rule - passes at boundary", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "max", value: 100 }],
			};
			const compiled = compileColumn(col, "score");
			expect(compiled.fn("100")).toBe(0);
		});

		test("max rule - passes below boundary", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "max", value: 100 }],
			};
			const compiled = compileColumn(col, "score");
			expect(compiled.fn("50")).toBe(0);
		});

		test("min/max with decimal values", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [
					{ rule: "min", value: 0.5 },
					{ rule: "max", value: 9.5 },
				],
			};
			const compiled = compileColumn(col, "rating");
			expect(compiled.fn("0.4")).not.toBe(0);
			expect(compiled.fn("0.5")).toBe(0);
			expect(compiled.fn("9.5")).toBe(0);
			expect(compiled.fn("9.6")).not.toBe(0);
		});
	});

	describe("minLength/maxLength rules", () => {
		test("minLength - fails when string is too short", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "minLength", value: 3 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("ab")).not.toBe(0);
		});

		test("minLength - passes at boundary", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "minLength", value: 3 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("abc")).toBe(0);
		});

		test("minLength - passes above boundary", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "minLength", value: 3 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("abcd")).toBe(0);
		});

		test("maxLength - fails when string is too long", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "maxLength", value: 5 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("abcdef")).not.toBe(0);
		});

		test("maxLength - passes at boundary", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "maxLength", value: 5 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("abcde")).toBe(0);
		});

		test("maxLength - passes below boundary", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "maxLength", value: 5 }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("abc")).toBe(0);
		});
	});

	describe("pattern rule", () => {
		test("pattern with RegExp - fails on mismatch", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "pattern", value: /^[A-Z]{3}$/ }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("AB")).not.toBe(0);
			expect(compiled.fn("ABCD")).not.toBe(0);
			expect(compiled.fn("abc")).not.toBe(0);
		});

		test("pattern with RegExp - passes on match", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "pattern", value: /^[A-Z]{3}$/ }],
			};
			const compiled = compileColumn(col, "code");
			expect(compiled.fn("ABC")).toBe(0);
			expect(compiled.fn("XYZ")).toBe(0);
		});

		test("pattern with case-insensitive flag", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "pattern", value: /^yes$/i }],
			};
			const compiled = compileColumn(col, "confirm");
			expect(compiled.fn("yes")).toBe(0);
			expect(compiled.fn("YES")).toBe(0);
			expect(compiled.fn("Yes")).toBe(0);
			expect(compiled.fn("no")).not.toBe(0);
		});
	});

	describe("enum rule", () => {
		test("fails on value not in list", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "enum", values: ["red", "green", "blue"] }],
			};
			const compiled = compileColumn(col, "color");
			expect(compiled.fn("yellow")).not.toBe(0);
			expect(compiled.fn("RED")).not.toBe(0); // case sensitive
		});

		test("passes on value in list", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "enum", values: ["red", "green", "blue"] }],
			};
			const compiled = compileColumn(col, "color");
			expect(compiled.fn("red")).toBe(0);
			expect(compiled.fn("green")).toBe(0);
			expect(compiled.fn("blue")).toBe(0);
		});

		test("handles special characters in enum values", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [{ rule: "enum", values: ['a"b', "c'd", "e\\f"] }],
			};
			const compiled = compileColumn(col, "special");
			expect(compiled.fn('a"b')).toBe(0);
			expect(compiled.fn("c'd")).toBe(0);
			expect(compiled.fn("e\\f")).toBe(0);
		});
	});

	describe("type checking", () => {
		test("number type - fails on non-numeric value", () => {
			const col: ColumnDef = { type: "number" };
			const compiled = compileColumn(col, "amount");
			expect(compiled.fn("abc")).not.toBe(0);
			expect(compiled.fn("12.34.56")).not.toBe(0);
		});

		test("number type - passes on valid numbers", () => {
			const col: ColumnDef = { type: "number" };
			const compiled = compileColumn(col, "amount");
			expect(compiled.fn("123")).toBe(0);
			expect(compiled.fn("-45.67")).toBe(0);
			expect(compiled.fn("0")).toBe(0);
			expect(compiled.fn(".5")).toBe(0);
		});

		test("integer type - fails on decimal", () => {
			const col: ColumnDef = { type: "integer" };
			const compiled = compileColumn(col, "count");
			expect(compiled.fn("1.5")).not.toBe(0);
			expect(compiled.fn("3.14")).not.toBe(0);
		});

		test("integer type - fails on non-numeric", () => {
			const col: ColumnDef = { type: "integer" };
			const compiled = compileColumn(col, "count");
			expect(compiled.fn("abc")).not.toBe(0);
		});

		test("integer type - passes on integers", () => {
			const col: ColumnDef = { type: "integer" };
			const compiled = compileColumn(col, "count");
			expect(compiled.fn("0")).toBe(0);
			expect(compiled.fn("42")).toBe(0);
			expect(compiled.fn("-10")).toBe(0);
		});

		test("boolean type - passes on valid boolean values", () => {
			const col: ColumnDef = { type: "boolean" };
			const compiled = compileColumn(col, "active");
			expect(compiled.fn("true")).toBe(0);
			expect(compiled.fn("false")).toBe(0);
			expect(compiled.fn("TRUE")).toBe(0);
			expect(compiled.fn("FALSE")).toBe(0);
			expect(compiled.fn("1")).toBe(0);
			expect(compiled.fn("0")).toBe(0);
			expect(compiled.fn("yes")).toBe(0);
			expect(compiled.fn("no")).toBe(0);
			expect(compiled.fn("YES")).toBe(0);
			expect(compiled.fn("NO")).toBe(0);
		});

		test("boolean type - fails on invalid values", () => {
			const col: ColumnDef = { type: "boolean" };
			const compiled = compileColumn(col, "active");
			expect(compiled.fn("maybe")).not.toBe(0);
			expect(compiled.fn("2")).not.toBe(0);
			expect(compiled.fn("on")).not.toBe(0);
		});

		test("date type - passes on ISO date format", () => {
			const col: ColumnDef = { type: "date" };
			const compiled = compileColumn(col, "birthdate");
			expect(compiled.fn("2024-01-15")).toBe(0);
			expect(compiled.fn("1990-12-31")).toBe(0);
		});

		test("date type - fails on invalid formats", () => {
			const col: ColumnDef = { type: "date" };
			const compiled = compileColumn(col, "birthdate");
			expect(compiled.fn("01/15/2024")).not.toBe(0);
			expect(compiled.fn("2024/01/15")).not.toBe(0);
			expect(compiled.fn("2024-1-15")).not.toBe(0);
			expect(compiled.fn("not a date")).not.toBe(0);
		});

		test("string type - passes any value", () => {
			const col: ColumnDef = { type: "string" };
			const compiled = compileColumn(col, "name");
			expect(compiled.fn("anything")).toBe(0);
			expect(compiled.fn("123")).toBe(0);
			expect(compiled.fn("special!@#$%")).toBe(0);
		});
	});

	describe("empty value handling", () => {
		test("empty value without required rule - skips validation", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "min", value: 0 }],
			};
			const compiled = compileColumn(col, "optional");
			expect(compiled.fn("")).toBe(0);
		});

		test("empty value with type check - skips type validation", () => {
			const col: ColumnDef = { type: "integer" };
			const compiled = compileColumn(col, "optional");
			expect(compiled.fn("")).toBe(0);
		});
	});

	describe("combined rules", () => {
		test("required + min + max", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "required" }, { rule: "min", value: 0 }, { rule: "max", value: 100 }],
			};
			const compiled = compileColumn(col, "percentage");

			expect(compiled.fn("")).not.toBe(0); // fails required
			expect(compiled.fn("-1")).not.toBe(0); // fails min
			expect(compiled.fn("101")).not.toBe(0); // fails max
			expect(compiled.fn("50")).toBe(0); // passes all
		});

		test("required + pattern + minLength", () => {
			const col: ColumnDef = {
				type: "string",
				rules: [
					{ rule: "required" },
					{ rule: "pattern", value: /^[A-Z]+$/ },
					{ rule: "minLength", value: 2 },
				],
			};
			const compiled = compileColumn(col, "code");

			expect(compiled.fn("")).not.toBe(0); // fails required
			expect(compiled.fn("abc")).not.toBe(0); // fails pattern
			expect(compiled.fn("A")).not.toBe(0); // fails minLength
			expect(compiled.fn("AB")).toBe(0); // passes all
		});
	});

	describe("metadata tracking", () => {
		test("hasRequired flag is set correctly", () => {
			const withRequired: ColumnDef = {
				type: "string",
				rules: [{ rule: "required" }],
			};
			const withoutRequired: ColumnDef = {
				type: "string",
			};

			expect(compileColumn(withRequired, "a").hasRequired).toBe(true);
			expect(compileColumn(withoutRequired, "b").hasRequired).toBe(false);
		});

		test("hasUnique flag is set correctly", () => {
			const withUnique: ColumnDef = {
				type: "string",
				rules: [{ rule: "unique" }],
			};
			const withoutUnique: ColumnDef = {
				type: "string",
			};

			expect(compileColumn(withUnique, "a").hasUnique).toBe(true);
			expect(compileColumn(withoutUnique, "b").hasUnique).toBe(false);
		});

		test("errorMap contains rule metadata", () => {
			const col: ColumnDef = {
				type: "number",
				rules: [{ rule: "required" }, { rule: "min", value: 5 }],
			};
			const compiled = compileColumn(col, "amount");

			expect(compiled.errorMap.size).toBeGreaterThan(0);
			const firstError = compiled.errorMap.get(1);
			expect(firstError?.name).toBe("required");
		});
	});
});

describe("compileSchema", () => {
	test("compiles multiple columns", () => {
		const schema = {
			columns: {
				name: { type: "string" as const, rules: [{ rule: "required" as const }] },
				age: { type: "integer" as const, rules: [{ rule: "min" as const, value: 0 }] },
				email: { type: "string" as const, rules: [{ rule: "email" as const }] },
			},
		};

		const compiled = compileSchema(schema);

		expect(compiled.columnCount).toBe(3);
		expect(compiled.columnNames).toEqual(["name", "age", "email"]);
		expect(compiled.columns.length).toBe(3);
	});

	test("preserves column order", () => {
		const schema = {
			columns: {
				z_last: { type: "string" as const },
				a_first: { type: "string" as const },
				m_middle: { type: "string" as const },
			},
		};

		const compiled = compileSchema(schema);

		expect(compiled.columnNames).toEqual(["z_last", "a_first", "m_middle"]);
	});

	test("each column has working validator", () => {
		const schema = {
			columns: {
				name: { type: "string" as const, rules: [{ rule: "required" as const }] },
				count: { type: "integer" as const },
			},
		};

		const compiled = compileSchema(schema);

		expect(compiled.columns[0].fn("")).not.toBe(0); // name required
		expect(compiled.columns[0].fn("John")).toBe(0);
		expect(compiled.columns[1].fn("5")).toBe(0);
		expect(compiled.columns[1].fn("5.5")).not.toBe(0); // not integer
	});
});
