// ============================================================================
// String Similarity Functions for Column Mapping
// ============================================================================

/**
 * Compute Levenshtein edit distance between two strings.
 * Uses Wagner-Fischer dynamic programming algorithm.
 * Time: O(n*m), Space: O(min(n,m))
 */
export function levenshtein(a: string, b: string): number {
	// Early exits
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	// Ensure shorter is the first string (optimize space)
	const shorter = a.length <= b.length ? a : b;
	const longer = a.length <= b.length ? b : a;

	const aLen = shorter.length;
	const bLen = longer.length;

	// Use two rows instead of full matrix
	let prevRow = new Array<number>(aLen + 1);
	let currRow = new Array<number>(aLen + 1);

	// Initialize first row
	for (let i = 0; i <= aLen; i++) {
		prevRow[i] = i;
	}

	// Fill the matrix
	for (let j = 1; j <= bLen; j++) {
		currRow[0] = j;

		for (let i = 1; i <= aLen; i++) {
			const cost = shorter[i - 1] === longer[j - 1] ? 0 : 1;
			currRow[i] = Math.min(
				prevRow[i] + 1, // deletion
				currRow[i - 1] + 1, // insertion
				prevRow[i - 1] + cost // substitution
			);
		}

		// Swap rows
		const temp = prevRow;
		prevRow = currRow;
		currRow = temp;
	}

	return prevRow[aLen];
}

/**
 * Compute normalized Levenshtein similarity (0-1 range).
 * 1 = identical, 0 = completely different
 */
export function levenshteinSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	const maxLen = Math.max(a.length, b.length);
	if (maxLen === 0) return 1;
	return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Normalize a string for comparison.
 * - Trim whitespace
 * - Convert to lowercase (preserves Turkish characters but uses standard lowercasing)
 * - Replace underscores and dashes with spaces
 * - Collapse multiple spaces
 *
 * Note: Uses standard toLowerCase() to avoid Turkish I→ı transformation
 * which would break matching of English words. Turkish-specific chars
 * (ü,ö,ç,ş,ğ,ı,İ) are preserved as-is after lowercase.
 */
export function normalize(str: string): string {
	return str
		.trim()
		.toLowerCase() // Standard lowercase (I→i, not I→ı)
		.replace(/[_\-]/g, " ") // underscore/dash → space
		.replace(/\s+/g, " "); // collapse multiple spaces
}

/**
 * Tokenize a string into words.
 */
export function tokenize(str: string): string[] {
	return normalize(str)
		.split(" ")
		.filter((t) => t.length > 0);
}

/**
 * Compute token-based similarity using best match for each token.
 * For multi-word headers, finds the best token-to-token matches.
 * Uses symmetric comparison (both directions) for better results.
 */
export function tokenSimilarity(a: string, b: string): number {
	const tokensA = tokenize(a);
	const tokensB = tokenize(b);

	if (tokensA.length === 0 || tokensB.length === 0) {
		return 0;
	}

	// For each token in A, find best match in B
	let scoreAB = 0;
	for (const tokenA of tokensA) {
		let bestMatch = 0;
		for (const tokenB of tokensB) {
			const sim = levenshteinSimilarity(tokenA, tokenB);
			bestMatch = Math.max(bestMatch, sim);
		}
		scoreAB += bestMatch;
	}
	scoreAB /= tokensA.length;

	// For each token in B, find best match in A (symmetric)
	let scoreBA = 0;
	for (const tokenB of tokensB) {
		let bestMatch = 0;
		for (const tokenA of tokensA) {
			const sim = levenshteinSimilarity(tokenB, tokenA);
			bestMatch = Math.max(bestMatch, sim);
		}
		scoreBA += bestMatch;
	}
	scoreBA /= tokensB.length;

	// Return the average of both directions
	return (scoreAB + scoreBA) / 2;
}

/**
 * Check if one normalized string contains the other.
 * Returns true if either contains the other (minimum 3 chars to match).
 */
export function containsMatch(a: string, b: string): boolean {
	const normA = normalize(a);
	const normB = normalize(b);

	// Skip very short strings
	if (normA.length < 3 || normB.length < 3) {
		return false;
	}

	return normA.includes(normB) || normB.includes(normA);
}

/**
 * Compute common prefix length between two strings.
 */
export function commonPrefixLength(a: string, b: string): number {
	const minLen = Math.min(a.length, b.length);
	let i = 0;
	while (i < minLen && a[i] === b[i]) {
		i++;
	}
	return i;
}

/**
 * Compute composite similarity score between a CSV header and a target string.
 * Combines multiple similarity metrics for robust matching.
 *
 * @param csvHeader - The header from the CSV file
 * @param target - The schema column name or alias to compare against
 * @returns Similarity score from 0 to 1
 */
export function computeSimilarity(csvHeader: string, target: string): number {
	const h = normalize(csvHeader);
	const t = normalize(target);

	// Exact match after normalization
	if (h === t) {
		return 1;
	}

	let score = 0;

	// Levenshtein similarity
	const levSim = levenshteinSimilarity(h, t);
	score = Math.max(score, levSim);

	// Contains bonus (one contains the other)
	if (containsMatch(h, t)) {
		// Give higher score based on length ratio
		const ratio = Math.min(h.length, t.length) / Math.max(h.length, t.length);
		const containsScore = 0.7 + 0.2 * ratio; // 0.7-0.9 range
		score = Math.max(score, containsScore);
	}

	// Token similarity for multi-word strings
	const tokenSim = tokenSimilarity(h, t);
	score = Math.max(score, tokenSim);

	// Common prefix bonus (for strings sharing same start)
	const prefixLen = commonPrefixLength(h, t);
	if (prefixLen >= 3) {
		const prefixRatio = prefixLen / Math.max(h.length, t.length);
		const prefixScore = 0.5 + 0.4 * prefixRatio; // 0.5-0.9 range
		score = Math.max(score, prefixScore);
	}

	return score;
}

/**
 * Compute the best similarity score between a CSV header and a schema column,
 * considering both the column name and all its aliases.
 *
 * @param csvHeader - The header from the CSV file
 * @param columnName - The schema column name
 * @param aliases - Optional array of column aliases
 * @returns Object with score and matched target (column name or alias)
 */
export function computeBestMatch(
	csvHeader: string,
	columnName: string,
	aliases?: string[]
): { score: number; matchedVia: string; isAlias: boolean } {
	// Check column name first
	let bestScore = computeSimilarity(csvHeader, columnName);
	let matchedVia = columnName;
	let isAlias = false;

	// Check if normalized exact match with column name
	if (normalize(csvHeader) === normalize(columnName)) {
		return { score: 1, matchedVia: columnName, isAlias: false };
	}

	// Check aliases
	if (aliases) {
		for (const alias of aliases) {
			// Exact alias match
			if (normalize(csvHeader) === normalize(alias)) {
				return { score: 1, matchedVia: alias, isAlias: true };
			}

			// Fuzzy alias match
			const aliasScore = computeSimilarity(csvHeader, alias);
			if (aliasScore > bestScore) {
				bestScore = aliasScore;
				matchedVia = alias;
				isAlias = true;
			}
		}
	}

	return { score: bestScore, matchedVia, isAlias };
}
