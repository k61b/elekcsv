/**
 * Validation Engine Benchmark
 *
 * Tests the compiled validation engine with realistic e-commerce data.
 * Compares compiled validators vs naive runtime validation.
 */

import {
	type ColumnDef,
	CompiledValidator,
	type Rule,
	type Schema,
	compileSchema,
	normalizeDateToISO,
	normalizeNumber,
	parse,
	validate,
	validateBitmap,
} from "@elekcsv/core";

// ============================================================================
// Configuration
// ============================================================================

const ROW_COUNT = 100_000;
const RUNS = 5;

// Error injection rates
const DUPLICATE_SKU_RATE = 0.005; // 0.5%
const EMPTY_NAME_RATE = 0.01; // 1%
const INVALID_PRICE_RATE = 0.02; // 2%
const INVALID_STOCK_RATE = 0.015; // 1.5%
const INVALID_EMAIL_RATE = 0.03; // 3%
const INVALID_CATEGORY_RATE = 0.02; // 2%
const INVALID_BOOLEAN_RATE = 0.01; // 1%
const INVALID_DATE_RATE = 0.02; // 2%

// ============================================================================
// Data Generation
// ============================================================================

const productNames = [
	"Wireless Mouse",
	"USB Cable",
	"Bluetooth Speaker",
	"Phone Case",
	"Laptop Stand",
	"Mechanical Keyboard",
	"Monitor Arm",
	"Webcam HD",
	"Headphones Pro",
	"Power Bank",
	"Smart Watch",
	"Tablet Cover",
	"HDMI Adapter",
	"Memory Card",
	"External SSD",
];

const categories = ["electronics", "clothing", "food", "toys", "books"];
const booleanValues = ["true", "false", "yes", "no", "1", "0"];
const invalidBooleans = ["maybe", "2", "on", "off", "nope"];
const invalidEmails = ["noatsign", "@nodomain", "spaces in@email.com", "missing@dot"];
const invalidDates = ["13/01/2025", "not-a-date", "2025-1-5", "01-15-2025"];
const invalidCategories = ["invalid_cat", "unknown", "misc", "other"];

function randomElement<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): string {
	return (Math.random() * (max - min) + min).toFixed(decimals);
}

function generateEmail(index: number): string {
	const names = ["john", "jane", "bob", "alice", "mike", "sarah"];
	const domains = ["example.com", "test.org", "mail.net", "company.io"];
	return `${randomElement(names)}${index}@${randomElement(domains)}`;
}

function generateDate(): string {
	const year = randomInt(2020, 2025);
	const month = String(randomInt(1, 12)).padStart(2, "0");
	const day = String(randomInt(1, 28)).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

interface GeneratedData {
	data: string[][];
	expectedErrors: {
		duplicateSku: number;
		emptyName: number;
		invalidPrice: number;
		invalidStock: number;
		invalidEmail: number;
		invalidCategory: number;
		invalidBoolean: number;
		invalidDate: number;
	};
}

function generateData(rowCount: number): GeneratedData {
	const data: string[][] = [];
	const usedSkus = new Set<string>();
	const skuList: string[] = [];

	const expectedErrors = {
		duplicateSku: 0,
		emptyName: 0,
		invalidPrice: 0,
		invalidStock: 0,
		invalidEmail: 0,
		invalidCategory: 0,
		invalidBoolean: 0,
		invalidDate: 0,
	};

	for (let i = 0; i < rowCount; i++) {
		const row: string[] = [];

		// SKU - unique with some duplicates
		let sku: string;
		if (i > 1000 && Math.random() < DUPLICATE_SKU_RATE && skuList.length > 0) {
			// Pick a random existing SKU to create a duplicate
			sku = skuList[randomInt(0, Math.min(skuList.length - 1, i - 100))];
			expectedErrors.duplicateSku++;
		} else {
			sku = `SKU-${String(i + 1).padStart(6, "0")}`;
			skuList.push(sku);
		}
		row.push(sku);

		// Name - required with some empty
		if (Math.random() < EMPTY_NAME_RATE) {
			row.push("");
			expectedErrors.emptyName++;
		} else {
			row.push(randomElement(productNames));
		}

		// Price - number with some invalid
		if (Math.random() < INVALID_PRICE_RATE) {
			const invalidValues = ["abc", "-5", "", "NaN", "12.34.56"];
			row.push(randomElement(invalidValues));
			expectedErrors.invalidPrice++;
		} else {
			row.push(randomFloat(0.99, 9999.99));
		}

		// Stock - integer with some invalid
		if (Math.random() < INVALID_STOCK_RATE) {
			const invalidValues = ["3.5", "xx", "-1.5", "1e10"];
			row.push(randomElement(invalidValues));
			expectedErrors.invalidStock++;
		} else {
			row.push(String(randomInt(0, 10000)));
		}

		// Email - pattern with some invalid
		if (Math.random() < INVALID_EMAIL_RATE) {
			row.push(randomElement(invalidEmails));
			expectedErrors.invalidEmail++;
		} else {
			row.push(generateEmail(i));
		}

		// Category - enum with some invalid
		if (Math.random() < INVALID_CATEGORY_RATE) {
			row.push(randomElement(invalidCategories));
			expectedErrors.invalidCategory++;
		} else {
			row.push(randomElement(categories));
		}

		// Active - boolean with some invalid
		if (Math.random() < INVALID_BOOLEAN_RATE) {
			row.push(randomElement(invalidBooleans));
			expectedErrors.invalidBoolean++;
		} else {
			row.push(randomElement(booleanValues));
		}

		// Created At - date with some invalid
		if (Math.random() < INVALID_DATE_RATE) {
			row.push(randomElement(invalidDates));
			expectedErrors.invalidDate++;
		} else {
			row.push(generateDate());
		}

		data.push(row);
	}

	return { data, expectedErrors };
}

// ============================================================================
// Schema Definition
// ============================================================================

const schema: Schema = {
	columns: {
		sku: {
			type: "string",
			rules: [{ rule: "required" }, { rule: "unique" }],
		},
		name: {
			type: "string",
			rules: [{ rule: "required" }, { rule: "minLength", value: 2 }],
		},
		price: {
			type: "number",
			rules: [{ rule: "required" }, { rule: "min", value: 0 }],
		},
		stock: {
			type: "integer",
			rules: [{ rule: "min", value: 0 }],
		},
		email: {
			type: "string",
			rules: [{ rule: "pattern", value: /@.+\..+/ }],
		},
		category: {
			type: "string",
			rules: [{ rule: "enum", values: categories }],
		},
		active: {
			type: "boolean",
			rules: [],
		},
		created_at: {
			type: "date",
			rules: [{ rule: "required" }],
		},
	},
};

// ============================================================================
// Naive Validation (for comparison)
// ============================================================================

interface NaiveColumnDef {
	type: string;
	rules?: Rule[];
}

function naiveValidate(data: string[][], columnDefs: NaiveColumnDef[]): number {
	let errorCount = 0;
	const uniqueSets: Map<number, Set<string>> = new Map();

	// Initialize unique tracking
	for (let col = 0; col < columnDefs.length; col++) {
		const column = columnDefs[col];
		if (column.rules?.some((r) => r.rule === "unique")) {
			uniqueSets.set(col, new Set());
		}
	}

	for (let row = 0; row < data.length; row++) {
		for (let col = 0; col < columnDefs.length; col++) {
			const value = col < data[row].length ? data[row][col] : "";
			const column = columnDefs[col];

			// required check
			if (column.rules?.some((r) => r.rule === "required") && value === "") {
				errorCount++;
				continue;
			}

			// type check - number
			if (column.type === "number" && value !== "" && Number.isNaN(+value)) {
				errorCount++;
				continue;
			}

			// type check - integer
			if (column.type === "integer" && value !== "") {
				const n = +value;
				if (Number.isNaN(n) || !Number.isInteger(n)) {
					errorCount++;
					continue;
				}
			}

			// type check - boolean
			if (column.type === "boolean" && value !== "") {
				if (!["true", "false", "1", "0", "yes", "no"].includes(value.toLowerCase())) {
					errorCount++;
					continue;
				}
			}

			// type check - date
			if (column.type === "date" && value !== "") {
				if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
					errorCount++;
					continue;
				}
			}

			// min check
			const minRule = column.rules?.find((r) => r.rule === "min") as
				| { rule: "min"; value: number }
				| undefined;
			if (minRule && value !== "" && +value < minRule.value) {
				errorCount++;
				continue;
			}

			// max check
			const maxRule = column.rules?.find((r) => r.rule === "max") as
				| { rule: "max"; value: number }
				| undefined;
			if (maxRule && value !== "" && +value > maxRule.value) {
				errorCount++;
				continue;
			}

			// minLength check
			const minLengthRule = column.rules?.find((r) => r.rule === "minLength") as
				| { rule: "minLength"; value: number }
				| undefined;
			if (minLengthRule && value !== "" && value.length < minLengthRule.value) {
				errorCount++;
				continue;
			}

			// pattern check
			const patternRule = column.rules?.find((r) => r.rule === "pattern") as
				| { rule: "pattern"; value: RegExp | string }
				| undefined;
			if (patternRule && value !== "") {
				const re =
					patternRule.value instanceof RegExp ? patternRule.value : new RegExp(patternRule.value);
				if (!re.test(value)) {
					errorCount++;
					continue;
				}
			}

			// enum check
			const enumRule = column.rules?.find((r) => r.rule === "enum") as
				| { rule: "enum"; values: string[] }
				| undefined;
			if (enumRule && value !== "" && !enumRule.values.includes(value)) {
				errorCount++;
				continue;
			}

			// unique check
			const uniqueSet = uniqueSets.get(col);
			if (uniqueSet && value !== "") {
				if (uniqueSet.has(value)) {
					errorCount++;
				} else {
					uniqueSet.add(value);
				}
			}
		}
	}

	return errorCount;
}

// ============================================================================
// CSV Generation for Parse+Validate Pipeline
// ============================================================================

function dataToCSV(data: string[][]): string {
	const header = "sku,name,price,stock,email,category,active,created_at";
	const rows = data.map((row) =>
		row
			.map((cell) => {
				// Quote if contains comma, quote, or newline
				if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
					return `"${cell.replace(/"/g, '""')}"`;
				}
				return cell;
			})
			.join(",")
	);
	return `${header}\n${rows.join("\n")}`;
}

// ============================================================================
// Benchmark Runner
// ============================================================================

function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

function formatMs(ms: number): string {
	return `${ms.toFixed(2)}ms`;
}

async function main() {
	console.log("=== elek Validation Benchmark ===\n");

	// Generate data
	console.log("Generating test data...");
	const { data, expectedErrors } = generateData(ROW_COUNT);
	console.log(
		`Data: ${formatNumber(ROW_COUNT)} rows × 8 columns (${formatNumber(ROW_COUNT * 8)} cells)\n`
	);

	console.log("Expected error injection:");
	console.log(`  Duplicate SKU:    ~${formatNumber(expectedErrors.duplicateSku)}`);
	console.log(`  Empty name:       ~${formatNumber(expectedErrors.emptyName)}`);
	console.log(`  Invalid price:    ~${formatNumber(expectedErrors.invalidPrice)}`);
	console.log(`  Invalid stock:    ~${formatNumber(expectedErrors.invalidStock)}`);
	console.log(`  Invalid email:    ~${formatNumber(expectedErrors.invalidEmail)}`);
	console.log(`  Invalid category: ~${formatNumber(expectedErrors.invalidCategory)}`);
	console.log(`  Invalid boolean:  ~${formatNumber(expectedErrors.invalidBoolean)}`);
	console.log(`  Invalid date:     ~${formatNumber(expectedErrors.invalidDate)}`);
	console.log();

	// Schema compilation benchmark
	console.log("--- Schema Compilation ---");
	const compileStart = performance.now();
	const compiledValidator = new CompiledValidator(schema);
	const compileTime = performance.now() - compileStart;
	console.log(`compileSchema(): ${formatMs(compileTime)}\n`);

	// Validation benchmark
	console.log("--- Validation (Compiled) ---");
	const times: number[] = [];
	let result = compiledValidator.validateAll(data);

	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		result = compiledValidator.validateAll(data);
		const elapsed = performance.now() - start;
		times.push(elapsed);
		console.log(`Run ${i + 1}: ${formatMs(elapsed)}`);
	}

	const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
	const throughput = Math.round(ROW_COUNT / (avgTime / 1000));
	console.log(`Average: ${formatMs(avgTime)}`);
	console.log(`Throughput: ${formatNumber(throughput)} rows/sec\n`);

	// Results
	console.log("--- Results ---");
	console.log(`Total rows:   ${formatNumber(result.stats.totalRows)}`);
	console.log(`Valid rows:   ${formatNumber(result.stats.validRows)}`);
	console.log(`Invalid rows: ${formatNumber(result.stats.errorRows)}`);
	console.log(`Total errors: ${formatNumber(result.errors.length)}\n`);

	// Error breakdown
	console.log("--- Error Breakdown by Rule ---");
	const sortedRules = Object.entries(result.stats.errorsByRule).sort((a, b) => b[1] - a[1]);
	for (const [rule, count] of sortedRules) {
		console.log(`  ${rule.padEnd(12)} ${formatNumber(count)} errors`);
	}
	console.log();

	// Error breakdown by column
	console.log("--- Error Breakdown by Column ---");
	const sortedColumns = Object.entries(result.stats.errorsByColumn).sort((a, b) => b[1] - a[1]);
	for (const [col, count] of sortedColumns) {
		console.log(`  ${col.padEnd(12)} ${formatNumber(count)} errors`);
	}
	console.log();

	// Sample errors
	console.log("--- Sample Errors (first 10) ---");
	const sampleErrors = result.errors.slice(0, 10);
	for (const err of sampleErrors) {
		const colName = Object.keys(schema.columns)[err.col];
		const valuePreview = err.value.length > 20 ? `${err.value.slice(0, 20)}...` : err.value;
		console.log(
			`  Row ${String(err.row).padStart(5)}, Col ${err.col} (${colName}): rule=${err.message?.split(" ")[0] || "?"}, value="${valuePreview}"`
		);
	}
	console.log();

	// Naive comparison
	console.log("--- Compiled vs Naive Comparison ---");

	// Prepare column defs for naive validator
	const columnDefs: NaiveColumnDef[] = Object.values(schema.columns);

	// Warm up naive
	naiveValidate(data.slice(0, 1000), columnDefs);

	// Run naive benchmark
	const naiveStart = performance.now();
	const naiveErrorCount = naiveValidate(data, columnDefs);
	const naiveTime = performance.now() - naiveStart;

	// Run compiled for fair comparison
	const compiledStart = performance.now();
	const compiledResult = compiledValidator.validateAll(data);
	const compiledTime = performance.now() - compiledStart;

	const speedup = naiveTime / compiledTime;

	console.log(
		`Compiled: ${formatMs(compiledTime)} (${formatNumber(compiledResult.errors.length)} errors)`
	);
	console.log(`Naive:    ${formatMs(naiveTime)} (${formatNumber(naiveErrorCount)} errors)`);
	console.log(`Speedup:  ${speedup.toFixed(2)}x faster\n`);

	// Correctness check
	if (Math.abs(compiledResult.errors.length - naiveErrorCount) > 10) {
		console.log("⚠️  Warning: Error counts differ significantly!");
		console.log(`   Compiled: ${compiledResult.errors.length}, Naive: ${naiveErrorCount}`);
		console.log("   This may indicate a bug in one of the implementations.\n");
	} else {
		console.log("✓ Correctness check passed (error counts match within tolerance)\n");
	}

	// Parse + Validate pipeline
	console.log("--- Full Pipeline: Parse + Validate ---");

	// Generate CSV string
	console.log("Generating CSV string...");
	const csvString = dataToCSV(data);
	console.log(`CSV size: ${(csvString.length / 1024 / 1024).toFixed(2)} MB\n`);

	// Parse
	const parseStart = performance.now();
	const parsed = parse(csvString);
	const parseTime = performance.now() - parseStart;

	// Validate
	const validateStart = performance.now();
	const pipelineResult = compiledValidator.validateAll(parsed.rows);
	const validateTime = performance.now() - validateStart;

	const totalPipelineTime = parseTime + validateTime;

	console.log(`Parse:    ${formatMs(parseTime)}`);
	console.log(`Validate: ${formatMs(validateTime)}`);
	console.log(`Total:    ${formatMs(totalPipelineTime)}`);
	console.log(
		`Pipeline throughput: ${formatNumber(Math.round(ROW_COUNT / (totalPipelineTime / 1000)))} rows/sec\n`
	);

	// Bitmap vs Object Allocation comparison
	console.log("--- Bitmap vs Object Allocation ---");

	// Bitmap validation (lazy error materialization)
	const bitmapTimes: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const bitmapResult = compiledValidator.validateAllBitmap(data);
		// Access error count without materializing errors
		const count = bitmapResult.errorCount;
		const elapsed = performance.now() - start;
		bitmapTimes.push(elapsed);
	}
	const avgBitmapTime = bitmapTimes.reduce((a, b) => a + b, 0) / bitmapTimes.length;

	// Object validation (eager error materialization - legacy API)
	const objectTimes: number[] = [];
	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		const objectResult = compiledValidator.validateAll(data);
		// Access errors array (forces materialization)
		const count = objectResult.errors.length;
		const elapsed = performance.now() - start;
		objectTimes.push(elapsed);
	}
	const avgObjectTime = objectTimes.reduce((a, b) => a + b, 0) / objectTimes.length;

	const bitmapResult = compiledValidator.validateAllBitmap(data);
	const memoryUsage = bitmapResult.getMemoryUsage();

	console.log(
		`Bitmap (no materialization): ${formatMs(avgBitmapTime)} (${formatNumber(bitmapResult.errorCount)} errors)`
	);
	console.log(
		`Object (full materialization): ${formatMs(avgObjectTime)} (${formatNumber(compiledResult.errors.length)} errors)`
	);
	console.log(`Speedup: ${(avgObjectTime / avgBitmapTime).toFixed(2)}x faster`);
	console.log(
		`Memory (bitmap):  ${formatNumber(memoryUsage.bitmap)} bytes (~${(memoryUsage.bitmap / 1024).toFixed(0)}KB)`
	);
	console.log(
		`Memory (codes):   ${formatNumber(memoryUsage.codes)} bytes (~${(memoryUsage.codes / 1024).toFixed(0)}KB)`
	);
	console.log(
		`Memory (total):   ${formatNumber(memoryUsage.total)} bytes (~${(memoryUsage.total / 1024).toFixed(0)}KB)`
	);

	// Estimate object memory
	const estimatedObjectMemory = compiledResult.errors.length * 100; // ~100 bytes per error object
	console.log(
		`Memory (objects): ~${formatNumber(estimatedObjectMemory)} bytes (~${(estimatedObjectMemory / 1024).toFixed(0)}KB estimated)\n`
	);

	// Demonstrate lazy error access
	console.log("--- Lazy Error Access Demo ---");
	const lazyStart = performance.now();
	const first100 = bitmapResult.getErrors({ limit: 100 });
	const lazyTime = performance.now() - lazyStart;
	console.log(`getErrors(limit: 100): ${formatMs(lazyTime)} for ${first100.length} errors`);

	const rowStart = performance.now();
	const rowErrors = bitmapResult.getRowErrors(first100[0]?.row ?? 0);
	const rowTime = performance.now() - rowStart;
	console.log(
		`getRowErrors(${first100[0]?.row ?? 0}): ${formatMs(rowTime)} for ${rowErrors.length} errors`
	);

	const cellStart = performance.now();
	const cellError = bitmapResult.getCellError(first100[0]?.row ?? 0, first100[0]?.col ?? 0);
	const cellTime = performance.now() - cellStart;
	console.log(`getCellError(): ${formatMs(cellTime)} -> ${cellError?.message ?? "no error"}\n`);

	console.log("=== Benchmark Complete ===\n");

	// Locale-aware validation benchmark
	await runLocaleBenchmark();
}

// ============================================================================
// Locale-Aware Validation Benchmark
// ============================================================================

// Turkish data generators
function generateTurkishDate(): string {
	const year = randomInt(2020, 2025);
	const month = String(randomInt(1, 12)).padStart(2, "0");
	const day = String(randomInt(1, 28)).padStart(2, "0");
	return `${day}.${month}.${year}`; // DD.MM.YYYY
}

function generateTurkishNumber(): string {
	const value = randomInt(100, 99999) + Math.random();
	// Format as Turkish: 1.234,56
	const parts = value.toFixed(2).split(".");
	const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	return `${intPart},${parts[1]}`;
}

function generateTurkishPhone(): string {
	const formats = [
		() =>
			`+90 ${randomInt(500, 559)} ${randomInt(100, 999)} ${String(randomInt(10, 99)).padStart(2, "0")} ${String(randomInt(10, 99)).padStart(2, "0")}`,
		() =>
			`0${randomInt(500, 559)} ${randomInt(100, 999)} ${String(randomInt(10, 99)).padStart(2, "0")} ${String(randomInt(10, 99)).padStart(2, "0")}`,
		() => `0${randomInt(500, 559)}${randomInt(1000000, 9999999)}`,
	];
	return formats[randomInt(0, formats.length - 1)]();
}

function generateTurkishCurrency(): string {
	const value = randomInt(10, 9999) + Math.random();
	const formatted = generateTurkishNumber();
	const prefixes = ["₺", "", "TL "];
	const prefix = prefixes[randomInt(0, 2)];
	if (prefix === "") {
		return `${formatted} TL`;
	}
	return `${prefix}${formatted}`;
}

function generateTurkishBoolean(): string {
	const values = ["evet", "hayır", "e", "h", "doğru", "yanlış", "1", "0"];
	return values[randomInt(0, values.length - 1)];
}

const invalidTurkishDates = ["2025-01-25", "01/25/2025", "invalid", "32.01.2025", "29.02.2025"];
const invalidTurkishNumbers = ["1,234.56", "abc", ""];
const invalidTurkishPhones = ["+1 555 123 4567", "123", "invalid"];
const invalidTurkishBooleans = ["belki", "maybe", "on"];

function generateTurkishData(rowCount: number): string[][] {
	const data: string[][] = [];

	for (let i = 0; i < rowCount; i++) {
		const row: string[] = [];

		// Product name
		row.push(randomElement(productNames));

		// Price (Turkish format)
		if (Math.random() < 0.02) {
			row.push(randomElement(invalidTurkishNumbers));
		} else {
			row.push(generateTurkishNumber());
		}

		// Date (Turkish format)
		if (Math.random() < 0.02) {
			row.push(randomElement(invalidTurkishDates));
		} else {
			row.push(generateTurkishDate());
		}

		// Phone (Turkish format)
		if (Math.random() < 0.02) {
			row.push(randomElement(invalidTurkishPhones));
		} else {
			row.push(generateTurkishPhone());
		}

		// Currency (Turkish format)
		row.push(generateTurkishCurrency());

		// Boolean (Turkish)
		if (Math.random() < 0.01) {
			row.push(randomElement(invalidTurkishBooleans));
		} else {
			row.push(generateTurkishBoolean());
		}

		data.push(row);
	}

	return data;
}

const turkishSchema: Schema = {
	locale: "tr",
	columns: {
		urun_adi: { type: "string", rules: [{ rule: "required" }] },
		fiyat: { type: "number", rules: [{ rule: "min", value: 0 }] },
		tarih: { type: "date" },
		telefon: { type: "phone" },
		tutar: { type: "currency" },
		aktif: { type: "boolean" },
	},
};

// Same schema without locale (for comparison)
const standardSchema: Schema = {
	columns: {
		urun_adi: { type: "string", rules: [{ rule: "required" }] },
		fiyat: { type: "number", rules: [{ rule: "min", value: 0 }] },
		tarih: { type: "date" },
		telefon: { type: "phone" },
		tutar: { type: "currency" },
		aktif: { type: "boolean" },
	},
};

async function runLocaleBenchmark() {
	console.log("=== Locale-Aware Validation Benchmark ===\n");

	const rowCount = 100_000;
	console.log(`Generating Turkish e-commerce data (${formatNumber(rowCount)} rows)...`);
	const turkishData = generateTurkishData(rowCount);

	// Compile validators
	const turkishValidator = new CompiledValidator(turkishSchema);
	const standardValidator = new CompiledValidator(standardSchema);

	// Warm up
	turkishValidator.validateAll(turkishData.slice(0, 1000));
	standardValidator.validateAll(turkishData.slice(0, 1000));

	// Turkish locale validation
	console.log("\n--- Turkish Locale Validation ---");
	const turkishTimes: number[] = [];
	let turkishResult = turkishValidator.validateAll(turkishData);

	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		turkishResult = turkishValidator.validateAll(turkishData);
		const elapsed = performance.now() - start;
		turkishTimes.push(elapsed);
		console.log(`Run ${i + 1}: ${formatMs(elapsed)}`);
	}

	const avgTurkishTime = turkishTimes.reduce((a, b) => a + b, 0) / turkishTimes.length;
	console.log(`Average: ${formatMs(avgTurkishTime)}`);
	console.log(
		`Throughput: ${formatNumber(Math.round(rowCount / (avgTurkishTime / 1000)))} rows/sec`
	);
	console.log(
		`Valid rows: ${formatNumber(turkishResult.stats.validRows)}/${formatNumber(turkishResult.stats.totalRows)}`
	);
	console.log(`Errors: ${formatNumber(turkishResult.errors.length)}`);

	// Standard validation (for overhead comparison)
	console.log("\n--- Standard (No Locale) Validation ---");
	const standardTimes: number[] = [];

	for (let i = 0; i < RUNS; i++) {
		const start = performance.now();
		standardValidator.validateAll(turkishData);
		const elapsed = performance.now() - start;
		standardTimes.push(elapsed);
		console.log(`Run ${i + 1}: ${formatMs(elapsed)}`);
	}

	const avgStandardTime = standardTimes.reduce((a, b) => a + b, 0) / standardTimes.length;
	console.log(`Average: ${formatMs(avgStandardTime)}`);

	// Calculate overhead
	const overhead = ((avgTurkishTime - avgStandardTime) / avgStandardTime) * 100;
	console.log("\n--- Locale Overhead ---");
	console.log(`Turkish locale: ${formatMs(avgTurkishTime)}`);
	console.log(`No locale:      ${formatMs(avgStandardTime)}`);
	console.log(`Overhead:       ${overhead > 0 ? "+" : ""}${overhead.toFixed(1)}%`);

	// Error breakdown
	console.log("\n--- Error Breakdown by Column (Turkish Locale) ---");
	const sortedColumns = Object.entries(turkishResult.stats.errorsByColumn).sort(
		(a, b) => b[1] - a[1]
	);
	for (const [col, count] of sortedColumns) {
		console.log(`  ${col.padEnd(12)} ${formatNumber(count)} errors`);
	}

	// Sample Turkish errors
	console.log("\n--- Sample Turkish Validation Errors ---");
	const sampleTurkishErrors = turkishResult.errors.slice(0, 5);
	for (const err of sampleTurkishErrors) {
		const valuePreview = err.value.length > 25 ? `${err.value.slice(0, 25)}...` : err.value;
		console.log(
			`  Row ${String(err.row).padStart(5)}: ${err.field} = "${valuePreview}" - ${err.message}`
		);
	}

	// Demonstrate normalization
	console.log("\n--- Value Normalization Demo ---");
	const sampleTurkishDate = "25.01.2025";
	const sampleTurkishNumber = "1.234,56";
	console.log(
		`Turkish date "${sampleTurkishDate}" → ISO "${normalizeDateToISO(sampleTurkishDate, "tr")}"`
	);
	console.log(
		`Turkish number "${sampleTurkishNumber}" → Standard "${normalizeNumber(sampleTurkishNumber, "tr")}"`
	);

	console.log("\n=== Locale Benchmark Complete ===");
}

main().catch(console.error);
