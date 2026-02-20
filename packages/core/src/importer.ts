import type { MappingResult } from "./mapper";
import type { Schema } from "./types";
import type { BitmapValidationResult, ValidationResult } from "./validator";

export interface ImportStats {
	totalRows: number;
	validRows: number;
	invalidRows: number;
	errorCount: number;
	parseTime: number;
	validationTime: number;
}

export interface ImportResult {
	data: string[][];
	headers: string[];
	mapping: MappingResult;
	validation: ValidationResult | BitmapValidationResult;
	stats: ImportStats;
}

export interface ImporterStateData {
	mappedData: string[][] | null;
	mapping: MappingResult | null;
	validation: ValidationResult | null;
	bitmapValidation: BitmapValidationResult | null;
	rowCount: number;
	parseTime: number | null;
	validationTime: number | null;
}

export function buildImportResult(state: ImporterStateData, schema: Schema): ImportResult | null {
	if (!state.mappedData || !state.mapping) {
		return null;
	}

	const validation = state.validation ?? state.bitmapValidation;
	if (!validation) {
		return null;
	}

	const schemaColumns = Object.keys(schema.columns);
	const errorCount = state.bitmapValidation
		? state.bitmapValidation.errorCount
		: (state.validation?.errors.length ?? 0);

	const errorRowCount = state.bitmapValidation
		? state.bitmapValidation.getErrorRowCount()
		: new Set(state.validation?.errors.map((e) => e.row)).size;

	const stats: ImportStats = {
		totalRows: state.rowCount,
		validRows: state.rowCount - errorRowCount,
		invalidRows: errorRowCount,
		errorCount,
		parseTime: state.parseTime ?? 0,
		validationTime: state.validationTime ?? 0,
	};

	return {
		data: state.mappedData,
		headers: schemaColumns,
		mapping: state.mapping,
		validation,
		stats,
	};
}

export function shouldAutoMap(result: MappingResult, threshold: number): boolean {
	if (result.unmappedSchemaColumns.length > 0) {
		return false;
	}

	for (const mapping of result.mappings) {
		if (mapping.schemaColumn === "") {
			continue;
		}

		if (mapping.confidence === "exact" || mapping.confidence === "alias") {
			continue;
		}

		if (mapping.confidence === "fuzzy" && mapping.score >= threshold) {
			continue;
		}

		return false;
	}

	return true;
}
