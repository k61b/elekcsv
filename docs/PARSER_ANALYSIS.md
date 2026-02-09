# uDSV Parser Analysis

Technical breakdown of [uDSV](https://github.com/leeoniya/uDSV) — the fastest single-threaded CSV parser in the JavaScript ecosystem. This document serves as our roadmap for building @elekcsv/core's parser with multi-threading, streaming validation, and locale awareness.

---

## 1. Core Techniques

### 1.1 Delimiter Detection (indexOf-based)

uDSV uses `indexOf` for delimiter detection, NOT character-by-character iteration:

```javascript
// Line 12: Priority order for auto-detection
const COL_DELIMS = [tab, pipe, semi, comma];

// Line 189: Detection via indexOf
colDelim ??= COL_DELIMS.find(delim => firstRowStr.indexOf(delim) > -1) ?? comma;
```

**Why this matters:** `indexOf` is implemented in native code and is significantly faster than JavaScript loops. V8 uses SIMD instructions for string searches.

### 1.2 Two Parsing Paths

uDSV has two distinct parsing paths based on whether quoting exists:

**Fast Path (lines 429-485):** No quoting (`colEncl === ''`)
- Pure `indexOf` loops for both column and row delimiters
- No character-by-character scanning
- ~2x faster than the quoted path

```javascript
// Line 429: Fast path entry
if (colEncl === '') {
    while (pos <= endPos) {
        // Line 432: Jump directly to row delimiter
        let pos2 = csvStr.indexOf(rowDelim, pos);
        // Line 465: Jump directly to column delimiter
        let pos2 = csvStr.indexOf(colDelim, pos);
    }
}
```

**Slow Path (lines 500-695):** Quoted fields present
- Character-by-character via `charCodeAt()` for state tracking
- Uses `indexOf` to jump to next quote when inside quoted field (line 618)
- Three states: `inCol = 0` (not in column), `1` (unquoted), `2` (quoted)

```javascript
// Line 618: Even in slow path, jumps via indexOf
let pos2 = csvStr.indexOf(colEncl, pos);
```

### 1.3 String Allocation Strategy

uDSV minimizes string allocations through several techniques:

**Pre-allocated Row Template (line 422):**
```javascript
let rowTpl = Array(numCols).fill('');
let row = rowTpl.slice();  // Reused via slice, not new array
```

**Lazy Slicing (lines 441, 472, 632, 689):**
```javascript
// Only slice when field boundary is found
let s = csvStr.slice(pos, pos2);
row[colIdx] = trim ? s.trim() : s;
```

**Deferred Escape Replacement (lines 565, 631-633):**
```javascript
let shouldRep = false;  // Track if replacement needed

// Only call replaceAll when escaped quotes were found
v = shouldRep ?
    csvStr.slice(pos0, posTo).replaceAll(replEsc, colEncl) :
    csvStr.slice(pos0, posTo);
```

### 1.4 Quoted Field Handling

The quoted field parser (lines 564-634) uses a state machine:

```javascript
// Line 490-493: State tracking
// 0 = not in column
// 1 = unquoted column
// 2 = quoted column
let inCol = 0;
```

**Escape Handling (lines 569-615):**
- RFC 4180 style: `""` for escaped quotes (lines 577-587)
- Alternate escape char support: e.g., `\"` (lines 596-615)

```javascript
// Line 577-587: Check if "" is escape sequence
let cNext = csvStr.charCodeAt(pos + 1);
if (cNext === colEnclChar) {
    pos += 2;
    shouldRep = true;  // Mark for later replacement
}
```

### 1.5 Code Generation for Type Conversion

uDSV generates specialized converter functions at runtime:

**`genToTypedRow()` (lines 108-161):**
```javascript
// Compiles a row converter function
return new Function('c', `return r => (${buf});`)(cols);
```

**`getValParseExpr()` (lines 85-104):**
```javascript
// Generates type-specific parse expressions
let parseExpr =
    type === T_DATE   ? `new Date(${rv})`    :
    type === T_NUMBER ? `+${rv}`             :
    type === T_JSON   ? `JSON.parse(${rv})`  :
    rv;
```

**Why this matters:** Compiled functions avoid runtime type checks. Instead of `if (type === 'number') return +v`, the generated function directly executes `return +r[0]`.

### 1.6 Type Inference

The `guessType()` function (lines 52-80) samples data to infer column types:

```javascript
// Line 70-76: Type detection priority
t = (
    ISO8601.test(v) ? T_DATE                        :  // ISO date check
    +v === +v       ? T_NUMBER                      :  // NaN check trick
    BOOL_RE.test(v) ? T_BOOLEAN + ':' + boolTrue(v) :  // Boolean with true value
    isJSON(v)       ? T_JSON                        :  // JSON detection
    t                                                   // Default: string
);
```

**Number detection trick:** `+v === +v` returns `false` for `NaN` (since `NaN !== NaN`), true for valid numbers.

---

## 2. API Surface

### 2.1 Exports

```javascript
export function inferSchema(csvStr, opts, maxRows)  // Line 164
export function initParser(schema)                   // Line 238
```

### 2.2 `inferSchema(csvStr, opts, maxRows)`

Analyzes CSV to produce a parsing schema:

**Parameters:**
- `csvStr: string` — CSV content (or sample)
- `opts: object` — Configuration options
- `maxRows: number` — Rows to sample (default: 10)

**Options:**
```javascript
{
    header: (firstRows) => headerRows,  // Header extraction function
    col: string,     // Column delimiter (auto-detected if omitted)
    row: string,     // Row delimiter (auto-detected if omitted)
    encl: string,    // Quote/enclosure character
    esc: string,     // Escape character
    trim: boolean,   // Trim whitespace from fields
}
```

**Returns schema:**
```javascript
{
    skip: number,      // Header rows to skip (default: 1)
    col: string,       // Detected/configured column delimiter
    row: string,       // Detected/configured row delimiter
    encl: string,      // Quote character (or '' if none)
    esc: string,       // Escape character
    trim: boolean,     // Trim setting
    cols: [{           // Column definitions
        name: string,  // Column header name
        type: string,  // Inferred type: 's'|'n'|'d'|'b'|'j'
        repl: {        // Replacement values
            empty: any,
            null: any,
            NaN: any,
        }
    }]
}
```

### 2.3 `initParser(schema)`

Creates a parser instance with multiple output formats:

**String Output Methods:**
| Method | Output Type | Description |
|--------|-------------|-------------|
| `stringArrs(csv, cb)` | `string[][]` | Raw strings, array of arrays |
| `stringObjs(csv, cb)` | `{[col]: string}[]` | Raw strings as objects |
| `stringCols(csv, cb)` | `string[][]` | Column-oriented strings |

**Typed Output Methods:**
| Method | Output Type | Description |
|--------|-------------|-------------|
| `typedArrs(csv, cb)` | `any[][]` | Typed values, array of arrays |
| `typedObjs(csv, cb)` | `{[col]: any}[]` | Typed values as objects |
| `typedDeep(csv, cb)` | `object[]` | Deep objects from dotted names |
| `typedCols(csv, cb)` | `any[][]` | Column-oriented typed values |

**Callback signature:**
```javascript
cb(row, buffer, appendFn) => boolean  // Return false to halt
```

### 2.4 Streaming Support

**State Machine (lines 247-250):**
```javascript
let streamState = 0;     // 0=not streaming, 1=streaming, 2=ending
let prevUnparsed = '';   // Buffer for incomplete rows
```

**Methods:**
```javascript
// Process a chunk (does not finalize)
parser.chunk(csvStr, parseMethod, callback)

// Finalize and return results
parser.end() => results
```

**How it works:**
1. `chunk()` sets `streamState = 1` and parses
2. Incomplete rows stored in `prevUnparsed` (line 714)
3. Next `chunk()` prepends `prevUnparsed` to new data (line 368)
4. `end()` sets `streamState = 2` and flushes remaining data

---

## 3. Limitations We Will Address

| Limitation | uDSV Behavior | Our Solution |
|------------|---------------|--------------|
| **Single-threaded** | No Web Worker support | Worker pool with chunk distribution |
| **No validation** | Parse-only, no field validation | Inline validation hooks during parsing |
| **No locale support** | `+v` for numbers, `new Date()` for dates | Locale-aware parsers (e.g., `1.234,56` for German) |
| **No column mapping** | Schema must match CSV headers exactly | Fuzzy matching + manual mapping UI support |
| **No error collection** | Silently skips/coerces invalid data | Error accumulator with `{row, col, value, code}` |
| **No progress reporting** | No way to report parse progress | `onProgress` callback with row counts |
| **No early termination config** | Only via callback return value | `maxErrors` option for validation abort |

### 3.1 Single-Threaded Limitation

uDSV runs entirely on the main thread. For large files (100K+ rows), this blocks the UI.

**Our approach:**
- Split file into chunks at newline boundaries
- Distribute chunks to Web Workers
- Each worker parses independently with row offset
- Merge results preserving original row order

### 3.2 No Built-in Validation

uDSV focuses purely on parsing. Type coercion happens but invalid data is silently converted:
- Invalid numbers become `NaN`
- Invalid dates become `Invalid Date`
- No constraint checking (min/max, patterns, required)

**Our approach:**
- Validation hooks invoked during parsing (not separate pass)
- Accumulate `ValidationError[]` with row/column context
- Support `maxErrors` threshold for early abort

### 3.3 No Locale-Aware Parsing

uDSV uses JavaScript defaults:
```javascript
// Line 95: Simple unary plus for numbers
type === T_NUMBER ? `+${rv}` : ...

// Line 92: Native Date constructor
type === T_DATE ? `new Date(${rv})` : ...
```

This fails for:
- European decimals: `1.234,56` (German) vs `1,234.56` (US)
- Non-ISO dates: `31/12/2024` (DD/MM/YYYY)

**Our approach:**
- Accept `locale` in schema per-column
- Provide pluggable parsers for number/date
- Default to ISO/US formats, configurable

---

## 4. Our Architecture Plan

```
packages/core/src/
├── parser/
│   ├── scanner.ts      — Low-level indexOf-based scanning
│   ├── parser.ts       — Main parse orchestrator
│   ├── worker.ts       — Web Worker entry point
│   ├── pool.ts         — Worker pool management
│   ├── chunker.ts      — Split files at newline boundaries
│   └── types.ts        — Parser-internal types (offsets, state)
│
├── validator/          — (Phase 2)
│   ├── validator.ts    — Validation engine
│   ├── rules.ts        — Built-in rule implementations
│   └── types.ts        — Re-exports from main types.ts
│
├── mapper/             — (Phase 3)
│   ├── mapper.ts       — Column mapping orchestrator
│   ├── fuzzy.ts        — Levenshtein/fuzzy string matching
│   └── types.ts        — Mapping-specific types
│
├── locale/             — (Phase 2)
│   ├── number.ts       — Locale-aware number parsing
│   ├── date.ts         — Locale-aware date parsing
│   └── types.ts        — Locale types
│
├── types.ts            — Public type definitions (existing)
└── index.ts            — Public exports
```

### 4.1 Parser Module Responsibilities

| File | Responsibility |
|------|----------------|
| `scanner.ts` | Low-level scanning: find delimiters, handle quotes, track offsets |
| `parser.ts` | Orchestrate parsing: schema handling, output formatting, callbacks |
| `worker.ts` | Web Worker entry: receive chunks, return parsed rows with offsets |
| `pool.ts` | Manage worker lifecycle, distribute chunks, merge results |
| `chunker.ts` | Split large strings at safe newline boundaries |
| `types.ts` | Internal types: `ScanState`, `ChunkResult`, `WorkerMessage` |

---

## 5. Key Design Decisions

### 5.1 indexOf-Based Scanning (like uDSV)

We will adopt uDSV's core scanning strategy:

```typescript
// Fast path: no quotes
const colEnd = csv.indexOf(delimiter, pos);
const rowEnd = csv.indexOf(newline, pos);

// Slow path: jump to next quote
const quoteEnd = csv.indexOf(quote, pos);
```

**Two-path strategy:**
1. Detect if quotes exist in first N bytes
2. Fast path: pure indexOf loops
3. Slow path: charCodeAt state machine with indexOf jumps

### 5.2 Offset Tables Instead of Eager Slicing

Unlike uDSV which slices strings immediately, we'll store offsets:

```typescript
interface FieldOffset {
    start: number;
    end: number;
    escaped: boolean;  // Needs quote unescape
}

type RowOffsets = FieldOffset[];
```

**Benefits:**
- Reduces string allocations during parsing
- Enables lazy field access (only slice when read)
- Validation can work on offsets without materializing strings
- Better cache locality for offset arrays

**Trade-off:** Extra indirection when accessing values. Mitigated by bulk materialization when needed.

### 5.3 Inline Validation Hooks

Validation runs during parsing, not as a separate pass:

```typescript
interface ParseOptions {
    onRow?: (row: string[], rowIndex: number) => ValidationError[];
    maxErrors?: number;
}

// Internal flow:
for each row:
    errors = onRow(row, idx)
    allErrors.push(...errors)
    if (allErrors.length >= maxErrors) break
```

**Benefits:**
- Single pass through data
- Early abort on error threshold
- No need to buffer all data before validating

### 5.4 Multi-Worker Chunk Parsing

For files exceeding threshold (default: ~50K rows):

```
┌─────────────────────────────────────────────────┐
│                   Main Thread                    │
│  1. Scan file, find chunk boundaries            │
│  2. Distribute chunks to workers                │
│  3. Collect results, merge in order             │
└─────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Worker 1│   │ Worker 2│   │ Worker 3│
    │ Rows 0- │   │ Rows N- │   │ Rows 2N-│
    │ N-1     │   │ 2N-1    │   │ 3N-1    │
    └─────────┘   └─────────┘   └─────────┘
```

**Chunk Boundary Detection:**
```typescript
function findChunkBoundary(csv: string, targetPos: number): number {
    // Scan backwards from targetPos to find newline
    // Must handle: quoted fields with newlines, \r\n vs \n
    let pos = targetPos;
    while (pos > 0 && csv[pos] !== '\n') pos--;
    return pos + 1;  // Start of next line
}
```

**Threshold Configuration:**
```typescript
interface ImporterOptions {
    workerThreshold?: number;  // Default: 50000 rows
    maxWorkers?: number;       // Default: navigator.hardwareConcurrency
}
```

### 5.5 Locale-Aware Parsing

Support for international number and date formats:

**Number Parsing:**
```typescript
interface NumberLocale {
    decimal: string;    // '.' or ','
    thousands: string;  // ',' or '.' or ' '
}

// Examples:
// US:     1,234.56  → { decimal: '.', thousands: ',' }
// German: 1.234,56  → { decimal: ',', thousands: '.' }
// French: 1 234,56  → { decimal: ',', thousands: ' ' }
```

**Date Parsing:**
```typescript
interface DateLocale {
    format: string;  // 'ISO' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | custom
}
```

**Per-Column Configuration:**
```typescript
const schema: Schema = {
    columns: {
        price: {
            type: 'number',
            locale: 'de-DE',  // German number format
        },
        date: {
            type: 'date',
            locale: 'en-GB',  // DD/MM/YYYY
        }
    }
};
```

---

## References

- [uDSV GitHub](https://github.com/leeoniya/uDSV)
- [RFC 4180 - CSV Format](https://tools.ietf.org/html/rfc4180)
- [LOC CSV Format Description](https://www.loc.gov/preservation/digital/formats/fdd/fdd000323.shtml)
