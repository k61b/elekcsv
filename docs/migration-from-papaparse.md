# Migrating from PapaParse

If you're currently using PapaParse for CSV parsing, migrating to elek gives you additional features: built-in validation, column mapping, and locale support.

## Basic Parsing

### PapaParse

```typescript
import Papa from "papaparse";

const result = Papa.parse(csvString, {
  header: true,
  delimiter: ",",
  skipEmptyLines: true,
});

const headers = result.meta.fields;
const data = result.data;  // Array of objects
```

### elek

```typescript
import { parse } from "@elekcsv/core";

const result = parse(csvString, {
  header: true,
  delimiter: ",",
  skipEmptyLines: true,
});

const headers = result.headers;  // string[]
const data = result.rows;        // string[][] (not objects)
```

**Key difference**: elek returns `string[][]` instead of objects. This is faster and works better with the validation pipeline.

## Converting to Objects

If you need object format:

```typescript
import { parse } from "@elekcsv/core";

const { headers, rows } = parse(csvString, { header: true });

// Convert to objects
const data = rows.map(row => {
  const obj: Record<string, string> = {};
  headers!.forEach((h, i) => {
    obj[h] = row[i] ?? "";
  });
  return obj;
});
```

## Adding Validation

### PapaParse (manual validation)

```typescript
import Papa from "papaparse";

const result = Papa.parse(csvString, { header: true });
const errors = [];

result.data.forEach((row, i) => {
  if (!row.email || !row.email.includes("@")) {
    errors.push({ row: i, field: "email", message: "Invalid email" });
  }
  if (!row.name) {
    errors.push({ row: i, field: "name", message: "Required" });
  }
});
```

### elek (schema-based validation)

```typescript
import { parse, validate } from "@elekcsv/core";

const { headers, rows } = parse(csvString, { header: true });

const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
  },
};

const result = validate(rows, schema);
// result.errors is already populated
```

## Column Mapping

### PapaParse (manual mapping)

```typescript
import Papa from "papaparse";

const result = Papa.parse(csvString, { header: true });

// Manual header mapping
const fieldMap = {
  "First Name": "firstName",
  "E-mail": "email",
  "Phone Number": "phone",
};

const mappedData = result.data.map(row => {
  const mapped = {};
  for (const [csvHeader, schemaField] of Object.entries(fieldMap)) {
    mapped[schemaField] = row[csvHeader];
  }
  return mapped;
});
```

### elek (automatic mapping)

```typescript
import { parse, mapColumns, applyMapping } from "@elekcsv/core";

const { headers, rows } = parse(csvString, { header: true });

const schema = {
  columns: {
    firstName: {
      type: "string",
      aliases: ["first name", "name", "ad"],  // Automatic matching
    },
    email: {
      type: "string",
      aliases: ["e-mail", "mail", "e-posta"],
    },
    phone: {
      type: "phone",
      aliases: ["phone number", "tel", "telefon"],
    },
  },
};

// Automatic fuzzy matching
const mapping = mapColumns(headers!, schema);
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);
```

## Locale-Aware Parsing

### PapaParse (manual locale handling)

```typescript
import Papa from "papaparse";

const result = Papa.parse(csvString, { header: true });

// Manual Turkish number parsing
function parseTurkishNumber(value) {
  return parseFloat(value.replace(/\./g, "").replace(",", "."));
}

// Manual Turkish date parsing
function parseTurkishDate(value) {
  const [day, month, year] = value.split(".");
  return new Date(year, month - 1, day);
}

const processed = result.data.map(row => ({
  ...row,
  price: parseTurkishNumber(row.price),
  date: parseTurkishDate(row.date),
}));
```

### elek (built-in locale)

```typescript
import { parse, validate } from "@elekcsv/core";

const { headers, rows } = parse(csvString, { header: true });

const schema = {
  locale: "tr",  // Turkish locale
  columns: {
    price: { type: "currency" },  // Validates "1.234,56 ₺"
    date: { type: "date" },       // Validates "25.01.2025"
  },
};

// Validation handles locale automatically
const result = validate(rows, schema);
```

## Full Migration Example

### Before (PapaParse)

```typescript
import Papa from "papaparse";

function importCSV(csvString) {
  // Parse
  const parseResult = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseResult.errors.length > 0) {
    throw new Error("Parse error");
  }

  // Manual validation
  const errors = [];
  parseResult.data.forEach((row, i) => {
    if (!row.name) {
      errors.push({ row: i, message: "Name required" });
    }
    if (row.email && !row.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      errors.push({ row: i, message: "Invalid email" });
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: parseResult.data };
}
```

### After (elek)

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

function importCSV(csvString) {
  // Parse
  const { headers, rows } = parse(csvString, {
    header: true,
    skipEmptyLines: true,
  });

  // Schema defines structure AND validation
  const schema = {
    columns: {
      name: {
        type: "string",
        rules: [{ rule: "required" }],
        aliases: ["name", "full name", "ad"],
      },
      email: {
        type: "string",
        rules: [{ rule: "email" }],
        aliases: ["email", "e-mail", "e-posta"],
      },
    },
  };

  // Auto-map columns
  const mapping = mapColumns(headers!, schema);
  const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

  // Validate
  const result = validate(mappedData.slice(1), schema);

  if (!result.valid) {
    return { success: false, errors: result.errors };
  }

  return { success: true, data: mappedData.slice(1) };
}
```

## Feature Comparison

| Feature | PapaParse | elek |
|---------|-----------|------|
| CSV parsing | Yes | Yes |
| Streaming | Yes | No |
| Header support | Yes | Yes |
| Custom delimiters | Yes | Yes |
| Schema validation | No | Yes |
| Column mapping | No | Yes |
| Fuzzy matching | No | Yes |
| Locale support | No | Yes (tr, en, de, fr, en-GB) |
| Error tracking | Parse errors only | Full validation |
| React integration | Manual | Built-in hook |

## What elek Adds

1. **Schema-based validation** - Define rules once, validate automatically
2. **Column mapping** - Handles mismatched headers with fuzzy matching
3. **Locale support** - Turkish dates, European numbers, localized booleans
4. **Compiled validators** - High performance for large datasets
5. **Bitmap error tracking** - Memory-efficient for 100K+ rows
6. **React hook** - Complete import flow management
