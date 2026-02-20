import { Injectable, computed, effect, signal } from "@angular/core";
import {
	type BitmapValidationResult,
	type ValidationError,
	type ValidationResult,
	applyMapping,
	buildImportResult,
	mapColumns,
	parse,
	shouldAutoMap,
	validate,
	validateBitmap,
} from "@elekcsv/core";

import {
	canGoBack as checkCanGoBack,
	canGoForward as checkCanGoForward,
	createInitialState,
	importerReducer,
} from "./state-machine";
import type {
	CSVImporterReturn,
	ImporterState,
	ImporterStep,
	UseCSVImporterOptions,
} from "./types";

const BITMAP_THRESHOLD = 10_000;

@Injectable()
export class CSVImporterService {
	private state = signal<ImporterState>(createInitialState());
	private prevStep: ImporterStep = "idle";
	private effectiveSchema: import("@elekcsv/core").Schema;
	private autoMap: boolean;
	private autoMapThreshold: number;
	private maxPreviewRows: number;
	private maxRows?: number;
	private onComplete?: UseCSVImporterOptions["onComplete"];
	private onError?: (error: string) => void;
	private onStepChange?: (step: ImporterStep) => void;
	private delimiter?: string;
	private quote?: string;

	step = computed(() => this.state().step);
	isLoading = computed(() => {
		const s = this.state();
		return s.step === "parsing" || s.step === "validating";
	});
	isComplete = computed(() => this.state().step === "complete");
	hasErrors = computed(() => {
		const s = this.state();
		if (s.bitmapValidation) return s.bitmapValidation.errorCount > 0;
		if (s.validation) return s.validation.errors.length > 0;
		return false;
	});
	canGoBack = computed(() => checkCanGoBack(this.state().step));
	canGoForward = computed(() => checkCanGoForward(this.state().step));

	constructor(options: UseCSVImporterOptions) {
		this.effectiveSchema = options.locale
			? { ...options.schema, locale: options.locale }
			: options.schema;
		this.autoMap = options.autoMap ?? true;
		this.autoMapThreshold = options.autoMapThreshold ?? 0.8;
		this.maxPreviewRows = options.maxPreviewRows ?? 10;
		this.maxRows = options.maxRows;
		this.onComplete = options.onComplete;
		this.onError = options.onError;
		this.onStepChange = options.onStepChange;
		this.delimiter = options.delimiter;
		this.quote = options.quote;

		effect(() => {
			const s = this.state();
			if (this.prevStep !== s.step) {
				this.prevStep = s.step;
				this.onStepChange?.(s.step);
			}
			if (s.step === "error" && s.error) this.onError?.(s.error);
			if (s.step === "complete" && this.onComplete) {
				const result = buildImportResult(
					{
						mappedData: s.mappedData,
						mapping: s.mapping,
						validation: s.validation,
						bitmapValidation: s.bitmapValidation,
						rowCount: s.rowCount,
						parseTime: s.parseTime,
						validationTime: s.validationTime,
					},
					this.effectiveSchema
				);
				if (result) this.onComplete(result);
			}
		});
	}

	private dispatch(action: import("./types").ImporterAction) {
		this.state.update((s) => importerReducer(s, action));
	}

	private processContent(content: string) {
		try {
			const startTime = performance.now();
			const parseResult = parse(content, {
				delimiter: this.delimiter,
				quote: this.quote,
				header: true,
			});
			const parseTime = performance.now() - startTime;
			const headers = parseResult.headers ?? [];
			let data = parseResult.rows;
			if (this.maxRows && data.length > this.maxRows) data = data.slice(0, this.maxRows);

			this.dispatch({
				type: "PARSE_COMPLETE",
				data,
				headers,
				time: parseTime,
				previewRows: this.maxPreviewRows,
			});

			const mappingResult = mapColumns(headers, this.effectiveSchema, {
				fuzzyThreshold: 0.6,
				autoAcceptThreshold: this.autoMapThreshold,
			});
			this.dispatch({ type: "SET_MAPPING", mapping: mappingResult });

			if (this.autoMap && shouldAutoMap(mappingResult, this.autoMapThreshold)) {
				const mappedData = applyMapping(data, mappingResult.mappings, this.effectiveSchema, {
					hasHeader: false,
				});
				this.dispatch({ type: "SKIP_MAPPING", mapping: mappingResult, mappedData });
				this.runValidation(mappedData);
			}
		} catch (err) {
			this.dispatch({
				type: "PARSE_ERROR",
				error: err instanceof Error ? err.message : "Unknown parse error",
			});
		}
	}

	loadFile(file: File): void {
		this.dispatch({ type: "LOAD_FILE", file });
		const reader = new FileReader();
		reader.onload = (e: ProgressEvent<FileReader>) => {
			const content = e.target?.result as string;
			if (content) this.processContent(content);
			else this.dispatch({ type: "PARSE_ERROR", error: "Failed to read file content" });
		};
		reader.onerror = () => this.dispatch({ type: "PARSE_ERROR", error: "Failed to read file" });
		reader.readAsText(file);
	}

	loadString(content: string, fileName?: string): void {
		this.dispatch({ type: "LOAD_STRING", content, fileName });
		this.processContent(content);
	}

	updateMapping(csvIndex: number, schemaColumn: string | null): void {
		this.dispatch({ type: "UPDATE_MAPPING", csvIndex, schemaColumn });
	}

	confirmMapping(): void {
		const s = this.state();
		if (!s.rawData || !s.mapping) return;
		try {
			const mappedData = applyMapping(s.rawData, s.mapping.mappings, this.effectiveSchema, {
				hasHeader: false,
			});
			this.dispatch({ type: "CONFIRM_MAPPING", mappedData });
			this.runValidation(mappedData);
		} catch (err) {
			this.dispatch({
				type: "VALIDATE_ERROR",
				error: err instanceof Error ? err.message : "Failed to apply mapping",
			});
		}
	}

	private runValidation(data: string[][]): void {
		try {
			const startTime = performance.now();
			const useBitmap = data.length > BITMAP_THRESHOLD;
			const result: ValidationResult | BitmapValidationResult = useBitmap
				? validateBitmap(data, this.effectiveSchema)
				: validate(data, this.effectiveSchema);
			const validationTime = performance.now() - startTime;
			this.dispatch({
				type: "VALIDATE_COMPLETE",
				result,
				time: validationTime,
				isBitmap: useBitmap,
			});
		} catch (err) {
			this.dispatch({
				type: "VALIDATE_ERROR",
				error: err instanceof Error ? err.message : "Validation failed",
			});
		}
	}

	accept(): void {
		if (this.state().step === "review") this.dispatch({ type: "ACCEPT" });
	}

	reset(): void {
		this.dispatch({ type: "RESET" });
	}

	goBack(): void {
		this.dispatch({ type: "GO_BACK" });
	}

	getErrors(options?: { limit?: number; offset?: number }): ValidationError[] {
		const s = this.state();
		if (s.bitmapValidation) return s.bitmapValidation.getErrors(options);
		if (s.validation) {
			const { limit = 100, offset = 0 } = options ?? {};
			return s.validation.errors.slice(offset, offset + limit);
		}
		return [];
	}

	getRowErrors(row: number): ValidationError[] {
		const s = this.state();
		if (s.bitmapValidation) return s.bitmapValidation.getRowErrors(row);
		if (s.validation) return s.validation.errors.filter((e) => e.row === row);
		return [];
	}

	getCellError(row: number, col: number): ValidationError | null {
		const s = this.state();
		if (s.bitmapValidation) return s.bitmapValidation.getCellError(row, col);
		if (s.validation)
			return s.validation.errors.find((e) => e.row === row && e.col === col) ?? null;
		return null;
	}

	getErrorSummary(): Record<string, number> {
		const s = this.state();
		if (s.bitmapValidation) return s.bitmapValidation.getErrorSummary();
		if (s.validation) return s.validation.stats.errorsByRule;
		return {};
	}

	get currentState(): ImporterState {
		return this.state();
	}
}
