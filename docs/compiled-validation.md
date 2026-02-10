# Compiled Validators

elek compiles your schema into optimized JavaScript functions at runtime. This eliminates the overhead of iterating through rules during validation, resulting in significant performance gains for large datasets.

## How It Works

When you call `validate()` or `validateBitmap()`, elek:

1. Analyzes your schema
2. Generates specialized JavaScript code for each column
3. Compiles this code using `new Function()`
4. Caches the compiled validator for reuse

For example, this schema:

```typescript
const schema = {
  columns: {
    age: {
      type: "integer",
      rules: [
        { rule: "required" },
        { rule: "min", value: 0 },
        { rule: "max", value: 120 },
      ],
    },
  },
};
```

Generates something like:

```javascript
function(v) {
  if (v === '') return 1;  // required
  if (!/^-?\d+$/.test(v)) return 2;  // integer type
  var n = parseInt(v, 10);
  if (n < 0) return 3;   // min
  if (n > 120) return 4; // max
  return 0;  // valid
}
```

## Using CompiledValidator

For repeated validation with the same schema, use the `CompiledValidator` class directly:

```typescript
import { CompiledValidator } from "@elekcsv/core";

const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer" },
  },
};

// Compile once
const validator = new CompiledValidator(schema);

// Validate multiple datasets
const result1 = validator.validateAll(data1);
const result2 = validator.validateAll(data2);
const result3 = validator.validateAllBitmap(data3); // Bitmap version

// Access schema info
console.log(validator.getColumnNames());  // ["name", "email", "age"]
console.log(validator.getColumnCount()); // 3
```

## compileSchema() for Advanced Use

You can also compile the schema separately:

```typescript
import { compileSchema } from "@elekcsv/core";

const compiled = compileSchema(schema);

// compiled.columns[0].fn("test@example.com") returns 0 (valid)
// compiled.columns[0].fn("invalid") returns 10 (EMAIL error code)

console.log(compiled.columnNames);  // ["name", "email", "age"]
console.log(compiled.columnCount);  // 3
console.log(compiled.locale);       // undefined or schema locale
```

## compileColumn() for Single Columns

For even more granular control:

```typescript
import { compileColumn } from "@elekcsv/core";

const columnDef = {
  type: "string",
  rules: [
    { rule: "required" },
    { rule: "minLength", value: 3 },
    { rule: "maxLength", value: 50 },
  ],
};

const info = compileColumn(columnDef, "name", { defaultLocale: "en" });

// info.fn is the compiled validation function
// info.errorMap maps error codes to rule metadata
// info.hasRequired is true
// info.hasUnique is false
// info.customFns is empty (no custom rules)

// Test the compiled function
info.fn("");      // 1 (REQUIRED)
info.fn("ab");    // 8 (MIN_LENGTH)
info.fn("valid"); // 0 (VALID)
```

## Performance Benefits

| Approach | 100K rows | Notes |
|----------|-----------|-------|
| Compiled validator | ~30ms | No rule iteration overhead |
| Naive rule checking | ~150ms | Iterates rules for each cell |
| With locale parsing | ~72ms | Additional parsing overhead |

## Locale-Aware Compilation

When a column has a locale (either from schema or column definition), the compiler generates locale-aware validation code:

```typescript
const schema = {
  locale: "tr",
  columns: {
    price: { type: "currency" },     // Uses Turkish currency format
    date: { type: "date" },          // Uses DD.MM.YYYY format
    active: { type: "boolean" },     // Accepts "evet"/"hayir"
  },
};

// Compiled validators will parse:
// - "1.234,56 ₺" as valid currency
// - "25.01.2025" as valid date
// - "evet" as valid boolean
```

## Custom Rules Cannot Be Compiled

Custom validation functions run at runtime and cannot be compiled:

```typescript
const schema = {
  columns: {
    code: {
      type: "string",
      rules: [
        { rule: "required" },  // Compiled
        {
          rule: "custom",      // Runs at runtime
          fn: (v) => v.startsWith("TR-"),
          message: "Must start with TR-",
        },
      ],
    },
  },
};
```

The compiled validator stores custom functions separately and calls them after running the compiled checks.

## Unique Constraint Handling

The `unique` rule requires tracking values across all rows, so it cannot be fully compiled:

```typescript
const schema = {
  columns: {
    email: {
      type: "string",
      rules: [
        { rule: "required" },
        { rule: "email" },
        { rule: "unique" },  // Tracked separately using a Set
      ],
    },
  },
};
```

The validator tracks unique values in a `Map<string, number>` (value → first occurrence row) and checks for duplicates during validation.

## Example: Batch Processing

```typescript
import { CompiledValidator } from "@elekcsv/core";

const schema = {
  columns: {
    id: { type: "string", rules: [{ rule: "required" }, { rule: "unique" }] },
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
  },
};

// Compile once for the session
const validator = new CompiledValidator(schema);

// Process multiple batches
async function processBatches(batches: string[][][]) {
  const results = [];

  for (const batch of batches) {
    const result = validator.validateAllBitmap(batch);
    results.push({
      valid: result.valid,
      errorCount: result.errorCount,
      errors: result.getErrors({ limit: 100 }),
    });
  }

  return results;
}
```
