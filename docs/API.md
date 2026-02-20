# API Reference

## @elekcsv/core

### Parse

#### `parse(csv, options?)`

Parse a CSV string into rows and headers.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `csv` | `string` | — | CSV string to parse |
| `options.delimiter` | `string` | `","` | Field delimiter |
| `options.quote` | `string` | `'"'` | Quote character |
| `options.header` | `boolean` | `true` | Treat first row as header |
| `options.skipEmptyLines` | `boolean` | `false` | Skip rows where all fields are empty |

**Returns:** `ParseResult`

```typescript
interface ParseResult {
  headers: string[] | null;  // Header row (if header: true)
  rows: string[][];          // Data rows as string arrays
  rowCount: number;          // Total data rows
  fieldCount: number;        // Fields per row
}
```

**Example:**

```typescript
import { parse } from "@elekcsv/core";

const result = parse("name,age\nÖmer,25\nŞebnem,30", { header: true });
// result.headers = ["name", "age"]
// result.rows = [["Ömer", "25"], ["Şebnem", "30"]]
```

---

#### `compileParser(sample, options?)`

Compile a specialized parser from a CSV sample. Useful for parsing multiple CSVs with the same structure.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sample` | `string` | — | Sample CSV to analyze |
| `options` | `ParseOptions` | — | Same as `parse()` |

**Returns:** `CompiledParser`

```typescript
interface CompiledParser {
  fn: (input: string, startPos: number) => string[][];
  fieldCount: number;
  hasQuotes: boolean;
  lineEnding: string;
}
```

---

#### `clearParserCache()`

Clear the internal parser cache. Call after parsing CSVs with different structures.

---

### Validate

#### `validate(data, schema)`

Validate data against a schema. Returns all errors eagerly.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string[][]` | Data rows (no header) |
| `schema` | `Schema` | Validation schema |

**Returns:** `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  stats: ValidationStats;
  errors: ValidationError[];
  aborted: boolean;
}

interface ValidationStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errorsByRule: Record<string, number>;
  errorsByColumn: Record<string, number>;
}

interface ValidationError {
  row: number;
  col: number;
  field: string;
  value: string;
  code: ErrorCode;
  message?: string;
}
```

**Example:**

```typescript
import { validate } from "@elekcsv/core";

const result = validate(
  [["Ömer", "invalid-email"], ["", "test@example.com"]],
  {
    columns: {
      name: { type: "string", rules: [{ rule: "required" }] },
      email: { type: "string", rules: [{ rule: "email" }] },
    },
  }
);
// result.valid = false
// result.errors = [
//   { row: 0, col: 1, field: "email", value: "invalid-email", code: 10 },
//   { row: 1, col: 0, field: "name", value: "", code: 1 }
// ]
```

---

#### `validateBitmap(data, schema)`

Validate data with bitmap-based error tracking. More efficient for large datasets.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string[][]` | Data rows (no header) |
| `schema` | `Schema` | Validation schema |

**Returns:** `BitmapValidationResult`

```typescript
interface BitmapValidationResult {
  valid: boolean;
  bitmap: ErrorBitmap;
  errorCodes: ErrorCodeMap;
  errorCount: number;
  rowCount: number;
  colCount: number;
  aborted: boolean;

  // Lazy error accessors
  getErrors(options?: { limit?: number; offset?: number }): ValidationError[];
  getRowErrors(row: number): ValidationError[];
  getCellError(row: number, col: number): ValidationError | null;
  getErrorSummary(): Record<string, number>;
  getColumnErrorSummary(): Record<string, number>;
  getErrorRowCount(): number;
  getMemoryUsage(): { bitmap: number; codes: number; total: number };
}
```

---

#### `compileSchema(schema)`

Compile a schema into optimized validator functions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `Schema` | Schema to compile |

**Returns:** `CompiledSchemaValidator`

```typescript
interface CompiledSchemaValidator {
  columns: ColumnValidatorInfo[];
  columnNames: string[];
  columnCount: number;
  locale?: string;
}

interface ColumnValidatorInfo {
  fn: (value: string) => number;  // Returns 0 if valid, error code if invalid
  errorMap: Map<number, RuleMeta>;
  hasRequired: boolean;
  hasUnique: boolean;
  customFns: Array<{ fn: (v: string) => boolean; message?: string }>;
  locale?: string;
}
```

---

#### `compileColumn(columnDef, columnName, options?)`

Compile a single column definition.

| Parameter | Type | Description |
|-----------|------|-------------|
| `columnDef` | `ColumnDef` | Column definition |
| `columnName` | `string` | Column name |
| `options.defaultLocale` | `string` | Fallback locale |

**Returns:** `ColumnValidatorInfo`

---

#### `class CompiledValidator`

Pre-compiled validator for repeated use.

```typescript
import { CompiledValidator } from "@elekcsv/core";

const validator = new CompiledValidator(schema);

// Object-based result (legacy API)
const result = validator.validateAll(data);

// Bitmap-based result (recommended for large datasets)
const bitmapResult = validator.validateAllBitmap(data);

// Utilities
validator.getColumnNames();  // string[]
validator.getColumnCount();  // number
```

---

#### `class ErrorBitmap`

Compact bit array for tracking cell-level errors.

```typescript
const bitmap = new ErrorBitmap(rows, cols);

bitmap.setError(row, col);
bitmap.hasError(row, col);      // boolean
bitmap.hasRowError(row);        // boolean
bitmap.countErrors();           // number
bitmap.countErrorRows();        // number
bitmap.getColumnErrors(col);    // number[] (row indices)
bitmap.getRowErrorColumns(row); // number[] (col indices)
bitmap.forEachError((row, col) => { ... });
bitmap.byteSize;                // Memory usage in bytes
bitmap.clear();
```

---

#### `class ErrorCodeMap`

Stores error codes for each cell (Uint8Array).

```typescript
const codes = new ErrorCodeMap(rows, cols);

codes.setCode(row, col, errorCode);
codes.getCode(row, col);  // number (0 = no error)
codes.byteSize;           // Memory usage in bytes
codes.clear();
```

---

### Column Mapping

#### `mapColumns(csvHeaders, schema, options?)`

Map CSV headers to schema columns using 3-layer matching.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `csvHeaders` | `string[]` | — | Headers from CSV |
| `schema` | `Schema` | — | Target schema |
| `options.fuzzyThreshold` | `number` | `0.6` | Min similarity for fuzzy match |
| `options.autoAcceptThreshold` | `number` | `0.8` | Auto-accept above this |

**Returns:** `MappingResult`

```typescript
interface MappingResult {
  mappings: MappingMatch[];
  unmappedCsvColumns: number[];
  unmappedSchemaColumns: string[];
  autoMapped: number;
  needsReview: number;
  unmapped: number;
}

interface MappingMatch {
  csvIndex: number;
  csvHeader: string;
  schemaColumn: string;  // Empty if no match
  confidence: MappingConfidence;
  score: number;  // 0-1
}

type MappingConfidence = "exact" | "alias" | "fuzzy" | "none";
```

**Example:**

```typescript
import { mapColumns } from "@elekcsv/core";

const mapping = mapColumns(
  ["Ad Soyad", "E-posta", "Yas"],
  {
    columns: {
      name: { type: "string", aliases: ["ad", "ad soyad", "isim"] },
      email: { type: "string", aliases: ["e-posta", "mail"] },
      age: { type: "integer", aliases: ["yas"] },
    },
  }
);
// mapping.mappings[0] = { csvIndex: 0, csvHeader: "Ad Soyad", schemaColumn: "name", confidence: "alias", score: 1 }
```

---

#### `applyMapping(data, mappings, schema, options?)`

Reorder CSV data to match schema column order.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `string[][]` | — | CSV data (with or without header) |
| `mappings` | `MappingMatch[]` | — | Mappings from `mapColumns()` |
| `schema` | `Schema` | — | Target schema |
| `options.hasHeader` | `boolean` | `true` | First row is header |

**Returns:** `string[][]` — Data with columns reordered to match schema

---

#### `updateMapping(mappings, csvIndex, schemaColumn)`

Manually update a column mapping.

| Parameter | Type | Description |
|-----------|------|-------------|
| `mappings` | `MappingMatch[]` | Current mappings |
| `csvIndex` | `number` | CSV column index to update |
| `schemaColumn` | `string` | Schema column to map to (empty to unmap) |

**Returns:** `MappingMatch[]` — Updated mappings (new array)

---

#### `mapAndValidate(data, schema, options?)`

Convenience function combining mapping and validation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string[][]` | CSV data (first row = header) |
| `schema` | `Schema` | Target schema |
| `options` | `MappingOptions` | Mapping options |

**Returns:**

```typescript
{
  mapping: MappingResult;
  validation: ValidationResult;
  mappedData: string[][];
}
```

---

### Similarity Functions

These are exported for advanced use cases:

| Function | Description |
|----------|-------------|
| `levenshtein(a, b)` | Edit distance between strings |
| `levenshteinSimilarity(a, b)` | Normalized similarity (0-1) |
| `normalize(str)` | Normalize string for comparison |
| `tokenize(str)` | Split into tokens |
| `tokenSimilarity(a, b)` | Token-based similarity |
| `containsMatch(a, b)` | Check substring containment |
| `commonPrefixLength(a, b)` | Shared prefix length |
| `computeSimilarity(csvHeader, target)` | Composite similarity score |
| `computeBestMatch(csvHeader, columnName, aliases?)` | Best match with score |

---

### Web Worker

#### `createWorkerClient(options?)`

Create a client for off-main-thread CSV processing using Web Workers.

| Parameter | Type | Description |
|-----------|------|-------------|
| `options.worker` | `Worker` | Existing Worker instance |
| `options.workerUrl` | `string` | URL to worker script |

**Returns:** `CSVWorkerClient`

```typescript
import { createWorkerClient } from "@elekcsv/core";

const client = createWorkerClient({
  workerUrl: "/dist/worker.js"
});

// Parse CSV in worker
const parseResult = await client.parse(csvContent, {
  delimiter: ",",
  maxRows: 10000
});

// Validate in worker
const validationResult = await client.validate(data, schema);

// Parse and validate in one call
const result = await client.parseAndValidate(csvContent, schema);

// Clean up
client.terminate();
```

#### `CSVWorkerClient` Methods

| Method | Description |
|--------|-------------|
| `parse(content, options?)` | Parse CSV string |
| `validate(data, schema)` | Validate data array |
| `parseAndValidate(content, schema, options?)` | Parse then validate |
| `terminate()` | Stop worker and clean up |

---

### Locale

#### `registerLocale(config)`

Register a custom locale configuration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `LocaleConfig` | Locale configuration |

```typescript
interface LocaleConfig {
  id: string;
  dateFormats: string[];         // e.g., ["DD.MM.YYYY", "DD/MM/YYYY"]
  thousandsSeparator: string;    // e.g., "."
  decimalSeparator: string;      // e.g., ","
  currencySymbols: string[];     // e.g., ["₺", "TL"]
  currencyPosition: "prefix" | "suffix" | "both";
  phoneCountryCode: string;      // e.g., "+90"
  phonePatterns: RegExp[];
  phoneTotalDigits: number;
  trueValues: string[];          // e.g., ["evet", "doğru", "1"]
  falseValues: string[];         // e.g., ["hayır", "yanlış", "0"]
}
```

---

#### `getLocale(localeId)`

Get a locale configuration by ID. Falls back to `en`.

---

#### `hasLocale(localeId)`

Check if a locale is registered.

---

#### `getLocaleIds()`

Get all registered locale IDs.

---

#### Built-in Locales

| Export | ID |
|--------|-----|
| `trLocale` | `tr` |
| `enLocale` | `en`, `en-US` |
| `enGBLocale` | `en-GB` |
| `deLocale` | `de` |
| `frLocale` | `fr` |

---

### Locale Parsers

All parsers take `(value: string, localeId: string)` and return parsed value or null/NaN.

| Function | Returns | Description |
|----------|---------|-------------|
| `parseDate` | `ParsedDate \| null` | Parse date string |
| `validateDate` | `number` | 0 if valid, error code otherwise |
| `normalizeDateToISO` | `string \| null` | Convert to YYYY-MM-DD |
| `parseNumber` | `number` | Parse locale-formatted number |
| `validateNumber` | `number` | 0 if valid |
| `normalizeNumber` | `string \| null` | Convert to standard format |
| `parseCurrency` | `number` | Parse currency amount |
| `validateCurrency` | `number` | 0 if valid |
| `normalizeCurrency` | `string \| null` | Convert to plain number |
| `parsePhone` | `string` | Parse to E.164 format |
| `validatePhone` | `number` | 0 if valid |
| `normalizePhone` | `string \| null` | Normalize to E.164 |
| `parseBoolean` | `boolean \| null` | Parse locale boolean |
| `validateBoolean` | `number` | 0 if valid |
| `normalizeBoolean` | `string \| null` | Convert to "true"/"false" |

```typescript
interface ParsedDate {
  day: number;
  month: number;
  year: number;
}
```

---

### Types

#### `Schema`

```typescript
interface Schema {
  columns: Record<string, ColumnDef>;
  locale?: string;
}
```

#### `ColumnDef`

```typescript
interface ColumnDef {
  type: ColumnType;
  rules?: Rule[];
  locale?: string;
  aliases?: string[];
}
```

#### `ColumnType`

```typescript
type ColumnType =
  | "string"
  | "number"
  | "integer"
  | "date"
  | "boolean"
  | "enum"
  | "phone"
  | "currency";
```

#### `Rule`

```typescript
type Rule =
  | { rule: "required" }
  | { rule: "email" }
  | { rule: "unique" }
  | { rule: "min"; value: number }
  | { rule: "max"; value: number }
  | { rule: "minLength"; value: number }
  | { rule: "maxLength"; value: number }
  | { rule: "pattern"; value: RegExp }
  | { rule: "enum"; values: string[] }
  | { rule: "custom"; fn: (value: string) => boolean; message?: string };
```

#### `ERROR_CODES`

```typescript
const ERROR_CODES = {
  VALID: 0,
  REQUIRED: 1,
  TYPE: 2,
  MIN: 3,
  MAX: 4,
  PATTERN: 5,
  ENUM: 6,
  UNIQUE: 7,
  MIN_LENGTH: 8,
  MAX_LENGTH: 9,
  EMAIL: 10,
  CUSTOM: 11,
} as const;
```

---

## @elekcsv/react

### `useCSVImporter(options)`

React hook for CSV import with parsing, column mapping, and validation.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema` | `Schema` | — | **Required.** Validation schema |
| `autoMap` | `boolean` | `true` | Auto-proceed if all columns match |
| `autoMapThreshold` | `number` | `0.8` | Min confidence for auto-map |
| `maxPreviewRows` | `number` | `10` | Rows to include in preview |
| `maxRows` | `number` | — | Max rows to process |
| `locale` | `string` | — | Override schema locale |
| `onComplete` | `(result: ImportResult) => void` | — | Called on success |
| `onError` | `(error: string) => void` | — | Called on error |
| `onStepChange` | `(step: ImporterStep) => void` | — | Called on step change |
| `delimiter` | `string` | `","` | CSV field delimiter |
| `quote` | `string` | `'"'` | Quote character |
| `useWorker` | `boolean` | `false` | Use Web Worker for parsing/validation |

#### Return Value

```typescript
interface UseCSVImporterReturn {
  // State
  state: ImporterState;
  step: ImporterStep;

  // Computed
  isLoading: boolean;
  isComplete: boolean;
  hasErrors: boolean;
  canGoBack: boolean;
  canGoForward: boolean;

  // Actions
  loadFile: (file: File) => void;
  loadString: (content: string, fileName?: string) => void;
  updateMapping: (csvIndex: number, schemaColumn: string | null) => void;
  confirmMapping: () => void;
  accept: () => void;
  reset: () => void;
  goBack: () => void;
  cancel: () => void;  // Cancel current operation

  // Data accessors
  getErrors: (options?: { limit?: number; offset?: number }) => ValidationError[];
  getRowErrors: (row: number) => ValidationError[];
  getCellError: (row: number, col: number) => ValidationError | null;
  getErrorSummary: () => Record<string, number>;
}
```

---

#### State Machine

```
     ┌─────┐
     │idle │ ← reset()
     └──┬──┘
        │ loadFile() / loadString()
        ▼
   ┌────────┐
   │parsing │
   └───┬────┘
       │ success
       ▼
  ┌────────┐
  │mapping │ ← goBack() from review
  └───┬────┘
      │ confirmMapping() / autoMap
      ▼
 ┌──────────┐
 │validating│
 └────┬─────┘
      │ success
      ▼
  ┌───────┐
  │review │ ← goBack() from complete
  └───┬───┘
      │ accept()
      ▼
 ┌────────┐
 │complete│
 └────────┘
```

---

#### `ImporterState`

```typescript
interface ImporterState {
  step: ImporterStep;

  // Parse results
  rawData: string[][] | null;
  headers: string[] | null;
  preview: string[][] | null;
  rowCount: number;

  // Mapping results
  mapping: MappingResult | null;
  mappedData: string[][] | null;

  // Validation results
  validation: ValidationResult | null;
  bitmapValidation: BitmapValidationResult | null;

  // File metadata
  file: File | null;
  fileName: string | null;
  fileSize: number | null;

  // Performance
  parseTime: number | null;
  validationTime: number | null;
  progress: number;

  // Error
  error: string | null;
}

type ImporterStep =
  | "idle"
  | "parsing"
  | "mapping"
  | "validating"
  | "review"
  | "complete"
  | "error";
```

---

#### `ImportResult`

```typescript
interface ImportResult {
  data: string[][];
  headers: string[];
  mapping: MappingResult;
  validation: ValidationResult | BitmapValidationResult;
  stats: ImportStats;
}

interface ImportStats {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errorCount: number;
  parseTime: number;
  validationTime: number;
}
```

---

### State Machine Utilities

```typescript
import {
  importerReducer,
  createInitialState,
  isValidTransition,
  canGoBack,
  canGoForward,
  getBackSteps,
} from "@elekcsv/react";

// Create fresh state
const state = createInitialState();

// Check valid transitions
isValidTransition("mapping", "validating");  // true
isValidTransition("idle", "complete");        // false

// Navigation helpers
canGoBack("review");     // true (→ mapping)
canGoForward("mapping"); // true (→ validating)
getBackSteps("review");  // ["mapping"]
```
