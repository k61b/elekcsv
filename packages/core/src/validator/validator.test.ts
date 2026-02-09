import { describe, expect, test } from "bun:test";
import { parseCodegen } from "../parser/codegen";
import type { Schema } from "../types";
import { ERROR_CODES } from "../types";
import { CompiledValidator, validate } from "./validator";

describe("validate", () => {
	describe("basic validation", () => {
		test("returns valid result for valid data", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
					age: { type: "integer" },
				},
			};

			const data = [
				["Alice", "30"],
				["Bob", "25"],
			];

			const result = validate(data, schema);

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
			expect(result.stats.errorCount).toBe(undefined);
			expect(result.stats.totalRows).toBe(2);
			expect(result.stats.validRows).toBe(2);
			expect(result.stats.errorRows).toBe(0);
		});

		test("returns errors for invalid data", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
					age: { type: "integer" },
				},
			};

			const data = [
				["", "30"], // missing name
				["Bob", "not-a-number"], // invalid age
			];

			const result = validate(data, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBe(2);
			expect(result.stats.errorRows).toBe(2);
		});
	});

	describe("error details", () => {
		test("includes row and column indices", () => {
			const schema: Schema = {
				columns: {
					a: { type: "string", rules: [{ rule: "required" }] },
					b: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const data = [
				["valid", "valid"],
				["valid", ""], // error at row 1, col 1
				["", "valid"], // error at row 2, col 0
			];

			const result = validate(data, schema);

			expect(result.errors.length).toBe(2);

			const error1 = result.errors.find((e) => e.row === 1);
			expect(error1?.col).toBe(1);
			expect(error1?.field).toBe("b");

			const error2 = result.errors.find((e) => e.row === 2);
			expect(error2?.col).toBe(0);
			expect(error2?.field).toBe("a");
		});

		test("includes original value in error", () => {
			const schema: Schema = {
				columns: {
					num: { type: "integer" },
				},
			};

			const data = [["not-a-number"]];
			const result = validate(data, schema);

			expect(result.errors[0].value).toBe("not-a-number");
		});

		test("includes error code and message", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const data = [[""]];
			const result = validate(data, schema);

			expect(result.errors[0].code).toBe(ERROR_CODES.REQUIRED);
			expect(result.errors[0].message).toBeDefined();
		});
	});

	describe("unique rule", () => {
		test("detects duplicate values", () => {
			const schema: Schema = {
				columns: {
					id: { type: "string", rules: [{ rule: "unique" }] },
				},
			};

			const data = [["a"], ["b"], ["a"], ["c"], ["b"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBe(2); // 'a' at row 2, 'b' at row 4

			const dupA = result.errors.find((e) => e.value === "a");
			expect(dupA?.row).toBe(2);
			expect(dupA?.code).toBe(ERROR_CODES.UNIQUE);

			const dupB = result.errors.find((e) => e.value === "b");
			expect(dupB?.row).toBe(4);
		});

		test("allows empty values (not checked for uniqueness)", () => {
			const schema: Schema = {
				columns: {
					id: { type: "string", rules: [{ rule: "unique" }] },
				},
			};

			const data = [["a"], [""], ["b"], [""]];
			const result = validate(data, schema);

			expect(result.valid).toBe(true);
		});

		test("unique with required catches both empty and duplicate", () => {
			const schema: Schema = {
				columns: {
					id: { type: "string", rules: [{ rule: "required" }, { rule: "unique" }] },
				},
			};

			const data = [["a"], [""], ["a"]];
			const result = validate(data, schema);

			expect(result.errors.length).toBe(2);
			expect(result.errors.some((e) => e.code === ERROR_CODES.REQUIRED)).toBe(true);
			expect(result.errors.some((e) => e.code === ERROR_CODES.UNIQUE)).toBe(true);
		});
	});

	describe("custom validation", () => {
		test("runs custom validation function", () => {
			const schema: Schema = {
				columns: {
					even: {
						type: "integer",
						rules: [
							{
								rule: "custom",
								fn: (v) => Number.parseInt(v) % 2 === 0,
								message: "Must be even",
							},
						],
					},
				},
			};

			const data = [["2"], ["3"], ["4"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0].row).toBe(1);
			expect(result.errors[0].message).toBe("Must be even");
		});

		test("skips custom validation on empty values", () => {
			const schema: Schema = {
				columns: {
					even: {
						type: "integer",
						rules: [
							{
								rule: "custom",
								fn: (v) => Number.parseInt(v) % 2 === 0,
							},
						],
					},
				},
			};

			const data = [[""], ["2"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(true);
		});
	});

	describe("statistics", () => {
		test("tracks errors by rule", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
					age: { type: "integer" },
				},
			};

			const data = [
				["", "30"], // required error
				["Bob", "abc"], // type error
				["", "xyz"], // both errors
			];

			const result = validate(data, schema);

			expect(result.stats.errorsByRule.required).toBe(2);
			expect(result.stats.errorsByRule.type).toBe(2);
		});

		test("tracks errors by column", () => {
			const schema: Schema = {
				columns: {
					a: { type: "string", rules: [{ rule: "required" }] },
					b: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const data = [
				["", ""],
				["x", ""],
				["", "y"],
			];

			const result = validate(data, schema);

			expect(result.stats.errorsByColumn.a).toBe(2);
			expect(result.stats.errorsByColumn.b).toBe(2);
		});

		test("counts unique error rows", () => {
			const schema: Schema = {
				columns: {
					a: { type: "string", rules: [{ rule: "required" }] },
					b: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const data = [
				["", ""], // 2 errors, 1 error row
				["x", "y"], // 0 errors
				["", "y"], // 1 error
			];

			const result = validate(data, schema);

			expect(result.stats.errorRows).toBe(2);
			expect(result.stats.validRows).toBe(1);
		});
	});

	describe("edge cases", () => {
		test("handles empty data", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const result = validate([], schema);

			expect(result.valid).toBe(true);
			expect(result.stats.totalRows).toBe(0);
		});

		test("handles row with fewer columns than schema", () => {
			const schema: Schema = {
				columns: {
					a: { type: "string" },
					b: { type: "string" },
					c: { type: "string", rules: [{ rule: "required" }] },
				},
			};

			const data = [["only-one"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(false);
			expect(result.errors[0].col).toBe(2);
			expect(result.errors[0].value).toBe("");
		});

		test("handles row with more columns than schema (silently ignored)", () => {
			const schema: Schema = {
				columns: {
					a: { type: "string" },
				},
			};

			const data = [["valid", "extra1", "extra2"]];
			const result = validate(data, schema);

			expect(result.valid).toBe(true);
		});

		test("handles schema with no rules", () => {
			const schema: Schema = {
				columns: {
					name: { type: "string" },
					count: { type: "number" },
				},
			};

			const data = [
				["anything", "123"],
				["works", "456"],
			];

			const result = validate(data, schema);

			expect(result.valid).toBe(true);
		});
	});

	describe("large dataset", () => {
		test("validates 10K rows correctly", () => {
			const schema: Schema = {
				columns: {
					id: { type: "integer", rules: [{ rule: "required" }] },
					name: { type: "string", rules: [{ rule: "minLength", value: 1 }] },
					score: {
						type: "number",
						rules: [
							{ rule: "min", value: 0 },
							{ rule: "max", value: 100 },
						],
					},
				},
			};

			// Generate 10K rows with some errors
			const data: string[][] = [];
			let expectedErrors = 0;

			for (let i = 0; i < 10000; i++) {
				if (i % 1000 === 0) {
					// Every 1000th row has an error
					data.push(["", "name", "50"]); // missing id
					expectedErrors++;
				} else if (i % 500 === 0) {
					// Every 500th row has an error
					data.push([String(i), "name", "150"]); // score too high
					expectedErrors++;
				} else {
					data.push([String(i), `name-${i}`, String(i % 100)]);
				}
			}

			const result = validate(data, schema);

			expect(result.stats.totalRows).toBe(10000);
			expect(result.errors.length).toBe(expectedErrors);
		});
	});

	describe("integration with parser", () => {
		test("validates parsed CSV output directly", () => {
			const csv = `name,age,email
Alice,30,alice@example.com
Bob,not-a-number,bob@example.com
,25,charlie@example.com`;

			const parsed = parseCodegen(csv);

			const schema: Schema = {
				columns: {
					name: { type: "string", rules: [{ rule: "required" }] },
					age: { type: "integer" },
					email: { type: "string", rules: [{ rule: "email" }] },
				},
			};

			const result = validate(parsed.rows, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBe(2); // invalid age, missing name
		});

		test("validates parsed CSV with all valid data", () => {
			const csv = `id,active,created
1,true,2024-01-15
2,false,2024-02-20
3,yes,2024-03-25`;

			const parsed = parseCodegen(csv);

			const schema: Schema = {
				columns: {
					id: { type: "integer", rules: [{ rule: "required" }] },
					active: { type: "boolean" },
					created: { type: "date" },
				},
			};

			const result = validate(parsed.rows, schema);

			expect(result.valid).toBe(true);
		});
	});
});

describe("CompiledValidator", () => {
	test("can be reused for multiple validations", () => {
		const schema: Schema = {
			columns: {
				name: { type: "string", rules: [{ rule: "required" }] },
			},
		};

		const validator = new CompiledValidator(schema);

		const result1 = validator.validateAll([["Alice"], ["Bob"]]);
		expect(result1.valid).toBe(true);

		const result2 = validator.validateAll([[""], ["Charlie"]]);
		expect(result2.valid).toBe(false);

		const result3 = validator.validateAll([["Dave"]]);
		expect(result3.valid).toBe(true);
	});

	test("exposes schema metadata", () => {
		const schema: Schema = {
			columns: {
				a: { type: "string" },
				b: { type: "number" },
				c: { type: "boolean" },
			},
		};

		const validator = new CompiledValidator(schema);

		expect(validator.getColumnCount()).toBe(3);
		expect(validator.getColumnNames()).toEqual(["a", "b", "c"]);
	});

	test("unique constraint resets between validations", () => {
		const schema: Schema = {
			columns: {
				id: { type: "string", rules: [{ rule: "unique" }] },
			},
		};

		const validator = new CompiledValidator(schema);

		// First validation has no duplicates
		const result1 = validator.validateAll([["a"], ["b"], ["c"]]);
		expect(result1.valid).toBe(true);

		// Second validation - 'a' should be allowed again (new dataset)
		const result2 = validator.validateAll([["a"], ["a"]]);
		expect(result2.valid).toBe(false);
		expect(result2.errors.length).toBe(1); // only one duplicate
	});
});

describe("aborted flag", () => {
	test("is false for normal validation", () => {
		const schema: Schema = {
			columns: {
				name: { type: "string" },
			},
		};

		const result = validate([["test"]], schema);

		expect(result.aborted).toBe(false);
	});
});
