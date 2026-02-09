import { describe, expect, test } from "bun:test";
import {
	commonPrefixLength,
	computeBestMatch,
	computeSimilarity,
	containsMatch,
	levenshtein,
	levenshteinSimilarity,
	normalize,
	tokenSimilarity,
	tokenize,
} from "./similarity";

// ============================================================================
// Levenshtein Distance Tests
// ============================================================================

describe("levenshtein", () => {
	test("identical strings have distance 0", () => {
		expect(levenshtein("hello", "hello")).toBe(0);
		expect(levenshtein("", "")).toBe(0);
		expect(levenshtein("price", "price")).toBe(0);
	});

	test("single character difference", () => {
		expect(levenshtein("hello", "hallo")).toBe(1); // substitution
		expect(levenshtein("hello", "hell")).toBe(1); // deletion
		expect(levenshtein("hello", "helloo")).toBe(1); // insertion
	});

	test("completely different strings", () => {
		expect(levenshtein("abc", "xyz")).toBe(3);
		expect(levenshtein("cat", "dog")).toBe(3);
	});

	test("empty string comparisons", () => {
		expect(levenshtein("", "hello")).toBe(5);
		expect(levenshtein("hello", "")).toBe(5);
	});

	test("Turkish characters", () => {
		expect(levenshtein("fiyat", "fıyat")).toBe(1);
		expect(levenshtein("ürün", "urun")).toBe(2);
		expect(levenshtein("şehir", "sehir")).toBe(1);
		expect(levenshtein("çocuk", "cocuk")).toBe(1);
		expect(levenshtein("güneş", "gunes")).toBe(2);
	});

	test("common typos", () => {
		expect(levenshtein("price", "pricee")).toBe(1);
		expect(levenshtein("email", "emial")).toBe(2);
		expect(levenshtein("phone", "phoen")).toBe(2);
	});

	test("prefix/suffix differences", () => {
		expect(levenshtein("email", "email_address")).toBe(8);
		expect(levenshtein("product_name", "name")).toBe(8);
	});
});

// ============================================================================
// Levenshtein Similarity Tests
// ============================================================================

describe("levenshteinSimilarity", () => {
	test("identical strings have similarity 1", () => {
		expect(levenshteinSimilarity("hello", "hello")).toBe(1);
		expect(levenshteinSimilarity("price", "price")).toBe(1);
	});

	test("empty strings have similarity 1", () => {
		expect(levenshteinSimilarity("", "")).toBe(1);
	});

	test("single character typo", () => {
		const sim = levenshteinSimilarity("price", "pricee");
		expect(sim).toBeCloseTo(0.833, 2); // 1 - 1/6
	});

	test("completely different strings have low similarity", () => {
		const sim = levenshteinSimilarity("abc", "xyz");
		expect(sim).toBe(0);
	});
});

// ============================================================================
// Normalize Tests
// ============================================================================

describe("normalize", () => {
	test("trims whitespace", () => {
		expect(normalize("  Price  ")).toBe("price");
		expect(normalize("\tEmail\n")).toBe("email");
	});

	test("converts to lowercase", () => {
		expect(normalize("PRICE")).toBe("price");
		expect(normalize("Ürün Fiyatı")).toBe("ürün fiyatı");
		// Standard lowercase for compatibility (I → i, not Turkish I → ı)
		expect(normalize("ISIK")).toBe("isik");
	});

	test("replaces underscore with space", () => {
		expect(normalize("email_address")).toBe("email address");
		expect(normalize("product_name")).toBe("product name");
	});

	test("replaces dash with space", () => {
		expect(normalize("E-Mail")).toBe("e mail");
		expect(normalize("e-posta")).toBe("e posta");
	});

	test("collapses multiple spaces", () => {
		expect(normalize("hello   world")).toBe("hello world");
		expect(normalize("a  b  c")).toBe("a b c");
	});

	test("combined transformations", () => {
		expect(normalize("  Product_Name  ")).toBe("product name");
		expect(normalize("E-Mail_Address")).toBe("e mail address");
	});
});

// ============================================================================
// Tokenize Tests
// ============================================================================

describe("tokenize", () => {
	test("splits by space", () => {
		expect(tokenize("hello world")).toEqual(["hello", "world"]);
	});

	test("handles underscores and dashes", () => {
		expect(tokenize("email_address")).toEqual(["email", "address"]);
		expect(tokenize("e-mail")).toEqual(["e", "mail"]);
	});

	test("filters empty tokens", () => {
		expect(tokenize("  hello   world  ")).toEqual(["hello", "world"]);
	});

	test("single word", () => {
		expect(tokenize("price")).toEqual(["price"]);
	});

	test("empty string returns empty array", () => {
		expect(tokenize("")).toEqual([]);
		expect(tokenize("   ")).toEqual([]);
	});
});

// ============================================================================
// Token Similarity Tests
// ============================================================================

describe("tokenSimilarity", () => {
	test("identical tokens have similarity 1", () => {
		expect(tokenSimilarity("hello world", "hello world")).toBe(1);
	});

	test("partial token match", () => {
		const sim = tokenSimilarity("ürün fiyatı", "fiyat");
		expect(sim).toBeGreaterThan(0.4); // "fiyatı" vs "fiyat" fuzzy match
	});

	test("multi-word with overlap", () => {
		const sim = tokenSimilarity("email address", "email");
		expect(sim).toBeGreaterThanOrEqual(0.5); // One exact match out of 2 tokens
	});

	test("no common tokens", () => {
		const sim = tokenSimilarity("hello world", "foo bar");
		expect(sim).toBeLessThan(0.3);
	});

	test("empty strings return 0", () => {
		expect(tokenSimilarity("", "hello")).toBe(0);
		expect(tokenSimilarity("hello", "")).toBe(0);
	});
});

// ============================================================================
// Contains Match Tests
// ============================================================================

describe("containsMatch", () => {
	test("one contains the other", () => {
		expect(containsMatch("email", "email_address")).toBe(true);
		expect(containsMatch("product_name", "name")).toBe(true);
	});

	test("normalized containment", () => {
		expect(containsMatch("EMAIL", "email_address")).toBe(true);
		expect(containsMatch("Product-Name", "name")).toBe(true);
		expect(containsMatch("product name", "NAME")).toBe(true);
	});

	test("no containment", () => {
		expect(containsMatch("hello", "world")).toBe(false);
		expect(containsMatch("abc", "xyz")).toBe(false);
	});

	test("short strings don't match (< 3 chars)", () => {
		expect(containsMatch("ab", "abc")).toBe(false);
		expect(containsMatch("a", "abc")).toBe(false);
	});
});

// ============================================================================
// Common Prefix Length Tests
// ============================================================================

describe("commonPrefixLength", () => {
	test("full match", () => {
		expect(commonPrefixLength("hello", "hello")).toBe(5);
	});

	test("partial prefix", () => {
		expect(commonPrefixLength("email", "email_address")).toBe(5);
		expect(commonPrefixLength("hello", "help")).toBe(3);
	});

	test("no common prefix", () => {
		expect(commonPrefixLength("hello", "world")).toBe(0);
	});

	test("empty string", () => {
		expect(commonPrefixLength("", "hello")).toBe(0);
		expect(commonPrefixLength("hello", "")).toBe(0);
	});
});

// ============================================================================
// Composite Similarity Tests
// ============================================================================

describe("computeSimilarity", () => {
	test("exact match returns 1", () => {
		expect(computeSimilarity("price", "price")).toBe(1);
		expect(computeSimilarity("Price", "price")).toBe(1);
		expect(computeSimilarity("  PRICE  ", "price")).toBe(1);
	});

	test("contains match gives high score", () => {
		const sim = computeSimilarity("email_address", "email");
		expect(sim).toBeGreaterThanOrEqual(0.7);
	});

	test("close typo gives high score", () => {
		const sim = computeSimilarity("pricee", "price");
		expect(sim).toBeGreaterThanOrEqual(0.7);
	});

	test("completely different gives low score", () => {
		const sim = computeSimilarity("hello", "world");
		expect(sim).toBeLessThan(0.5);
	});

	test("Turkish fuzzy matching", () => {
		const sim = computeSimilarity("fiyatı", "fiyat");
		expect(sim).toBeGreaterThan(0.8);
	});

	test("multi-word to single word", () => {
		const sim = computeSimilarity("ürün fiyatı", "fiyat");
		expect(sim).toBeGreaterThan(0.6);
	});
});

// ============================================================================
// Compute Best Match Tests
// ============================================================================

describe("computeBestMatch", () => {
	test("exact column name match", () => {
		const result = computeBestMatch("price", "price", ["fiyat", "ürün fiyatı"]);
		expect(result.score).toBe(1);
		expect(result.matchedVia).toBe("price");
		expect(result.isAlias).toBe(false);
	});

	test("exact alias match", () => {
		const result = computeBestMatch("fiyat", "price", ["fiyat", "ürün fiyatı"]);
		expect(result.score).toBe(1);
		expect(result.matchedVia).toBe("fiyat");
		expect(result.isAlias).toBe(true);
	});

	test("case-insensitive alias match", () => {
		const result = computeBestMatch("FIYAT", "price", ["fiyat"]);
		expect(result.score).toBe(1);
		expect(result.isAlias).toBe(true);
	});

	test("fuzzy match to column name", () => {
		const result = computeBestMatch("pricee", "price", []);
		expect(result.score).toBeGreaterThan(0.7);
		expect(result.matchedVia).toBe("price");
		expect(result.isAlias).toBe(false);
	});

	test("fuzzy match to alias", () => {
		const result = computeBestMatch("ürün fiyatı", "price", [
			"fiyat",
			"ürün fiyatı",
			"birim fiyat",
		]);
		expect(result.score).toBe(1);
		expect(result.matchedVia).toBe("ürün fiyatı");
		expect(result.isAlias).toBe(true);
	});

	test("picks best match from aliases", () => {
		const result = computeBestMatch("telefon numarası", "phone", [
			"telefon",
			"tel",
			"telefon numarası",
		]);
		expect(result.score).toBe(1);
		expect(result.matchedVia).toBe("telefon numarası");
	});

	test("no aliases provided", () => {
		const result = computeBestMatch("price", "price", undefined);
		expect(result.score).toBe(1);
		expect(result.isAlias).toBe(false);
	});

	test("empty aliases array", () => {
		const result = computeBestMatch("price", "price", []);
		expect(result.score).toBe(1);
		expect(result.isAlias).toBe(false);
	});
});
