# Column Mapping

CSV files from different sources often have headers that don't match your schema exactly. elek's column mapper automatically matches CSV headers to schema columns using a 3-layer strategy: exact match, alias match, and fuzzy match.

## The Problem

```
Your schema expects:     CSV file has:
- name                   - Ad Soyad
- email                  - E-posta
- birthDate              - Dogum Tarihi
- salary                 - Maas
```

elek's mapper solves this by finding the best match for each column.

## 3-Layer Matching Strategy

1. **Exact Match** - Case-insensitive direct match (score: 1.0)
2. **Alias Match** - Match against column `aliases` array (score: 1.0)
3. **Fuzzy Match** - Levenshtein similarity + token matching (score: 0.0-1.0)

## Basic Usage

```typescript
import { mapColumns, applyMapping } from "@elekcsv/core";

const csvHeaders = ["Ad Soyad", "E-posta", "Dogum Tarihi", "Maas"];

const schema = {
  columns: {
    name: {
      type: "string",
      aliases: ["ad", "ad soyad", "isim"],  // Turkish alternatives
    },
    email: {
      type: "string",
      aliases: ["e-posta", "mail", "eposta"],
    },
    birthDate: {
      type: "date",
      aliases: ["dogum tarihi", "dogum_tarihi"],
    },
    salary: {
      type: "currency",
      aliases: ["maas", "ucret"],
    },
  },
};

// Map headers to schema
const mapping = mapColumns(csvHeaders, schema);

// Check results
console.log(mapping.autoMapped);    // 4 (all matched via aliases)
console.log(mapping.needsReview);   // 0
console.log(mapping.unmapped);      // 0
```

## MappingResult Interface

```typescript
interface MappingResult {
  mappings: MappingMatch[];        // One entry per CSV column
  unmappedCsvColumns: number[];    // Indices of CSV columns with no match
  unmappedSchemaColumns: string[]; // Schema columns with no CSV match
  autoMapped: number;              // Count of exact + alias matches
  needsReview: number;             // Count of fuzzy matches needing review
  unmapped: number;                // Count of no-match columns
}

interface MappingMatch {
  csvIndex: number;           // 0-based CSV column index
  csvHeader: string;          // Original header text
  schemaColumn: string;       // Matched schema column (empty if no match)
  confidence: MappingConfidence;
  score: number;              // 0.0 - 1.0
}

type MappingConfidence = "exact" | "alias" | "fuzzy" | "none";
```

## Mapping Options

```typescript
const mapping = mapColumns(headers, schema, {
  fuzzyThreshold: 0.6,      // Minimum score for fuzzy match (default: 0.6)
  autoAcceptThreshold: 0.8, // Auto-accept fuzzy matches above this (default: 0.8)
});
```

## Applying the Mapping

After mapping, use `applyMapping()` to reorder your data:

```typescript
import { mapColumns, applyMapping } from "@elekcsv/core";

const csvData = [
  ["Ad Soyad", "E-posta", "Maas"],        // Header row
  ["Omer", "omer@test.com", "1.500,00"],  // Data rows
  ["Sebnem", "sebnem@test.com", "2.000,00"],
];

const schema = {
  columns: {
    name: { type: "string", aliases: ["ad soyad"] },
    email: { type: "string", aliases: ["e-posta"] },
    salary: { type: "currency", aliases: ["maas"] },
  },
};

// Get mapping
const mapping = mapColumns(csvData[0], schema);

// Reorder data to match schema column order
const mappedData = applyMapping(csvData, mapping.mappings, schema, {
  hasHeader: true,  // First row is header (default: true)
});

// mappedData now has columns in schema order:
// [["name", "email", "salary"], ["Omer", "omer@test.com", "1.500,00"], ...]
```

## Manual Mapping Updates

Users may need to correct fuzzy matches or map unmapped columns:

```typescript
import { mapColumns, updateMapping } from "@elekcsv/core";

const headers = ["Name", "Mail", "Unknown Column"];

const schema = {
  columns: {
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "phone" },
  },
};

// Initial mapping
let mapping = mapColumns(headers, schema);
// "Unknown Column" might not match anything

// User decides "Unknown Column" should map to "phone"
const updatedMappings = updateMapping(
  mapping.mappings,
  2,       // CSV column index
  "phone"  // Schema column to map to
);

// updateMapping returns a new array (immutable)
```

## Fuzzy Matching Details

The fuzzy matcher combines multiple signals:

1. **Levenshtein similarity** - Edit distance normalized to 0-1
2. **Token similarity** - Compares individual words
3. **Contains match** - Bonus if one string contains the other
4. **Common prefix** - Bonus for shared prefix

```typescript
import {
  levenshteinSimilarity,
  tokenSimilarity,
  computeSimilarity,
  normalize,
} from "@elekcsv/core";

// Direct string similarity
levenshteinSimilarity("email", "e-mail");  // 0.83

// Token-based (splits on spaces/underscores)
tokenSimilarity("birth date", "Date of Birth");  // ~0.75

// Combined scoring (used by mapColumns)
computeSimilarity("Ad Soyad", "name");  // Uses all signals

// Normalize strings for comparison
normalize("  Birth_Date ");  // "birth date"
```

## Turkish Character Handling

The mapper uses standard `toLowerCase()` to preserve Turkish character matching:

```typescript
const headers = ["Dogum Tarihi", "FATURA", "Sehir"];

const schema = {
  columns: {
    birthDate: { type: "date", aliases: ["dogum tarihi"] },
    invoice: { type: "currency", aliases: ["fatura"] },
    city: { type: "string", aliases: ["sehir", "il"] },
  },
};

// All match correctly despite case differences
const mapping = mapColumns(headers, schema);
```

## Complete Example

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

const csv = `Urun Adi,Fiyat,Stok,Kategori
Laptop,15.999,50,Elektronik
Telefon,7.499,100,Elektronik
Masa,2.500,25,Mobilya`;

// Parse
const { headers, rows } = parse(csv);

// Schema with Turkish aliases
const schema = {
  locale: "tr",
  columns: {
    productName: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["urun adi", "urun", "adi"],
    },
    price: {
      type: "currency",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["fiyat", "ucret"],
    },
    stock: {
      type: "integer",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["stok", "miktar"],
    },
    category: {
      type: "string",
      rules: [{ rule: "enum", values: ["Elektronik", "Mobilya", "Giyim"] }],
      aliases: ["kategori", "tur"],
    },
  },
};

// Map columns
const mapping = mapColumns(headers!, schema);

console.log("Mapping results:");
mapping.mappings.forEach(m => {
  console.log(`  "${m.csvHeader}" -> "${m.schemaColumn}" (${m.confidence})`);
});
// "Urun Adi" -> "productName" (alias)
// "Fiyat" -> "price" (alias)
// "Stok" -> "stock" (alias)
// "Kategori" -> "category" (alias)

// Apply mapping
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);

// Validate
const result = validate(mappedData.slice(1), schema);
console.log(`Valid: ${result.valid}`);
```

## Handling Unmapped Columns

```typescript
const mapping = mapColumns(headers, schema);

if (mapping.unmappedSchemaColumns.length > 0) {
  console.log("Missing required columns:", mapping.unmappedSchemaColumns);
  // ["phone", "address"] - schema columns with no CSV match
}

if (mapping.unmappedCsvColumns.length > 0) {
  console.log("Extra CSV columns:", mapping.unmappedCsvColumns);
  // [3, 5] - CSV column indices with no schema match
}

if (mapping.needsReview > 0) {
  console.log("Fuzzy matches need review:");
  mapping.mappings
    .filter(m => m.confidence === "fuzzy")
    .forEach(m => {
      console.log(`  "${m.csvHeader}" -> "${m.schemaColumn}" (score: ${m.score})`);
    });
}
```
