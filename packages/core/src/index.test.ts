import { describe, expect, test } from "bun:test";
import { clearParserCache, compileParser, parse } from "./index";

describe("public API", () => {
	test("parse is exported and works", () => {
		const result = parse("a,b,c\n1,2,3\n4,5,6");
		expect(result.headers).toEqual(["a", "b", "c"]);
		expect(result.rows).toEqual([
			["1", "2", "3"],
			["4", "5", "6"],
		]);
		expect(result.rowCount).toBe(2);
		expect(result.fieldCount).toBe(3);
	});

	test("compileParser is exported and works", () => {
		const compiled = compileParser("a,b,c\n1,2,3");
		expect(compiled.fieldCount).toBe(3);
		expect(typeof compiled.fn).toBe("function");
	});

	test("clearParserCache is exported and works", () => {
		// Should not throw
		clearParserCache();
	});
});
