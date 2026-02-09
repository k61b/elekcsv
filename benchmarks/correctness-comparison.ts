/**
 * Correctness comparison: @elekcsv/core vs uDSV
 *
 * Parses the same CSV files with both parsers and compares
 * the output field-by-field to verify identical results.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@elekcsv/core";
import { inferSchema, initParser } from "../uDSV.mjs";

// ============================================================================
// Test Files
// ============================================================================

const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures");

const TEST_FILES = ["simple.csv", "with-errors.csv", "turkish-dates.csv"];

// ============================================================================
// Parsing Utilities
// ============================================================================

interface ParsedData {
	headers: string[];
	rows: string[][];
}

function parseWithUDSV(csvStr: string): ParsedData {
	const schema = inferSchema(csvStr);
	const parser = initParser(schema);

	// stringArrs returns array of string arrays (all rows including header)
	const allRows = parser.stringArrs(csvStr) as string[][];

	// uDSV skips headers based on schema.skip, so we need to get them separately
	// Re-parse with skip=0 to get headers
	const schemaWithHeader = { ...schema, skip: 0 };
	const parserWithHeader = initParser(schemaWithHeader);
	const allRowsWithHeader = parserWithHeader.stringArrs(csvStr) as string[][];

	const headers = allRowsWithHeader[0] || [];
	const rows = allRows;

	return { headers, rows };
}

function parseWithElek(csvStr: string): ParsedData {
	const result = parse(csvStr, { header: true });
	return {
		headers: result.headers || [],
		rows: result.rows,
	};
}

// ============================================================================
// Comparison
// ============================================================================

interface Difference {
	row: number;
	col: number;
	udsvValue: string;
	elekValue: string;
}

function compareResults(udsv: ParsedData, elek: ParsedData, filename: string): Difference[] {
	const differences: Difference[] = [];

	// Compare headers
	const maxHeaderCols = Math.max(udsv.headers.length, elek.headers.length);
	for (let col = 0; col < maxHeaderCols; col++) {
		const udsvVal = udsv.headers[col] ?? "<missing>";
		const elekVal = elek.headers[col] ?? "<missing>";
		if (udsvVal !== elekVal) {
			differences.push({
				row: 0, // header row
				col,
				udsvValue: udsvVal,
				elekValue: elekVal,
			});
		}
	}

	// Compare data rows
	const maxRows = Math.max(udsv.rows.length, elek.rows.length);
	for (let row = 0; row < maxRows; row++) {
		const udsvRow = udsv.rows[row] || [];
		const elekRow = elek.rows[row] || [];
		const maxCols = Math.max(udsvRow.length, elekRow.length);

		for (let col = 0; col < maxCols; col++) {
			const udsvVal = udsvRow[col] ?? "<missing>";
			const elekVal = elekRow[col] ?? "<missing>";
			if (udsvVal !== elekVal) {
				differences.push({
					row: row + 1, // +1 because header is row 0
					col,
					udsvValue: udsvVal,
					elekValue: elekVal,
				});
			}
		}
	}

	return differences;
}

// ============================================================================
// Main
// ============================================================================

console.log("=== Correctness Comparison: @elekcsv/core vs uDSV ===\n");

let totalDifferences = 0;
let filesChecked = 0;

for (const filename of TEST_FILES) {
	const filepath = join(FIXTURES_DIR, filename);
	let csvContent: string;

	try {
		csvContent = readFileSync(filepath, "utf-8");
	} catch (err) {
		console.log(`[SKIP] ${filename}: File not found`);
		continue;
	}

	filesChecked++;
	console.log(`\n--- ${filename} ---`);

	// Parse with both parsers
	const udsv = parseWithUDSV(csvContent);
	const elek = parseWithElek(csvContent);

	console.log(`  uDSV:      ${udsv.rows.length} data rows, ${udsv.headers.length} columns`);
	console.log(`  @elekcsv/core: ${elek.rows.length} data rows, ${elek.headers.length} columns`);

	// Compare results
	const differences = compareResults(udsv, elek, filename);

	if (differences.length === 0) {
		console.log("  Result: MATCH - Both parsers produced identical output");
	} else {
		console.log(`  Result: MISMATCH - Found ${differences.length} difference(s):`);
		for (const diff of differences.slice(0, 5)) {
			const rowLabel = diff.row === 0 ? "header" : `row ${diff.row}`;
			console.log(`    [${rowLabel}, col ${diff.col}]`);
			console.log(`      uDSV:      "${diff.udsvValue}"`);
			console.log(`      @elekcsv/core: "${diff.elekValue}"`);
		}
		totalDifferences += differences.length;
	}

	// Print first few rows for visual inspection
	console.log("\n  First 2 data rows (@elekcsv/core):");
	for (let i = 0; i < Math.min(2, elek.rows.length); i++) {
		console.log(`    Row ${i + 1}: ${JSON.stringify(elek.rows[i])}`);
	}
}

// ============================================================================
// Summary
// ============================================================================

console.log("\n=== Summary ===");
console.log(`Files checked: ${filesChecked}`);
if (totalDifferences === 0) {
	console.log("All parsers produced identical output!");
} else {
	console.log(`Total differences found: ${totalDifferences}`);
}
