# Bitmap Validation (Large Datasets)

For datasets with 10,000+ rows, elek provides bitmap-based validation that uses significantly less memory and supports lazy error materialization. Instead of creating error objects upfront, it tracks errors in compact bit arrays.

## When to Use Bitmap Validation

| Dataset Size | Recommendation |
|--------------|----------------|
| < 10K rows | Use `validate()` - simpler API |
| 10K - 100K rows | Use `validateBitmap()` - better memory |
| > 100K rows | Use `validateBitmap()` - essential for performance |

The React hook (`useCSVImporter`) automatically switches to bitmap validation for datasets over 10,000 rows.

## Basic Usage

```typescript
import { validateBitmap } from "@elekcsv/core";

const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer" },
  },
};

// Assume 'data' is a large dataset with 100K rows
const result = validateBitmap(data, schema);

// Quick checks - O(1)
console.log(result.valid);      // false
console.log(result.errorCount); // 1523

// Lazy error access - only materializes what you need
const first100Errors = result.getErrors({ limit: 100 });
const row42Errors = result.getRowErrors(42);
const cellError = result.getCellError(42, 1);
```

## BitmapValidationResult Interface

```typescript
interface BitmapValidationResult {
  // Quick access properties
  valid: boolean;           // true if errorCount === 0
  errorCount: number;       // Total error count
  rowCount: number;         // Total rows validated
  colCount: number;         // Number of columns
  aborted: boolean;         // true if validation stopped early

  // Internal structures (for advanced use)
  bitmap: ErrorBitmap;      // Bit array tracking which cells have errors
  errorCodes: ErrorCodeMap; // Error codes for each cell

  // Lazy error accessors
  getErrors(options?: { limit?: number; offset?: number }): ValidationError[];
  getRowErrors(row: number): ValidationError[];
  getCellError(row: number, col: number): ValidationError | null;
  getErrorSummary(): Record<string, number>;     // Errors by rule name
  getColumnErrorSummary(): Record<string, number>; // Errors by column name
  getErrorRowCount(): number;  // Number of rows with at least one error
  getMemoryUsage(): { bitmap: number; codes: number; total: number };
}
```

## Memory Comparison

For 100K rows with 8 columns:

| Approach | Memory Usage |
|----------|--------------|
| `validate()` - all errors | ~50MB (worst case with many errors) |
| `validateBitmap()` | ~900KB fixed |

Bitmap memory formula:
- ErrorBitmap: `rows * cols / 8` bytes
- ErrorCodeMap: `rows * cols` bytes
- Total: approximately `rows * cols * 1.125` bytes

## How Bitmap Works

```
ErrorBitmap (1 bit per cell):
Row 0: [0][1][0][0][0][0][0][0]  <- Error in column 1
Row 1: [0][0][0][0][0][0][0][0]  <- No errors
Row 2: [1][0][1][0][0][0][0][0]  <- Errors in columns 0 and 2
...

ErrorCodeMap (1 byte per cell):
Row 0: [0][10][0][0][0][0][0][0]  <- Code 10 = EMAIL error
Row 1: [0][ 0][0][0][0][0][0][0]
Row 2: [1][ 0][2][0][0][0][0][0]  <- Code 1 = REQUIRED, Code 2 = TYPE
...
```

## Pagination with getErrors()

```typescript
const result = validateBitmap(data, schema);

// Get errors in batches for UI display
const page1 = result.getErrors({ limit: 50, offset: 0 });
const page2 = result.getErrors({ limit: 50, offset: 50 });
const page3 = result.getErrors({ limit: 50, offset: 100 });

// Display in a virtual list
function renderErrorPage(pageNumber: number) {
  const errors = result.getErrors({
    limit: 50,
    offset: (pageNumber - 1) * 50,
  });
  return errors.map(e => `Row ${e.row}: ${e.field} - ${e.message}`);
}
```

## Cell-Level Queries

```typescript
const result = validateBitmap(data, schema);

// Check specific cell - O(1)
if (result.bitmap.hasError(42, 1)) {
  const error = result.getCellError(42, 1);
  console.log(error?.message); // "Invalid email format"
}

// Check if row has any errors - O(columns)
if (result.bitmap.hasRowError(42)) {
  const rowErrors = result.getRowErrors(42);
  console.log(`Row 42 has ${rowErrors.length} errors`);
}

// Get all error columns for a row
const errorCols = result.bitmap.getRowErrorColumns(42);
// [1, 3] - columns 1 and 3 have errors
```

## Using ErrorBitmap Directly

For advanced use cases, you can work with the bitmap directly:

```typescript
const result = validateBitmap(data, schema);
const { bitmap, errorCodes } = result;

// Iterate all errors efficiently
bitmap.forEachError((row, col) => {
  const code = errorCodes.getCode(row, col);
  console.log(`Error at (${row}, ${col}): code ${code}`);
});

// Count errors in a specific column
const col1Errors = bitmap.getColumnErrors(1);
console.log(`Column 1 has ${col1Errors.length} errors`);

// Get memory usage
console.log(`Bitmap: ${bitmap.byteSize} bytes`);
console.log(`Codes: ${errorCodes.byteSize} bytes`);
```

## CompiledValidator for Repeated Use

If you're validating multiple datasets with the same schema, use `CompiledValidator`:

```typescript
import { CompiledValidator } from "@elekcsv/core";

const validator = new CompiledValidator(schema);

// Validate multiple datasets efficiently
const result1 = validator.validateAllBitmap(data1);
const result2 = validator.validateAllBitmap(data2);
const result3 = validator.validateAllBitmap(data3);

// Schema is compiled only once, reused for all validations
```

## Example: Processing Large CSV

```typescript
import { parse, mapColumns, applyMapping, validateBitmap } from "@elekcsv/core";

async function processLargeCSV(csvContent: string) {
  // 1. Parse
  const { headers, rows } = parse(csvContent);
  console.log(`Parsed ${rows.length} rows`);

  // 2. Define schema
  const schema = {
    locale: "tr",
    columns: {
      name: { type: "string", rules: [{ rule: "required" }] },
      email: { type: "string", rules: [{ rule: "email" }] },
      salary: { type: "currency" },
      birthDate: { type: "date" },
    },
  };

  // 3. Map columns
  const mapping = mapColumns(headers!, schema);
  const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

  // 4. Validate with bitmap (recommended for large files)
  const result = validateBitmap(mappedData.slice(1), schema);

  // 5. Report
  console.log(`Valid: ${result.valid}`);
  console.log(`Error count: ${result.errorCount}`);
  console.log(`Rows with errors: ${result.getErrorRowCount()}`);
  console.log(`Memory: ${result.getMemoryUsage().total} bytes`);

  // 6. Show error summary
  const summary = result.getErrorSummary();
  console.log("Errors by rule:", summary);
  // { required: 50, email: 23, type: 12 }

  // 7. Get first 10 errors for preview
  const preview = result.getErrors({ limit: 10 });
  preview.forEach(e => {
    console.log(`Row ${e.row}, ${e.field}: ${e.message}`);
  });

  return result;
}
```
