import { describe, expect, test } from "bun:test";
import { ErrorBitmap, ErrorCodeMap } from "./bitmap";

describe("ErrorBitmap", () => {
	describe("setError / hasError", () => {
		test("single cell set and get", () => {
			const bitmap = new ErrorBitmap(10, 5);

			expect(bitmap.hasError(3, 2)).toBe(false);
			bitmap.setError(3, 2);
			expect(bitmap.hasError(3, 2)).toBe(true);
		});

		test("multiple cells", () => {
			const bitmap = new ErrorBitmap(100, 8);

			bitmap.setError(0, 0);
			bitmap.setError(50, 4);
			bitmap.setError(99, 7);

			expect(bitmap.hasError(0, 0)).toBe(true);
			expect(bitmap.hasError(50, 4)).toBe(true);
			expect(bitmap.hasError(99, 7)).toBe(true);

			expect(bitmap.hasError(0, 1)).toBe(false);
			expect(bitmap.hasError(50, 3)).toBe(false);
			expect(bitmap.hasError(99, 6)).toBe(false);
		});

		test("handles boundary cases", () => {
			const bitmap = new ErrorBitmap(100, 8);

			// First cell
			bitmap.setError(0, 0);
			expect(bitmap.hasError(0, 0)).toBe(true);

			// Last cell
			bitmap.setError(99, 7);
			expect(bitmap.hasError(99, 7)).toBe(true);

			// Around 32-bit boundaries
			bitmap.setError(4, 0); // index 32
			bitmap.setError(4, 1); // index 33
			expect(bitmap.hasError(4, 0)).toBe(true);
			expect(bitmap.hasError(4, 1)).toBe(true);
		});
	});

	describe("hasRowError", () => {
		test("returns false for row without errors", () => {
			const bitmap = new ErrorBitmap(10, 5);
			expect(bitmap.hasRowError(5)).toBe(false);
		});

		test("returns true for row with single error", () => {
			const bitmap = new ErrorBitmap(10, 5);
			bitmap.setError(5, 2);
			expect(bitmap.hasRowError(5)).toBe(true);
		});

		test("returns true for row with multiple errors", () => {
			const bitmap = new ErrorBitmap(10, 5);
			bitmap.setError(5, 0);
			bitmap.setError(5, 2);
			bitmap.setError(5, 4);
			expect(bitmap.hasRowError(5)).toBe(true);
		});

		test("only checks specific row", () => {
			const bitmap = new ErrorBitmap(10, 5);
			bitmap.setError(3, 2);
			expect(bitmap.hasRowError(3)).toBe(true);
			expect(bitmap.hasRowError(4)).toBe(false);
		});
	});

	describe("countErrors", () => {
		test("returns 0 for empty bitmap", () => {
			const bitmap = new ErrorBitmap(100, 8);
			expect(bitmap.countErrors()).toBe(0);
		});

		test("returns 1 for single error", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(50, 4);
			expect(bitmap.countErrors()).toBe(1);
		});

		test("returns correct count for many errors", () => {
			const bitmap = new ErrorBitmap(100, 8);

			for (let i = 0; i < 100; i++) {
				bitmap.setError(i, i % 8);
			}

			expect(bitmap.countErrors()).toBe(100);
		});

		test("counts all cells when all are errors", () => {
			const bitmap = new ErrorBitmap(10, 5);

			for (let row = 0; row < 10; row++) {
				for (let col = 0; col < 5; col++) {
					bitmap.setError(row, col);
				}
			}

			expect(bitmap.countErrors()).toBe(50);
		});

		test("popcount is accurate for sparse errors", () => {
			const bitmap = new ErrorBitmap(1000, 8);

			const errors = [0, 31, 32, 63, 64, 100, 500, 999];
			for (const row of errors) {
				bitmap.setError(row, 0);
			}

			expect(bitmap.countErrors()).toBe(errors.length);
		});
	});

	describe("countErrorRows", () => {
		test("returns 0 for empty bitmap", () => {
			const bitmap = new ErrorBitmap(100, 8);
			expect(bitmap.countErrorRows()).toBe(0);
		});

		test("returns 1 for row with single error", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(50, 4);
			expect(bitmap.countErrorRows()).toBe(1);
		});

		test("counts row only once with multiple errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(50, 0);
			bitmap.setError(50, 4);
			bitmap.setError(50, 7);
			expect(bitmap.countErrorRows()).toBe(1);
		});

		test("counts multiple rows correctly", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(10, 0);
			bitmap.setError(20, 0);
			bitmap.setError(20, 1);
			bitmap.setError(30, 5);
			expect(bitmap.countErrorRows()).toBe(3);
		});
	});

	describe("getColumnErrors", () => {
		test("returns empty array for column without errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			expect(bitmap.getColumnErrors(3)).toEqual([]);
		});

		test("returns row indices for column with errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(10, 3);
			bitmap.setError(50, 3);
			bitmap.setError(90, 3);

			expect(bitmap.getColumnErrors(3)).toEqual([10, 50, 90]);
		});

		test("only returns errors for specific column", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(10, 2);
			bitmap.setError(10, 3);
			bitmap.setError(20, 3);

			expect(bitmap.getColumnErrors(3)).toEqual([10, 20]);
			expect(bitmap.getColumnErrors(2)).toEqual([10]);
		});
	});

	describe("getRowErrorColumns", () => {
		test("returns empty array for row without errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			expect(bitmap.getRowErrorColumns(50)).toEqual([]);
		});

		test("returns column indices for row with errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(50, 1);
			bitmap.setError(50, 4);
			bitmap.setError(50, 7);

			expect(bitmap.getRowErrorColumns(50)).toEqual([1, 4, 7]);
		});
	});

	describe("forEachError", () => {
		test("does not call callback for empty bitmap", () => {
			const bitmap = new ErrorBitmap(100, 8);
			let count = 0;
			bitmap.forEachError(() => count++);
			expect(count).toBe(0);
		});

		test("calls callback for each error", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(10, 2);
			bitmap.setError(50, 4);
			bitmap.setError(90, 6);

			const errors: [number, number][] = [];
			bitmap.forEachError((row, col) => errors.push([row, col]));

			expect(errors).toContainEqual([10, 2]);
			expect(errors).toContainEqual([50, 4]);
			expect(errors).toContainEqual([90, 6]);
			expect(errors.length).toBe(3);
		});
	});

	describe("edge cases", () => {
		test("handles 0 rows", () => {
			const bitmap = new ErrorBitmap(0, 8);
			expect(bitmap.countErrors()).toBe(0);
			expect(bitmap.countErrorRows()).toBe(0);
		});

		test("handles 1 row", () => {
			const bitmap = new ErrorBitmap(1, 8);
			bitmap.setError(0, 0);
			expect(bitmap.countErrors()).toBe(1);
			expect(bitmap.hasRowError(0)).toBe(true);
		});

		test("handles single column", () => {
			const bitmap = new ErrorBitmap(100, 1);
			bitmap.setError(50, 0);
			expect(bitmap.countErrors()).toBe(1);
			expect(bitmap.getColumnErrors(0)).toEqual([50]);
		});

		test("handles large data (100K rows)", () => {
			const bitmap = new ErrorBitmap(100_000, 8);

			// Set every 100th row as error
			for (let i = 0; i < 100_000; i += 100) {
				bitmap.setError(i, 0);
			}

			expect(bitmap.countErrors()).toBe(1000);
			expect(bitmap.countErrorRows()).toBe(1000);
		});
	});

	describe("memory", () => {
		test("100K × 8 bitmap uses ~100KB", () => {
			const bitmap = new ErrorBitmap(100_000, 8);

			// 100K × 8 = 800K bits = 25K Uint32 = 100KB
			const expectedBytes = Math.ceil((100_000 * 8) / 32) * 4;
			expect(bitmap.byteSize).toBe(expectedBytes);
			expect(bitmap.byteSize).toBeLessThanOrEqual(110_000); // ~100KB with some margin
		});
	});

	describe("clear", () => {
		test("clears all errors", () => {
			const bitmap = new ErrorBitmap(100, 8);
			bitmap.setError(10, 2);
			bitmap.setError(50, 4);

			expect(bitmap.countErrors()).toBe(2);

			bitmap.clear();

			expect(bitmap.countErrors()).toBe(0);
			expect(bitmap.hasError(10, 2)).toBe(false);
			expect(bitmap.hasError(50, 4)).toBe(false);
		});
	});
});

describe("ErrorCodeMap", () => {
	describe("setCode / getCode", () => {
		test("stores and retrieves codes", () => {
			const codes = new ErrorCodeMap(100, 8);

			codes.setCode(10, 3, 5);
			codes.setCode(50, 4, 10);

			expect(codes.getCode(10, 3)).toBe(5);
			expect(codes.getCode(50, 4)).toBe(10);
		});

		test("returns 0 for unset cells", () => {
			const codes = new ErrorCodeMap(100, 8);
			expect(codes.getCode(50, 4)).toBe(0);
		});

		test("handles max code value (255)", () => {
			const codes = new ErrorCodeMap(100, 8);
			codes.setCode(10, 3, 255);
			expect(codes.getCode(10, 3)).toBe(255);
		});
	});

	describe("memory", () => {
		test("100K × 8 uses 800KB", () => {
			const codes = new ErrorCodeMap(100_000, 8);
			expect(codes.byteSize).toBe(800_000);
		});
	});

	describe("clear", () => {
		test("clears all codes", () => {
			const codes = new ErrorCodeMap(100, 8);
			codes.setCode(10, 3, 5);
			codes.setCode(50, 4, 10);

			codes.clear();

			expect(codes.getCode(10, 3)).toBe(0);
			expect(codes.getCode(50, 4)).toBe(0);
		});
	});
});
