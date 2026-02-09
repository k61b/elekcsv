// ============================================================================
// Column Mapping Engine
// ============================================================================

import type { Schema } from "../types";
import type { ValidationResult } from "../validator";
import { validate } from "../validator";
import { computeBestMatch, normalize } from "./similarity";
import type {
	MappingConfidence,
	MappingMatch,
	MappingOptions,
	MappingResult,
	ScoringResult,
} from "./types";

// Default thresholds
const DEFAULT_FUZZY_THRESHOLD = 0.6;
const DEFAULT_AUTO_ACCEPT_THRESHOLD = 0.8;

/**
 * Map CSV headers to schema columns using a 3-layer matching strategy:
 * 1. Exact match (case-insensitive)
 * 2. Alias match (case-insensitive)
 * 3. Fuzzy match (similarity scoring)
 *
 * @param csvHeaders - Array of header strings from the CSV (first row)
 * @param schema - The target schema with column definitions
 * @param options - Optional mapping configuration
 * @returns MappingResult with mappings and statistics
 */
export function mapColumns(
	csvHeaders: string[],
	schema: Schema,
	options?: MappingOptions
): MappingResult {
	const fuzzyThreshold = options?.fuzzyThreshold ?? DEFAULT_FUZZY_THRESHOLD;
	const autoAcceptThreshold = options?.autoAcceptThreshold ?? DEFAULT_AUTO_ACCEPT_THRESHOLD;

	const schemaColumnNames = Object.keys(schema.columns);
	const usedSchemaColumns = new Set<string>();

	// Score all CSV headers against all schema columns
	const allScores: Array<{
		csvIndex: number;
		csvHeader: string;
		scoring: ScoringResult;
	}> = [];

	for (let csvIndex = 0; csvIndex < csvHeaders.length; csvIndex++) {
		const csvHeader = csvHeaders[csvIndex];
		const trimmedHeader = csvHeader.trim();

		// Skip empty headers
		if (trimmedHeader === "") {
			continue;
		}

		for (const schemaColumn of schemaColumnNames) {
			const columnDef = schema.columns[schemaColumn];
			const { score, matchedVia, isAlias } = computeBestMatch(
				trimmedHeader,
				schemaColumn,
				columnDef.aliases
			);

			// Determine confidence level
			let confidence: MappingConfidence = "none";
			if (score >= fuzzyThreshold) {
				if (normalize(trimmedHeader) === normalize(schemaColumn)) {
					confidence = "exact";
				} else if (isAlias && normalize(trimmedHeader) === normalize(matchedVia)) {
					confidence = "alias";
				} else if (score >= fuzzyThreshold) {
					confidence = "fuzzy";
				}
			}

			if (confidence !== "none") {
				allScores.push({
					csvIndex,
					csvHeader,
					scoring: {
						schemaColumn,
						confidence,
						score,
						matchedVia,
					},
				});
			}
		}
	}

	// Sort by score descending, then by confidence priority (exact > alias > fuzzy)
	// This ensures that when scores are equal, exact matches win
	const confidencePriority: Record<MappingConfidence, number> = {
		exact: 3,
		alias: 2,
		fuzzy: 1,
		none: 0,
	};
	allScores.sort((a, b) => {
		// First by score
		if (b.scoring.score !== a.scoring.score) {
			return b.scoring.score - a.scoring.score;
		}
		// Then by confidence priority
		return confidencePriority[b.scoring.confidence] - confidencePriority[a.scoring.confidence];
	});

	// Greedy assignment: each schema column and CSV column can only be used once
	const usedCsvColumns = new Set<number>();
	const mappings: MappingMatch[] = [];

	// Initialize with empty mappings for all CSV columns
	for (let i = 0; i < csvHeaders.length; i++) {
		mappings.push({
			csvIndex: i,
			csvHeader: csvHeaders[i],
			schemaColumn: "",
			confidence: "none",
			score: 0,
		});
	}

	// Assign best matches greedily
	for (const entry of allScores) {
		const { csvIndex, csvHeader, scoring } = entry;

		// Skip if CSV column already assigned
		if (usedCsvColumns.has(csvIndex)) {
			continue;
		}

		// Skip if schema column already assigned
		if (usedSchemaColumns.has(scoring.schemaColumn)) {
			continue;
		}

		// Assign this mapping
		mappings[csvIndex] = {
			csvIndex,
			csvHeader,
			schemaColumn: scoring.schemaColumn,
			confidence: scoring.confidence,
			score: scoring.score,
		};

		usedCsvColumns.add(csvIndex);
		usedSchemaColumns.add(scoring.schemaColumn);
	}

	// Compute statistics
	const unmappedCsvColumns: number[] = [];
	const unmappedSchemaColumns: string[] = [];
	let autoMapped = 0;
	let needsReview = 0;
	let unmapped = 0;

	for (const mapping of mappings) {
		if (mapping.confidence === "none") {
			unmapped++;
			unmappedCsvColumns.push(mapping.csvIndex);
		} else if (mapping.confidence === "exact" || mapping.confidence === "alias") {
			autoMapped++;
		} else if (mapping.confidence === "fuzzy") {
			if (mapping.score >= autoAcceptThreshold) {
				autoMapped++;
			} else {
				needsReview++;
			}
		}
	}

	for (const schemaColumn of schemaColumnNames) {
		if (!usedSchemaColumns.has(schemaColumn)) {
			unmappedSchemaColumns.push(schemaColumn);
		}
	}

	return {
		mappings,
		unmappedCsvColumns,
		unmappedSchemaColumns,
		autoMapped,
		needsReview,
		unmapped,
	};
}

/**
 * Apply column mappings to reorder CSV data to match schema column order.
 *
 * @param data - CSV data as 2D string array (first row is headers if hasHeader=true)
 * @param mappings - Mapping matches from mapColumns
 * @param schema - The target schema
 * @param options - Optional configuration
 * @returns Reordered data matching schema column order
 */
export function applyMapping(
	data: string[][],
	mappings: MappingMatch[],
	schema: Schema,
	options?: { hasHeader?: boolean; keepUnmapped?: boolean }
): string[][] {
	// Handle empty data
	if (data.length === 0) {
		return [];
	}

	const hasHeader = options?.hasHeader ?? true;
	const schemaColumnNames = Object.keys(schema.columns);
	const columnCount = schemaColumnNames.length;

	// Build CSV index → schema index mapping
	const csvToSchemaIndex = new Map<number, number>();
	for (const mapping of mappings) {
		if (mapping.schemaColumn) {
			const schemaIndex = schemaColumnNames.indexOf(mapping.schemaColumn);
			if (schemaIndex !== -1) {
				csvToSchemaIndex.set(mapping.csvIndex, schemaIndex);
			}
		}
	}

	// Transform data
	const result: string[][] = [];
	const startRow = hasHeader ? 1 : 0;

	// Add header row with schema column names
	if (hasHeader) {
		result.push(schemaColumnNames);
	}

	// Transform each data row
	for (let i = startRow; i < data.length; i++) {
		const sourceRow = data[i];
		const targetRow = new Array<string>(columnCount).fill("");

		// Copy values to their new positions
		for (let csvIdx = 0; csvIdx < sourceRow.length; csvIdx++) {
			const schemaIdx = csvToSchemaIndex.get(csvIdx);
			if (schemaIdx !== undefined) {
				targetRow[schemaIdx] = sourceRow[csvIdx];
			}
		}

		result.push(targetRow);
	}

	return result;
}

/**
 * Convenience function that combines mapping and validation in one step.
 *
 * @param data - CSV data as 2D string array (first row should be headers)
 * @param schema - The target schema
 * @param options - Optional mapping and validation configuration
 * @returns Object containing mapping result, validation result, and mapped data
 */
export function mapAndValidate(
	data: string[][],
	schema: Schema,
	options?: MappingOptions & { maxErrors?: number }
): {
	mapping: MappingResult;
	validation: ValidationResult;
	mappedData: string[][];
} {
	if (data.length === 0) {
		return {
			mapping: {
				mappings: [],
				unmappedCsvColumns: [],
				unmappedSchemaColumns: Object.keys(schema.columns),
				autoMapped: 0,
				needsReview: 0,
				unmapped: 0,
			},
			validation: {
				valid: true,
				stats: {
					totalRows: 0,
					validRows: 0,
					errorRows: 0,
					errorsByRule: {},
					errorsByColumn: {},
				},
				errors: [],
				aborted: false,
			},
			mappedData: [],
		};
	}

	// Extract headers (first row)
	const headers = data[0];

	// Map columns
	const mapping = mapColumns(headers, schema, options);

	// Apply mapping to reorder data
	const mappedData = applyMapping(data, mapping.mappings, schema, { hasHeader: true });

	// Validate the mapped data (skip header row - validator expects data only)
	const dataRows = mappedData.slice(1);
	const validation = validate(dataRows, schema);

	return { mapping, validation, mappedData };
}

/**
 * Update a single mapping manually (for user corrections).
 *
 * @param mappings - Current mapping matches
 * @param csvIndex - Index of CSV column to update
 * @param schemaColumn - New schema column to map to (empty string to unmap)
 * @returns Updated mappings array
 */
export function updateMapping(
	mappings: MappingMatch[],
	csvIndex: number,
	schemaColumn: string
): MappingMatch[] {
	const updated = [...mappings];

	// Find and update the target mapping
	const targetIdx = updated.findIndex((m) => m.csvIndex === csvIndex);
	if (targetIdx === -1) {
		return updated;
	}

	// If assigning to a schema column that's already mapped, unmap the other one
	if (schemaColumn) {
		const existingIdx = updated.findIndex(
			(m) => m.schemaColumn === schemaColumn && m.csvIndex !== csvIndex
		);
		if (existingIdx !== -1) {
			updated[existingIdx] = {
				...updated[existingIdx],
				schemaColumn: "",
				confidence: "none",
				score: 0,
			};
		}
	}

	// Update the target mapping
	updated[targetIdx] = {
		...updated[targetIdx],
		schemaColumn,
		confidence: schemaColumn ? "exact" : "none", // User-set mappings are "exact"
		score: schemaColumn ? 1 : 0,
	};

	return updated;
}
