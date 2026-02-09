/**
 * Column Mapping Benchmark
 *
 * Tests the fuzzy matching column mapper with various scenarios.
 */

import {
	type Schema,
	applyMapping,
	computeSimilarity,
	levenshtein,
	mapAndValidate,
	mapColumns,
} from "@elekcsv/core";

// ============================================================================
// Configuration
// ============================================================================

const RUNS = 5;
const HEADER_VARIATIONS = 1000; // Number of header variations to test

// ============================================================================
// Test Schema (Turkish e-commerce)
// ============================================================================

const schema: Schema = {
	columns: {
		price: {
			type: "number",
			aliases: ["fiyat", "ürün fiyatı", "birim fiyat", "unit price", "amount", "tutar"],
		},
		email: {
			type: "string",
			aliases: ["e-posta", "eposta", "mail", "email address", "e-mail"],
			rules: [{ rule: "email" }],
		},
		phone: {
			type: "phone",
			aliases: ["telefon", "tel", "phone number", "gsm", "cep", "telefon numarası"],
		},
		created_at: {
			type: "date",
			aliases: ["tarih", "kayıt tarihi", "date", "creation date", "oluşturma tarihi"],
		},
		name: {
			type: "string",
			aliases: ["ad", "ürün adı", "isim", "product name", "başlık", "title"],
		},
		sku: {
			type: "string",
			aliases: ["stok kodu", "ürün kodu", "product code", "barkod", "barcode"],
		},
		stock: {
			type: "integer",
			aliases: ["stok", "adet", "miktar", "quantity", "qty"],
		},
		category: {
			type: "string",
			aliases: ["kategori", "kat", "tür", "tip"],
		},
	},
};

// ============================================================================
// Header Variations
// ============================================================================

// Exact match headers
const exactHeaders = ["price", "email", "phone", "created_at", "name", "sku", "stock", "category"];

// Turkish alias headers
const turkishHeaders = [
	"Fiyat",
	"E-Posta",
	"Telefon",
	"Tarih",
	"Ürün Adı",
	"Stok Kodu",
	"Adet",
	"Kategori",
];

// English alias headers
const englishAliasHeaders = [
	"Unit Price",
	"Email Address",
	"Phone Number",
	"Creation Date",
	"Product Name",
	"Product Code",
	"Quantity",
	"Category",
];

// Fuzzy headers (typos and variations)
const fuzzyHeaders = [
	"pricee",
	"e-mail",
	"telephon",
	"dates",
	"product_name",
	"product_codes",
	"qty",
	"kategorii",
];

// Mixed headers (some exact, some alias, some fuzzy)
const mixedHeaders = [
	"price",
	"Eposta",
	"phone number",
	"Kayıt Tarihi",
	"name",
	"barkod",
	"adet",
	"tip",
];

// Headers with extra columns
const extraHeaders = [
	"price",
	"email",
	"extra_col_1",
	"phone",
	"random_data",
	"name",
	"category",
	"unused",
];

// ============================================================================
// Benchmark Functions
// ============================================================================

function benchLevenshtein(): number {
	const pairs = [
		["price", "pricee"],
		["email", "e-mail"],
		["telefon", "telephone"],
		["ürün fiyatı", "urun fiyati"],
		["product_name", "productname"],
		["category", "kategori"],
	];

	const start = performance.now();

	for (let i = 0; i < HEADER_VARIATIONS; i++) {
		for (const [a, b] of pairs) {
			levenshtein(a, b);
		}
	}

	return performance.now() - start;
}

function benchComputeSimilarity(): number {
	const pairs = [
		["Ürün Fiyatı", "price"],
		["E-Posta", "email"],
		["Telefon Numarası", "phone"],
		["product_name", "name"],
		["stok kodu", "sku"],
	];

	const start = performance.now();

	for (let i = 0; i < HEADER_VARIATIONS; i++) {
		for (const [header, column] of pairs) {
			computeSimilarity(header, column);
		}
	}

	return performance.now() - start;
}

function benchMapColumns(headers: string[], label: string): number {
	const start = performance.now();

	for (let i = 0; i < HEADER_VARIATIONS; i++) {
		mapColumns(headers, schema);
	}

	return performance.now() - start;
}

function benchApplyMapping(): number {
	// Create sample data (100 rows)
	const data: string[][] = [turkishHeaders];
	for (let i = 0; i < 100; i++) {
		data.push([
			"100.50",
			"test@example.com",
			"+90 532 123 4567",
			"25.01.2025",
			"Test Product",
			"SKU001",
			"50",
			"Electronics",
		]);
	}

	const mapping = mapColumns(turkishHeaders, schema);

	const start = performance.now();

	for (let i = 0; i < HEADER_VARIATIONS / 10; i++) {
		applyMapping(data, mapping.mappings, schema);
	}

	return performance.now() - start;
}

function benchFullPipeline(): number {
	// Create sample data
	const data: string[][] = [turkishHeaders];
	for (let i = 0; i < 100; i++) {
		data.push([
			"100.50",
			"test@example.com",
			"+90 532 123 4567",
			"2025-01-25",
			"Test Product",
			"SKU001",
			"50",
			"Electronics",
		]);
	}

	const start = performance.now();

	for (let i = 0; i < HEADER_VARIATIONS / 10; i++) {
		mapAndValidate(data, schema);
	}

	return performance.now() - start;
}

// ============================================================================
// Main Benchmark
// ============================================================================

console.log("=".repeat(60));
console.log("Column Mapping Benchmark");
console.log("=".repeat(60));
console.log(`Runs: ${RUNS}`);
console.log(`Header variations per run: ${HEADER_VARIATIONS}`);
console.log();

// Warm up
mapColumns(exactHeaders, schema);
mapColumns(turkishHeaders, schema);

// Run benchmarks
const results: Record<string, number[]> = {
	levenshtein: [],
	similarity: [],
	"exact match": [],
	"turkish alias": [],
	"english alias": [],
	"fuzzy match": [],
	"mixed match": [],
	"with extra cols": [],
	"apply mapping": [],
	"full pipeline": [],
};

for (let run = 0; run < RUNS; run++) {
	results.levenshtein.push(benchLevenshtein());
	results.similarity.push(benchComputeSimilarity());
	results["exact match"].push(benchMapColumns(exactHeaders, "exact"));
	results["turkish alias"].push(benchMapColumns(turkishHeaders, "turkish"));
	results["english alias"].push(benchMapColumns(englishAliasHeaders, "english alias"));
	results["fuzzy match"].push(benchMapColumns(fuzzyHeaders, "fuzzy"));
	results["mixed match"].push(benchMapColumns(mixedHeaders, "mixed"));
	results["with extra cols"].push(benchMapColumns(extraHeaders, "extra"));
	results["apply mapping"].push(benchApplyMapping());
	results["full pipeline"].push(benchFullPipeline());
}

// Calculate statistics
function median(arr: number[]): number {
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

console.log("--- Levenshtein Distance ---");
console.log(`  ${HEADER_VARIATIONS * 6} comparisons`);
console.log(`  Median: ${median(results.levenshtein).toFixed(2)}ms`);
console.log(
	`  Throughput: ${((HEADER_VARIATIONS * 6) / (median(results.levenshtein) / 1000) / 1_000_000).toFixed(2)}M ops/sec`
);
console.log();

console.log("--- Composite Similarity ---");
console.log(`  ${HEADER_VARIATIONS * 5} comparisons`);
console.log(`  Median: ${median(results.similarity).toFixed(2)}ms`);
console.log(
	`  Throughput: ${((HEADER_VARIATIONS * 5) / (median(results.similarity) / 1000) / 1_000_000).toFixed(2)}M ops/sec`
);
console.log();

console.log("--- mapColumns() (8 columns) ---");
console.log(`  ${HEADER_VARIATIONS} mappings per test`);
console.log();

for (const key of [
	"exact match",
	"turkish alias",
	"english alias",
	"fuzzy match",
	"mixed match",
	"with extra cols",
]) {
	const med = median(results[key]);
	const opsPerSec = HEADER_VARIATIONS / (med / 1000);
	console.log(
		`  ${key.padEnd(16)}: ${med.toFixed(2)}ms (${(opsPerSec / 1000).toFixed(1)}K mappings/sec)`
	);
}
console.log();

console.log("--- applyMapping() (100 rows) ---");
const applyMed = median(results["apply mapping"]);
const applyOps = HEADER_VARIATIONS / 10 / (applyMed / 1000);
console.log(`  Median: ${applyMed.toFixed(2)}ms`);
console.log(`  Throughput: ${(applyOps / 1000).toFixed(1)}K transforms/sec`);
console.log();

console.log("--- Full Pipeline: Map + Validate (100 rows) ---");
const pipelineMed = median(results["full pipeline"]);
const pipelineOps = HEADER_VARIATIONS / 10 / (pipelineMed / 1000);
console.log(`  Median: ${pipelineMed.toFixed(2)}ms`);
console.log(`  Throughput: ${(pipelineOps / 1000).toFixed(1)}K pipelines/sec`);
console.log();

// Mapping result analysis
console.log("--- Mapping Results Analysis ---");
const scenarios = [
	{ name: "Exact Match", headers: exactHeaders },
	{ name: "Turkish Alias", headers: turkishHeaders },
	{ name: "English Alias", headers: englishAliasHeaders },
	{ name: "Fuzzy Match", headers: fuzzyHeaders },
	{ name: "Mixed", headers: mixedHeaders },
	{ name: "Extra Columns", headers: extraHeaders },
];

for (const { name, headers } of scenarios) {
	const result = mapColumns(headers, schema);
	console.log(`  ${name}:`);
	console.log(
		`    Auto-mapped: ${result.autoMapped}, Needs Review: ${result.needsReview}, Unmapped: ${result.unmapped}`
	);

	const exactCount = result.mappings.filter((m) => m.confidence === "exact").length;
	const aliasCount = result.mappings.filter((m) => m.confidence === "alias").length;
	const fuzzyCount = result.mappings.filter((m) => m.confidence === "fuzzy").length;
	console.log(`    Confidence: exact=${exactCount}, alias=${aliasCount}, fuzzy=${fuzzyCount}`);
}
console.log();

console.log("=".repeat(60));
