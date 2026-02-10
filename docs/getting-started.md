# Getting Started with elek

elek is a high-performance, headless, locale-aware CSV import toolkit for JavaScript and TypeScript. It provides everything you need to parse, validate, and transform CSV data: a fast parser, schema-based validation with compiled validators, intelligent column mapping with fuzzy matching, and full locale support for Turkish, European, and other date/number formats.

## Installation

```bash
# npm
npm install @elekcsv/core

# pnpm
pnpm add @elekcsv/core

# bun
bun add @elekcsv/core

# yarn
yarn add @elekcsv/core
```

For React applications, also install the hook:

```bash
npm install @elekcsv/react
```

## Minimal Working Example

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

// 1. Your CSV data
const csv = `name,email,age
Omer,omer@example.com,25
Sebnem,sebnem@example.com,30
Ayse,invalid-email,28`;

// 2. Parse the CSV
const { headers, rows } = parse(csv, { header: true });
// headers = ["name", "email", "age"]
// rows = [["Omer", "omer@example.com", "25"], ...]

// 3. Define your schema
const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer", rules: [{ rule: "min", value: 0 }] },
  },
};

// 4. Map CSV columns to schema (handles mismatched headers)
const mapping = mapColumns(headers!, schema);

// 5. Reorder data to match schema column order
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

// 6. Validate (skip header row)
const result = validate(mappedData.slice(1), schema);

// 7. Check results
console.log(result.valid);  // false (invalid email)
console.log(result.errors); // [{ row: 2, col: 1, field: "email", ... }]
```

## What's Next?

- **[CSV Parsing](./parsing.md)** - All parser options and edge cases
- **[Validation](./validation.md)** - Schema definition and all validation rules
- **[Column Mapping](./column-mapping.md)** - Fuzzy matching and manual corrections
- **[Locale Support](./locale-support.md)** - Turkish, German, French date/number formats
- **[React Hook](./react-hook.md)** - Build headless import UIs
- **[Examples](./examples.md)** - Complete code examples
