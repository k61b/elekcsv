/**
 * Performance benchmark: @elekcsv/core vs papaparse & csv-parse
 */

import { type Schema, parse as elekParse, validate as elekValidate } from "@elekcsv/core";
import { parse as csvParse } from "csv-parse/sync";
import Papa from "papaparse";

// ============================================================================
// Data Generation
// ============================================================================

const COLS = 10;
const RUNS = 5; // number of times to run each benchmark for average

const firstNames = ["John", "Jane", "Michael", "Emily", "David", "Sarah", "Chris", "Jessica"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"];
const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "company.org"];
const departments = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"];
const bools = ["true", "false"];

function randomElement<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function generateCSV(rows: number): string {
	const lines = [];

	// Complex realistic header
	lines.push("id,first_name,last_name,email,age,salary,department,hire_date,is_active,score");

	for (let i = 0; i < rows; i++) {
		const fName = randomElement(firstNames);
		const lName = randomElement(lastNames);
		const email = `${fName.toLowerCase()}.${lName.toLowerCase()}${i}@${randomElement(domains)}`;
		const age = 22 + Math.floor(Math.random() * 40);
		// European formatted salary intentionally to test locale parsing/validation
		const salary = `${Math.floor(Math.random() * 10) + 3}.${Math.floor(Math.random() * 900) + 100},${Math.floor(Math.random() * 99)}`;
		const dept = randomElement(departments);
		// Turkish formatted date intentionally to test locale parsing/validation
		const hireDate = `${Math.floor(Math.random() * 28) + 1}.${Math.floor(Math.random() * 12) + 1}.${2015 + Math.floor(Math.random() * 9)}`;
		const active = randomElement(bools);
		const score = (Math.random() * 100).toFixed(2);

		lines.push(
			`${i},${fName},${lName},${email},${age},"${salary}",${dept},${hireDate},${active},${score}`
		);
	}

	return lines.join("\n");
}

// ============================================================================
// Benchmarking Utilities
// ============================================================================

function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface BenchResult {
	avgMs: number;
	rowsPerSec: number;
	mbPerSec: number;
}

function runBenchmark(
	name: string,
	fn: () => void,
	runs: number,
	rows: number,
	sizeBytes: number
): BenchResult {
	// warmup
	fn();

	const times = [];
	for (let i = 0; i < runs; i++) {
		// invoke gc if global is available to try to level the playing field before run
		if (typeof global !== "undefined" && global.gc) global.gc();

		const start = performance.now();
		fn();
		const end = performance.now();
		times.push(end - start);
	}

	const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
	const rowsPerSec = Math.round((rows / avgMs) * 1000);
	const mbPerSec = sizeBytes / 1024 / 1024 / (avgMs / 1000);

	return { avgMs, rowsPerSec, mbPerSec };
}

// ============================================================================
// Main Benchmark
// ============================================================================

const ROW_COUNTS = [
	10_000,
	100_000 /* 1M takes too much memory for basic node scripts without streams, let's stick to 100k for papa sync comparison */,
];

console.log("=== Realistic Parsing & Validation Benchmark ===\n");

for (const rowCount of ROW_COUNTS) {
	console.log(`Generating ${formatNumber(rowCount)} realistic rows...`);
	const csvData = generateCSV(rowCount);
	const csvSize = Buffer.byteLength(csvData, "utf8");

	console.log(`\n${formatNumber(rowCount)} rows × ${COLS} cols (${formatBytes(csvSize)}):\n`);

	// 1. PapaParse
	const papaResult = runBenchmark(
		"PapaParse",
		() => {
			Papa.parse(csvData, { header: true, skipEmptyLines: true });
		},
		RUNS,
		rowCount,
		csvSize
	);

	// 2. csv-parse
	const csvParseResult = runBenchmark(
		"csv-parse",
		() => {
			csvParse(csvData, { columns: true, skip_empty_lines: true });
		},
		RUNS,
		rowCount,
		csvSize
	);

	// 3. elekcsv (Parse Only)
	const elekParseResult = runBenchmark(
		"@elekcsv/core (Parse)",
		() => {
			elekParse(csvData, { header: true });
		},
		RUNS,
		rowCount,
		csvSize
	);

	// 4. elekcsv (Parse + Validate)
	const schema: Schema = {
		locale: "tr", // test locale parsing
		columns: {
			id: { type: "integer" },
			first_name: { type: "string" },
			last_name: { type: "string" },
			email: { type: "string", rules: [{ rule: "email" }] },
			age: { type: "integer", rules: [{ rule: "min", value: 18 }] },
			salary: { type: "number" }, // tr locale will parse 3.100,20 correctly
			department: { type: "string" },
			hire_date: { type: "date" }, // tr locale will parse DD.MM.YYYY correctly
			is_active: { type: "boolean" },
			score: { type: "number", rules: [{ rule: "max", value: 100 }] },
		},
	};

	const elekValidateResult = runBenchmark(
		"@elekcsv/core (Parse+Validate)",
		() => {
			const parsed = elekParse(csvData, { header: true });
			// apply validation right after parse
			elekValidate(parsed.rows, schema);
		},
		RUNS,
		rowCount,
		csvSize
	);

	console.table({
		PapaParse: {
			"Time (ms)": papaResult.avgMs.toFixed(1),
			"Rows/sec": formatNumber(papaResult.rowsPerSec),
			"MB/sec": papaResult.mbPerSec.toFixed(1),
		},
		"csv-parse": {
			"Time (ms)": csvParseResult.avgMs.toFixed(1),
			"Rows/sec": formatNumber(csvParseResult.rowsPerSec),
			"MB/sec": csvParseResult.mbPerSec.toFixed(1),
		},
		"@elekcsv/core (Parse)": {
			"Time (ms)": elekParseResult.avgMs.toFixed(1),
			"Rows/sec": formatNumber(elekParseResult.rowsPerSec),
			"MB/sec": elekParseResult.mbPerSec.toFixed(1),
		},
		"@elekcsv/core (Parse+Validate)": {
			"Time (ms)": elekValidateResult.avgMs.toFixed(1),
			"Rows/sec": formatNumber(elekValidateResult.rowsPerSec),
			"MB/sec": elekValidateResult.mbPerSec.toFixed(1),
		},
	});

	console.log("");
}
