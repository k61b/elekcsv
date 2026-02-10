# Validation

elek provides schema-based validation with compiled validators for maximum performance. Define your expected data structure once, and elek validates every row against it.

## Defining a Schema

```typescript
import type { Schema, ColumnDef } from "@elekcsv/core";

const schema: Schema = {
  locale: "tr",  // Optional: default locale for all columns
  columns: {
    name: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["ad", "isim"],  // Alternative header names for mapping
    },
    email: {
      type: "string",
      rules: [{ rule: "required" }, { rule: "email" }],
    },
    age: {
      type: "integer",
      rules: [{ rule: "min", value: 0 }, { rule: "max", value: 120 }],
    },
    birthDate: {
      type: "date",
      locale: "tr",  // Override schema locale for this column
    },
  },
};
```

## Schema Interface

```typescript
interface Schema {
  columns: Record<string, ColumnDef>;
  locale?: string;  // Default locale for all columns
}

interface ColumnDef {
  type: ColumnType;
  rules?: Rule[];
  locale?: string;   // Override schema locale
  aliases?: string[]; // Alternative names for column mapping
}

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

## Column Types

| Type | Description | Valid Examples |
|------|-------------|----------------|
| `string` | Any text value | `"hello"`, `""`, `"123"` |
| `number` | Decimal number | `"123.45"`, `"-10"`, `"1,234.56"` (with locale) |
| `integer` | Whole number | `"123"`, `"-10"`, `"0"` |
| `date` | Date value | `"2025-01-25"`, `"25.01.2025"` (with locale) |
| `boolean` | True/false | `"true"`, `"yes"`, `"1"`, `"evet"` (with locale) |
| `enum` | Fixed set of values | Defined by `enum` rule |
| `phone` | Phone number | `"+90 532 123 4567"`, `"05321234567"` |
| `currency` | Monetary amount | `"$1,234.56"`, `"1.234,56 TL"` (with locale) |

## Validation Rules

| Rule | Parameters | Description | Example |
|------|------------|-------------|---------|
| `required` | - | Value must not be empty | `{ rule: "required" }` |
| `email` | - | Valid email format | `{ rule: "email" }` |
| `unique` | - | No duplicate values in column | `{ rule: "unique" }` |
| `min` | `value: number` | Minimum numeric value | `{ rule: "min", value: 0 }` |
| `max` | `value: number` | Maximum numeric value | `{ rule: "max", value: 100 }` |
| `minLength` | `value: number` | Minimum string length | `{ rule: "minLength", value: 3 }` |
| `maxLength` | `value: number` | Maximum string length | `{ rule: "maxLength", value: 50 }` |
| `pattern` | `value: RegExp` | Must match regex pattern | `{ rule: "pattern", value: /^[A-Z]{3}$/ }` |
| `enum` | `values: string[]` | Must be one of the values | `{ rule: "enum", values: ["S", "M", "L"] }` |
| `custom` | `fn`, `message?` | Custom validation function | `{ rule: "custom", fn: (v) => v.startsWith("TR") }` |

## Using validate()

```typescript
import { validate } from "@elekcsv/core";

const data = [
  ["Omer", "omer@test.com", "25"],
  ["", "invalid-email", "-5"],  // Multiple errors
  ["Sebnem", "sebnem@test.com", "30"],
];

const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer", rules: [{ rule: "min", value: 0 }] },
  },
};

const result = validate(data, schema);
```

## ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;           // true if no errors
  stats: ValidationStats;   // Summary statistics
  errors: ValidationError[];// All validation errors
  aborted: boolean;         // true if validation was stopped early
}

interface ValidationStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errorsByRule: Record<string, number>;   // e.g., { required: 2, email: 1 }
  errorsByColumn: Record<string, number>; // e.g., { name: 2, email: 1 }
}

interface ValidationError {
  row: number;      // 0-indexed row number
  col: number;      // 0-indexed column number
  field: string;    // Column name from schema
  value: string;    // The invalid value
  code: ErrorCode;  // Numeric error code
  message?: string; // Human-readable error message
}
```

## Error Codes

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

## Complete Example

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

const csv = `Ad,E-posta,Yas,Ulke
Omer,omer@test.com,25,TR
,invalid,150,XX
Sebnem,sebnem@test.com,30,TR`;

// Parse
const { headers, rows } = parse(csv);

// Define schema with Turkish aliases
const schema = {
  columns: {
    name: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["ad", "isim"],
    },
    email: {
      type: "string",
      rules: [{ rule: "email" }],
      aliases: ["e-posta", "mail"],
    },
    age: {
      type: "integer",
      rules: [{ rule: "min", value: 0 }, { rule: "max", value: 120 }],
      aliases: ["yas"],
    },
    country: {
      type: "string",
      rules: [{ rule: "enum", values: ["TR", "US", "DE", "FR"] }],
      aliases: ["ulke"],
    },
  },
};

// Map and reorder columns
const mapping = mapColumns(headers!, schema);
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

// Validate (skip header)
const result = validate(mappedData.slice(1), schema);

console.log(result.valid); // false
console.log(result.stats.errorRows); // 1
console.log(result.errors);
// [
//   { row: 1, col: 0, field: "name", value: "", code: 1, message: "Required" },
//   { row: 1, col: 1, field: "email", value: "invalid", code: 10, message: "Invalid email" },
//   { row: 1, col: 2, field: "age", value: "150", code: 4, message: "Value exceeds maximum" },
//   { row: 1, col: 3, field: "country", value: "XX", code: 6, message: "Value not in enum" },
// ]
```

## Custom Validation

```typescript
const schema = {
  columns: {
    code: {
      type: "string",
      rules: [
        { rule: "required" },
        {
          rule: "custom",
          fn: (value) => value.startsWith("TR-"),
          message: "Code must start with TR-",
        },
      ],
    },
    price: {
      type: "number",
      rules: [
        {
          rule: "custom",
          fn: (value) => {
            const num = parseFloat(value);
            return num > 0 && num % 0.01 === 0; // Valid currency amount
          },
          message: "Price must be a positive amount with max 2 decimals",
        },
      ],
    },
  },
};
```
