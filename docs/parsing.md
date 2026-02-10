# CSV Parsing

elek provides a high-performance CSV parser that uses code generation to create optimized parsing functions. The parser handles quoted fields, different delimiters, and various line endings.

## Basic Usage

```typescript
import { parse } from "@elekcsv/core";

const csv = `name,email,city
Omer,omer@test.com,Istanbul
Sebnem,sebnem@test.com,Ankara`;

const result = parse(csv, { header: true });

// result.headers = ["name", "email", "city"]
// result.rows = [["Omer", "omer@test.com", "Istanbul"], ["Sebnem", ...]]
// result.rowCount = 2
// result.fieldCount = 3
```

## Function Signature

```typescript
function parse(csv: string, options?: ParseOptions): ParseResult;

interface ParseOptions {
  delimiter?: string;      // Default: ","
  quote?: string;          // Default: '"'
  header?: boolean;        // Default: true
  skipEmptyLines?: boolean; // Default: false
}

interface ParseResult {
  headers: string[] | null;  // Header row (null if header: false)
  rows: string[][];          // Data rows as string arrays
  rowCount: number;          // Total data rows (excluding header)
  fieldCount: number;        // Number of fields per row
}
```

## Handling Different Delimiters

```typescript
import { parse } from "@elekcsv/core";

// Semicolon-delimited (common in European Excel exports)
const semicolonCsv = `name;age;city
Omer;25;Istanbul`;
parse(semicolonCsv, { delimiter: ";" });

// Tab-delimited (TSV)
const tsvData = `name\tage\tcity
Omer\t25\tIstanbul`;
parse(tsvData, { delimiter: "\t" });

// Pipe-delimited
const pipeCsv = `name|age|city
Omer|25|Istanbul`;
parse(pipeCsv, { delimiter: "|" });
```

## Quoted Fields and Escaped Quotes

The parser correctly handles RFC 4180 compliant CSV:

```typescript
import { parse } from "@elekcsv/core";

// Fields containing delimiters must be quoted
const csv1 = `name,address
Omer,"Istanbul, Turkey"`;
parse(csv1).rows[0]; // ["Omer", "Istanbul, Turkey"]

// Escaped quotes (double quote inside quoted field)
const csv2 = `name,quote
Omer,"He said ""Hello"""`;
parse(csv2).rows[0]; // ["Omer", 'He said "Hello"']

// Fields containing newlines
const csv3 = `name,address
Omer,"123 Main St
Istanbul, Turkey"`;
parse(csv3).rows[0]; // ["Omer", "123 Main St\nIstanbul, Turkey"]
```

## Without Header Row

```typescript
import { parse } from "@elekcsv/core";

const csv = `Omer,25,Istanbul
Sebnem,30,Ankara`;

const result = parse(csv, { header: false });

// result.headers = null
// result.rows = [["Omer", "25", "Istanbul"], ["Sebnem", "30", "Ankara"]]
// result.rowCount = 2
```

## Skipping Empty Lines

```typescript
import { parse } from "@elekcsv/core";

const csv = `name,age
Omer,25

Sebnem,30

`;

// Without skipEmptyLines (default)
parse(csv).rowCount; // 4 (includes empty rows)

// With skipEmptyLines
parse(csv, { skipEmptyLines: true }).rowCount; // 2
```

## UTF-8 and Turkish Characters

The parser fully supports UTF-8, including Turkish characters:

```typescript
import { parse } from "@elekcsv/core";

const csv = `isim,sehir
Omer,Istanbul
Sebnem,Izmir
Gokcen,Ankara`;

const result = parse(csv);
// Correctly handles: I, i, O, o, U, u, S, s, C, c, G, g
```

## Compiled Parser for Repeated Use

For parsing multiple CSVs with the same structure, use `compileParser`:

```typescript
import { compileParser } from "@elekcsv/core";

// Compile once from a sample
const sample = `name,age,city
Sample,0,Sample`;
const compiled = compileParser(sample);

// Use for multiple files with same structure
const csv1 = `name,age,city\nOmer,25,Istanbul`;
const csv2 = `name,age,city\nSebnem,30,Ankara`;

// Directly use the compiled function (skips re-compilation)
const rows1 = compiled.fn(csv1, csv1.indexOf('\n') + 1);
const rows2 = compiled.fn(csv2, csv2.indexOf('\n') + 1);
```

## Performance Tips

1. **Use `header: true` (default)** - The parser optimizes for this case
2. **Consistent structure** - Files with the same column count reuse cached parsers
3. **Avoid unnecessary `skipEmptyLines`** - Post-filtering is more efficient for most cases
4. **Clear cache if needed** - Call `clearParserCache()` when parsing many different CSV structures

```typescript
import { clearParserCache } from "@elekcsv/core";

// Clear if you've parsed many CSVs with different column counts
clearParserCache();
```

## Error Handling

The parser is permissive and won't throw on malformed CSV. It handles edge cases gracefully:

```typescript
import { parse } from "@elekcsv/core";

// Missing fields are empty strings
const incomplete = `name,age,city
Omer,25`;
parse(incomplete).rows[0]; // ["Omer", "25"] (city is missing from row)

// Extra fields are preserved
const extra = `name,age
Omer,25,Istanbul`;
parse(extra).rows[0]; // ["Omer", "25", "Istanbul"]
```
