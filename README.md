# elek

High-performance, headless, locale-aware CSV import toolkit for JavaScript and TypeScript.

[![npm version](https://img.shields.io/npm/v/@elekcsv/core.svg)](https://www.npmjs.com/package/@elekcsv/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**elek** is a complete CSV import solution: parse, validate, and map CSV data with compiled validators, fuzzy column matching, and full locale support. Use it standalone or with the headless React hook.

## Why elek?

- **Parse + Validate + Map** — Complete import pipeline, not just parsing
- **Headless** — Zero UI lock-in. Build any interface you want
- **Locale-aware** — Turkish dates (`25.01.2025`), European numbers (`1.234,56`), localized booleans (`evet/hayır`)
- **Compiled validators** — Schema compiles to optimized JS functions at runtime
- **Bitmap error tracking** — O(1) cell lookups, lazy materialization, minimal memory
- **Column mapping** — 3-layer matching (exact, alias, fuzzy) with confidence scores

## Install

```bash
# Core engine
npm install @elekcsv/core

# React hook (optional)
npm install @elekcsv/react
```

## Quick Start: Core

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

const csv = `ad,email,dogum_tarihi,maas
Ömer,omer@test.com,25.01.1990,"1.234,56 ₺"
Şebnem,sebnem@test.com,03.05.1985,"2.500,00 ₺"`;

// 1. Parse CSV
const { rows, headers } = parse(csv, { header: true });

// 2. Define schema
const schema = {
  locale: "tr",
  columns: {
    name: { type: "string", rules: [{ rule: "required" }], aliases: ["ad", "isim"] },
    email: { type: "string", rules: [{ rule: "email" }] },
    birthDate: { type: "date", aliases: ["dogum_tarihi"] },
    salary: { type: "currency", aliases: ["maas"] },
  },
};

// 3. Map columns
const mapping = mapColumns(headers, schema);

// 4. Apply mapping (reorder columns to match schema)
const mappedData = applyMapping([headers, ...rows], mapping.mappings, schema);

// 5. Validate
const result = validate(mappedData.slice(1), schema);
console.log(result.valid); // true
```

## Quick Start: React Hook

```tsx
import { useCSVImporter } from "@elekcsv/react";

function CSVImporter() {
  const {
    step,
    state,
    loadFile,
    confirmMapping,
    accept,
    reset,
    getErrors,
  } = useCSVImporter({
    schema: {
      locale: "tr",
      columns: {
        name: { type: "string", rules: [{ rule: "required" }] },
        email: { type: "string", rules: [{ rule: "email" }] },
      },
    },
    onComplete: (result) => console.log("Imported:", result.data),
  });

  if (step === "idle") {
    return (
      <input
        type="file"
        accept=".csv"
        onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
      />
    );
  }

  if (step === "mapping") {
    return (
      <div>
        <p>Mapped {state.mapping?.autoMapped} columns automatically</p>
        <button onClick={confirmMapping}>Confirm Mapping</button>
      </div>
    );
  }

  if (step === "review") {
    const errors = getErrors({ limit: 10 });
    return (
      <div>
        <p>{state.rowCount} rows, {errors.length} errors</p>
        <button onClick={accept}>Accept</button>
      </div>
    );
  }

  if (step === "complete") {
    return <button onClick={reset}>Import Another</button>;
  }

  return <p>Loading...</p>;
}
```

## Schema

```typescript
interface Schema {
  columns: Record<string, ColumnDef>;
  locale?: string; // Default locale for all columns
}

interface ColumnDef {
  type: ColumnType;
  rules?: Rule[];
  locale?: string;   // Override schema locale
  aliases?: string[]; // Alternative header names
}

type ColumnType = "string" | "number" | "integer" | "date" | "boolean" | "enum" | "phone" | "currency";
```

### Rules

| Rule | Parameters | Description |
|------|------------|-------------|
| `required` | — | Value must not be empty |
| `email` | — | Valid email format |
| `unique` | — | No duplicates in column |
| `min` | `value: number` | Minimum numeric value |
| `max` | `value: number` | Maximum numeric value |
| `minLength` | `value: number` | Minimum string length |
| `maxLength` | `value: number` | Maximum string length |
| `pattern` | `value: RegExp` | Must match regex |
| `enum` | `values: string[]` | Must be one of values |
| `custom` | `fn: (v) => boolean` | Custom validation function |

## Locale Support

| Locale | Date Format | Number | Currency | Boolean |
|--------|-------------|--------|----------|---------|
| `tr` | DD.MM.YYYY | 1.234,56 | ₺, TL | evet/hayır |
| `en` | MM/DD/YYYY | 1,234.56 | $, USD | yes/no |
| `en-GB` | DD/MM/YYYY | 1,234.56 | £, GBP | yes/no |
| `de` | DD.MM.YYYY | 1.234,56 | €, EUR | ja/nein |
| `fr` | DD/MM/YYYY | 1 234,56 | €, EUR | oui/non |

```typescript
import { registerLocale } from "@elekcsv/core";

registerLocale({
  id: "custom",
  dateFormats: ["DD-MM-YYYY"],
  thousandsSeparator: " ",
  decimalSeparator: ",",
  currencySymbols: ["kr"],
  currencyPosition: "suffix",
  phoneCountryCode: "+46",
  phonePatterns: [/^\+46\d{9}$/],
  phoneTotalDigits: 12,
  trueValues: ["ja", "yes", "1"],
  falseValues: ["nej", "no", "0"],
});
```

## Performance

Benchmarks on 100K rows x 8 columns:

| Operation | Time | Throughput |
|-----------|------|------------|
| Parse | ~37ms | 2.7M rows/sec |
| Validate (compiled) | ~30ms | 3.3M rows/sec |
| Validate (with locale) | ~72ms | 1.4M rows/sec |
| Full pipeline | ~76ms | 1.3M rows/sec |

## Compiled Validators

Schema compiles to optimized JavaScript functions:

```typescript
import { compileSchema } from "@elekcsv/core";

const compiled = compileSchema(schema);
// Generates functions like:
// function(v) {
//   if (v === '') return 1; // required
//   if (!/^\d+$/.test(v)) return 2; // type
//   return 0;
// }
```

Use `CompiledValidator` for repeated validation:

```typescript
import { CompiledValidator } from "@elekcsv/core";

const validator = new CompiledValidator(schema);
const result1 = validator.validateAll(data1);
const result2 = validator.validateAll(data2); // Reuses compiled functions
```

## Bitmap Error Tracking

For large datasets, use bitmap-based validation:

```typescript
import { validateBitmap } from "@elekcsv/core";

const result = validateBitmap(data, schema);

// O(1) cell lookup
result.bitmap.hasError(row, col);

// Lazy error materialization
const first100 = result.getErrors({ limit: 100, offset: 0 });
const rowErrors = result.getRowErrors(42);
const cellError = result.getCellError(42, 3);

// Memory usage
const { bitmap, codes, total } = result.getMemoryUsage();
// 100K rows x 8 cols = ~100KB bitmap + ~800KB codes
```

## Column Mapping

3-layer matching strategy:

1. **Exact match** — Case-insensitive column name match
2. **Alias match** — Match against `aliases` array in schema
3. **Fuzzy match** — Levenshtein similarity scoring

```typescript
import { mapColumns, applyMapping, updateMapping } from "@elekcsv/core";

const mapping = mapColumns(headers, schema, {
  fuzzyThreshold: 0.6,      // Minimum similarity for fuzzy match
  autoAcceptThreshold: 0.8, // Auto-accept above this score
});

// Mapping result
mapping.mappings;            // MappingMatch[] for each CSV column
mapping.autoMapped;          // Count of high-confidence matches
mapping.needsReview;         // Count of fuzzy matches needing review
mapping.unmappedCsvColumns;  // Indices of unmatched CSV columns
mapping.unmappedSchemaColumns; // Names of unmatched schema columns

// Manual correction
const updated = updateMapping(mapping.mappings, csvIndex, "schemaColumn");

// Apply to data
const reordered = applyMapping(data, mapping.mappings, schema);
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [CSV Parsing](./docs/parsing.md)
- [Validation](./docs/validation.md)
- [Bitmap Validation (Large Files)](./docs/validation-bitmap.md)
- [Compiled Validators](./docs/compiled-validation.md)
- [Column Mapping](./docs/column-mapping.md)
- [Locale Support](./docs/locale-support.md)
- [React Hook](./docs/react-hook.md)
- [Full Pipeline](./docs/pipeline.md)
- [Performance](./docs/performance.md)
- [Migration from PapaParse](./docs/migration-from-papaparse.md)
- [Examples](./docs/examples.md)
- [API Reference](./docs/API.md)

## Comparison

| Feature | elek | PapaParse | csv-parse |
|---------|------|-----------|-----------|
| CSV Parsing | Yes | Yes | Yes |
| Schema Validation | Yes | No | No |
| Column Mapping | Yes | No | No |
| Fuzzy Matching | Yes | No | No |
| Locale Support | Yes | No | No |
| Turkish Dates | Yes | No | No |
| European Numbers | Yes | No | No |
| Bitmap Errors | Yes | No | No |
| React Hook | Yes | No | No |
| Headless | Yes | Yes | Yes |
| TypeScript | Yes | Types | Yes |

## License

Apache-2.0
