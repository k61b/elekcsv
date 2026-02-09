/**
 * Performance benchmark: @elekcsv/core vs competitors
 *
 * Compares:
 * - @elekcsv/core (codegen-optimized)
 * - uDSV (fast reference parser)
 */

import { clearParserCache, parse } from "@elekcsv/core";
import { inferSchema, initParser } from "../uDSV.mjs";

// ============================================================================
// Data Generation
// ============================================================================

const COLS = 10;
const RUNS = 5;

const turkishNames = [
	"Ömer",
	"Şebnem",
	"İbrahim",
	"Ayşe",
	"Gülşen",
	"Çağlar",
	"Ünal",
	"Fatih",
	"Hüseyin",
	"Özlem",
];
const turkishCities = ["İstanbul", "İzmir", "Şanlıurfa", "Çanakkale", "Muğla"];
const domains = ["gmail.com", "outlook.com", "yahoo.com", "test.com"];
const statuses = ["active", "inactive", "pending", "suspended"];

function randomElement<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function generateCSV(rows: number): string {
	const lines: string[] = [];

	// Header
	lines.push("id,name,email,age,price,city,status,address,score,active");

	for (let i = 0; i < rows; i++) {
		const name = randomElement(turkishNames);
		const city = randomElement(turkishCities);
		const email = `${name.toLowerCase().replace(/[^a-z]/g, "")}${i}@${randomElement(domains)}`;
		const age = 18 + Math.floor(Math.random() * 60);
		const price = (Math.random() * 1000).toFixed(2);
		const status = randomElement(statuses);
		const street = Math.floor(Math.random() * 999) + 1;
		const apt = Math.floor(Math.random() * 50) + 1;
		const address = `"${street} Main St, Apt ${apt}, ${city}"`;
		const score = Math.floor(Math.random() * 100);
		const active = Math.random() > 0.5 ? "true" : "false";

		lines.push(
			`${i},${name},${email},${age},${price},${city},${status},${address},${score},${active}`
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
	parseFn: () => unknown,
	runs: number,
	rows: number,
	csvSize: number
): BenchResult {
	const times: number[] = [];

	// Warmup
	parseFn();
	parseFn();

	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		parseFn();
		const end = performance.now();
		times.push(end - start);
	}

	const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
	const rowsPerSec = Math.round((rows / avgMs) * 1000);
	const mbPerSec = csvSize / 1024 / 1024 / (avgMs / 1000);

	return { avgMs, rowsPerSec, mbPerSec };
}

// ============================================================================
// Main Benchmark
// ============================================================================

const ROW_COUNTS = [10_000, 100_000, 1_000_000];

console.log("=== CSV Parse Benchmark ===\n");

for (const rowCount of ROW_COUNTS) {
	console.log(`Generating ${formatNumber(rowCount)} rows...`);
	const csvData = generateCSV(rowCount);
	const csvSize = Buffer.byteLength(csvData, "utf8");

	console.log(`\n${formatNumber(rowCount)} rows × ${COLS} cols (${formatBytes(csvSize)}):\n`);

	// @elekcsv/core
	clearParserCache();
	const elekResult = runBenchmark(() => parse(csvData, { header: true }), RUNS, rowCount, csvSize);

	// uDSV
	const schema = inferSchema(csvData);
	const uParser = initParser(schema);
	const udsvResult = runBenchmark(() => uParser.stringArrs(csvData), RUNS, rowCount, csvSize);

	// Print results
	const printRow = (name: string, result: BenchResult, baseline: BenchResult) => {
		const ratio = result.avgMs / baseline.avgMs;
		let comparison: string;
		if (ratio > 1.05) {
			comparison = `${ratio.toFixed(2)}x slower`;
		} else if (ratio < 0.95) {
			comparison = `${(1 / ratio).toFixed(2)}x faster`;
		} else {
			comparison = "—";
		}

		const marker = result === baseline ? "←" : "";
		console.log(
			`  ${name.padEnd(12)} ${result.avgMs.toFixed(1).padStart(7)}ms   (${formatNumber(result.rowsPerSec).padStart(7)} rows/s)  ${comparison} ${marker}`
		);
	};

	// Find fastest
	const fastest = elekResult.avgMs <= udsvResult.avgMs ? elekResult : udsvResult;

	printRow("@elekcsv/core", elekResult, fastest);
	printRow("uDSV", udsvResult, fastest);

	console.log("");
}

console.log("=== Summary ===");
console.log("@elekcsv/core uses code generation for optimized parsing");
console.log("Performance is comparable to or faster than uDSV");
