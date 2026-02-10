# Full Pipeline

elek provides a complete CSV import pipeline: parse, map columns, validate. You can run each step individually or use the convenience function `mapAndValidate()` for a streamlined workflow.

## Step-by-Step Pipeline

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

// 1. Parse CSV
const csv = `name,email,age
Omer,omer@test.com,25
Sebnem,invalid-email,30`;

const { headers, rows } = parse(csv, { header: true });

// 2. Define schema
const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer", rules: [{ rule: "min", value: 0 }] },
  },
};

// 3. Map columns (handles mismatched headers)
const mapping = mapColumns(headers!, schema);

// 4. Apply mapping (reorder data to match schema)
const fullData = [headers!, ...rows];
const mappedData = applyMapping(fullData, mapping.mappings, schema, {
  hasHeader: true,
});

// 5. Validate (skip header row)
const result = validate(mappedData.slice(1), schema);

// 6. Handle result
if (result.valid) {
  console.log("All data valid!");
  processData(mappedData.slice(1));
} else {
  console.log(`Found ${result.errors.length} errors`);
  result.errors.forEach(e => {
    console.log(`Row ${e.row + 1}, ${e.field}: ${e.message}`);
  });
}
```

## Using mapAndValidate()

For a simpler workflow, use the convenience function:

```typescript
import { parse, mapAndValidate } from "@elekcsv/core";

const csv = `name,email,age
Omer,omer@test.com,25
Sebnem,sebnem@test.com,30`;

const { headers, rows } = parse(csv, { header: true });

const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer" },
  },
};

// One function does mapping + validation
const result = mapAndValidate([headers!, ...rows], schema);

console.log("Mapping:", result.mapping.autoMapped, "auto-mapped");
console.log("Valid:", result.validation.valid);
console.log("Mapped data:", result.mappedData);
```

## mapAndValidate() Return Type

```typescript
interface MapAndValidateResult {
  mapping: MappingResult;        // Column mapping result
  validation: ValidationResult; // Validation result
  mappedData: string[][];       // Data with columns reordered (includes header)
}
```

## Error Handling Patterns

### Pattern 1: Fail Fast

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

function importCSV(csvContent: string) {
  // Parse
  const parseResult = parse(csvContent, { header: true });
  if (!parseResult.headers || parseResult.rows.length === 0) {
    throw new Error("Empty or invalid CSV");
  }

  // Map
  const mapping = mapColumns(parseResult.headers, schema);
  if (mapping.unmappedSchemaColumns.length > 0) {
    throw new Error(`Missing columns: ${mapping.unmappedSchemaColumns.join(", ")}`);
  }

  // Apply mapping
  const mappedData = applyMapping(
    [parseResult.headers, ...parseResult.rows],
    mapping.mappings,
    schema
  );

  // Validate
  const result = validate(mappedData.slice(1), schema);
  if (!result.valid) {
    throw new Error(`Validation failed: ${result.errors.length} errors`);
  }

  return mappedData.slice(1);
}
```

### Pattern 2: Collect All Errors

```typescript
function importCSVWithErrors(csvContent: string) {
  const issues: string[] = [];

  // Parse
  const { headers, rows } = parse(csvContent, { header: true });
  if (!headers) {
    issues.push("No header row found");
    return { data: null, issues };
  }

  // Map
  const mapping = mapColumns(headers, schema);
  if (mapping.unmappedSchemaColumns.length > 0) {
    issues.push(`Missing columns: ${mapping.unmappedSchemaColumns.join(", ")}`);
  }
  if (mapping.needsReview > 0) {
    const fuzzy = mapping.mappings.filter(m => m.confidence === "fuzzy");
    fuzzy.forEach(m => {
      issues.push(`Fuzzy match: "${m.csvHeader}" -> "${m.schemaColumn}" (${Math.round(m.score * 100)}%)`);
    });
  }

  // Continue anyway with partial mapping
  const mappedData = applyMapping([headers, ...rows], mapping.mappings, schema);

  // Validate
  const result = validate(mappedData.slice(1), schema);
  if (!result.valid) {
    result.errors.slice(0, 10).forEach(e => {
      issues.push(`Row ${e.row + 1}, ${e.field}: ${e.message}`);
    });
    if (result.errors.length > 10) {
      issues.push(`... and ${result.errors.length - 10} more errors`);
    }
  }

  return {
    data: mappedData.slice(1),
    validation: result,
    issues,
  };
}
```

### Pattern 3: With User Confirmation

```typescript
import { parse, mapColumns, applyMapping, validate, updateMapping } from "@elekcsv/core";

interface ImportStep {
  step: "mapping" | "validation" | "complete";
  data: any;
}

function* importCSVWithSteps(csvContent: string, schema: Schema): Generator<ImportStep> {
  // Parse
  const { headers, rows } = parse(csvContent, { header: true });
  if (!headers) throw new Error("No headers");

  // Map columns
  let mapping = mapColumns(headers, schema);

  // Yield for user to review/edit mapping
  yield {
    step: "mapping",
    data: {
      mapping,
      headers,
      preview: rows.slice(0, 5),
    },
  };

  // After user confirms, continue...
  const mappedData = applyMapping([headers, ...rows], mapping.mappings, schema);
  const result = validate(mappedData.slice(1), schema);

  // Yield validation results
  yield {
    step: "validation",
    data: {
      result,
      rowCount: rows.length,
    },
  };

  // After user accepts...
  yield {
    step: "complete",
    data: {
      data: mappedData.slice(1),
      stats: result.stats,
    },
  };
}
```

## Pipeline with Locale

```typescript
import { parse, mapAndValidate } from "@elekcsv/core";

const csv = `Urun,Fiyat,Tarih,Aktif
Laptop,15.999,00 ₺,25.01.2025,evet
Telefon,7.499,00 ₺,20.01.2025,hayir`;

const { headers, rows } = parse(csv);

const schema = {
  locale: "tr",  // Turkish locale for all columns
  columns: {
    product: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["urun"],
    },
    price: {
      type: "currency",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["fiyat"],
    },
    date: {
      type: "date",
      aliases: ["tarih"],
    },
    active: {
      type: "boolean",
      aliases: ["aktif"],
    },
  },
};

const result = mapAndValidate([headers!, ...rows], schema);

// Price "15.999,00 ₺" is valid Turkish currency
// Date "25.01.2025" is valid Turkish date format
// Boolean "evet" is valid Turkish true value
console.log(result.validation.valid);  // true
```

## Pipeline with Bitmap Validation

For large datasets, use `validateBitmap` instead of `validate`:

```typescript
import { parse, mapColumns, applyMapping, validateBitmap } from "@elekcsv/core";

async function importLargeCSV(csvContent: string) {
  const { headers, rows } = parse(csvContent, { header: true });
  console.log(`Parsing complete: ${rows.length} rows`);

  const mapping = mapColumns(headers!, schema);
  const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

  // Use bitmap validation for better memory with large files
  const result = validateBitmap(mappedData.slice(1), schema);

  console.log(`Validation complete`);
  console.log(`  Valid: ${result.valid}`);
  console.log(`  Errors: ${result.errorCount}`);
  console.log(`  Memory: ${result.getMemoryUsage().total} bytes`);

  // Paginated error access
  const firstPage = result.getErrors({ limit: 50, offset: 0 });
  return { data: mappedData.slice(1), result, firstPage };
}
```

## React Hook Pipeline

The `useCSVImporter` hook manages this entire pipeline automatically:

```typescript
import { useCSVImporter } from "@elekcsv/react";

const { step, state, loadFile, confirmMapping, accept } = useCSVImporter({
  schema,
  onComplete: (result) => {
    // Pipeline complete
    // result.data - mapped and validated data
    // result.mapping - column mapping used
    // result.validation - validation result
    // result.stats - timing and counts
  },
});
```

See [React Hook](./react-hook.md) for full documentation.
