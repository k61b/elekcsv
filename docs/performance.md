# Performance

elek is designed for high-performance CSV processing. It uses code generation, compiled validators, and bitmap-based error tracking to achieve excellent throughput even with large datasets.

## Benchmark Results

Tested on 100,000 rows x 8 columns:

| Operation | Time | Throughput | Notes |
|-----------|------|------------|-------|
| Parse | ~37ms | 2.7M rows/sec | Code-generated parser |
| Validate (compiled) | ~30ms | 3.3M rows/sec | No locale, 5 rules/column |
| Validate (with locale) | ~72ms | 1.4M rows/sec | Turkish date/number parsing |
| Full pipeline | ~76ms | 1.3M rows/sec | Parse + map + validate |
| Column mapping | ~2ms | 50M cols/sec | 8 columns, fuzzy matching |

## Memory Usage

### Standard Validation

With standard `validate()`, memory grows with error count:

| Scenario | Memory |
|----------|--------|
| No errors | ~1KB (result object) |
| 1% error rate | ~8MB (100K * 0.01 * 8 cols * 100 bytes/error) |
| 10% error rate | ~80MB |

### Bitmap Validation

With `validateBitmap()`, memory is fixed regardless of error count:

| Dataset Size | Bitmap | Codes | Total |
|--------------|--------|-------|-------|
| 10K x 8 | 10KB | 80KB | ~90KB |
| 100K x 8 | 100KB | 800KB | ~900KB |
| 1M x 8 | 1MB | 8MB | ~9MB |

Formula: `rows * cols * 1.125 bytes`

## Compiled Validators

Schema compilation generates optimized JavaScript functions:

```typescript
// Before compilation (conceptual)
function validateCell(value, rules) {
  for (const rule of rules) {  // Loop overhead
    if (rule.type === "required" && value === "") return error;
    if (rule.type === "email" && !emailRegex.test(value)) return error;
    // ...
  }
}

// After compilation (generated)
function validateName(v) {
  if (v === '') return 1;  // Inlined, no loop
  return 0;
}

function validateEmail(v) {
  if (v === '') return 1;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 10;
  return 0;
}
```

## Performance Tips

### 1. Use Bitmap Validation for Large Files

```typescript
import { validateBitmap } from "@elekcsv/core";

// Switch to bitmap for 10K+ rows
const result = data.length > 10000
  ? validateBitmap(data, schema)
  : validate(data, schema);
```

### 2. Reuse Compiled Validators

```typescript
import { CompiledValidator } from "@elekcsv/core";

// Compile once
const validator = new CompiledValidator(schema);

// Reuse for multiple files
const result1 = validator.validateAllBitmap(data1);
const result2 = validator.validateAllBitmap(data2);
```

### 3. Skip Locale When Not Needed

```typescript
// Slower: locale parsing on every cell
const schema1 = {
  locale: "tr",
  columns: {
    name: { type: "string" },  // Still uses Turkish comparison
  },
};

// Faster: no locale
const schema2 = {
  columns: {
    name: { type: "string" },  // No locale overhead
  },
};
```

### 4. Use Specific Column Types

```typescript
// "string" is fastest - no validation
{ type: "string" }

// "integer" is fast - simple regex
{ type: "integer" }

// "date" with locale is slower - format parsing
{ type: "date", locale: "tr" }
```

### 5. Limit Error Pagination

```typescript
const result = validateBitmap(data, schema);

// Don't: Materialize all errors at once
const allErrors = result.getErrors({ limit: Infinity });

// Do: Paginate as needed
const page1 = result.getErrors({ limit: 50, offset: 0 });
const page2 = result.getErrors({ limit: 50, offset: 50 });
```

### 6. Use Preview for Large Files

```typescript
// Validate a preview first
const preview = data.slice(0, 100);
const previewResult = validate(preview, schema);

if (previewResult.errors.length > 0) {
  // Show preview errors before processing full file
  showErrors(previewResult.errors);
  return;
}

// Process full file
const fullResult = validateBitmap(data, schema);
```

## Parser Performance

The parser uses code generation for each CSV structure:

```typescript
// First parse: compiles parser (~1ms)
const result1 = parse(csv1);

// Subsequent parses with same column count: cached (~0.1ms)
const result2 = parse(csv2);  // Reuses compiled parser
```

### Parser Cache

```typescript
import { clearParserCache } from "@elekcsv/core";

// Clear when parsing many different CSV structures
// to prevent memory accumulation
clearParserCache();
```

## Profiling Your Pipeline

```typescript
import { parse, mapColumns, applyMapping, validateBitmap } from "@elekcsv/core";

async function profilePipeline(csv: string) {
  const t0 = performance.now();

  const { headers, rows } = parse(csv, { header: true });
  const t1 = performance.now();
  console.log(`Parse: ${(t1 - t0).toFixed(2)}ms`);

  const mapping = mapColumns(headers!, schema);
  const t2 = performance.now();
  console.log(`Map: ${(t2 - t1).toFixed(2)}ms`);

  const mapped = applyMapping([headers!, ...rows], mapping.mappings, schema);
  const t3 = performance.now();
  console.log(`Apply: ${(t3 - t2).toFixed(2)}ms`);

  const result = validateBitmap(mapped.slice(1), schema);
  const t4 = performance.now();
  console.log(`Validate: ${(t4 - t3).toFixed(2)}ms`);

  console.log(`Total: ${(t4 - t0).toFixed(2)}ms`);
  console.log(`Rows: ${rows.length}`);
  console.log(`Throughput: ${(rows.length / (t4 - t0) * 1000).toFixed(0)} rows/sec`);

  return result;
}
```

## Comparison with Alternatives

| Library | Parse 100K | Validate | Column Mapping | Locale |
|---------|-----------|----------|----------------|--------|
| elek | 37ms | 30ms | Built-in | Built-in |
| PapaParse | 45ms | N/A | N/A | N/A |
| uDSV | 25ms | N/A | N/A | N/A |
| csv-parse | 120ms | N/A | N/A | N/A |

*elek is the only library that provides validation, column mapping, and locale support out of the box.*
