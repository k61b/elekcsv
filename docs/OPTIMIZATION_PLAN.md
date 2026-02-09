# Parser Optimization Plan

Based on profiling benchmark run on 100K rows × 10 cols (9.7 MB CSV).

## Current Performance

| Metric | @elekcsv | uDSV | Gap |
|--------|----------|------|-----|
| Total time | 61.1ms | 24.2ms | **2.53x slower** |
| Throughput | 1.6M rows/s | 4.1M rows/s | -2.5M rows/s |

**Gap to close: 36.9ms**

---

## Profile Breakdown

### Phase Analysis

| Phase | Time | % of Total |
|-------|------|------------|
| scan() | 32.4ms | 53% |
| materialization | 40.9ms | 67% |
| overhead | ~0ms | 0% |

> Note: Phases overlap slightly in timing due to measurement granularity.

### scan() Internal Breakdown

| Component | % of scan |
|-----------|-----------|
| indexOf calls | ~100% |
| Array growth | ~0% (minimal) |
| recordField/endRow calls | 1.1M invocations |
| Quote path | YES (slow path used) |

### Materialization Breakdown

| Component | % of materialization |
|-----------|----------------------|
| String.slice() | ~48% |
| indexOf escape check | ~47% |
| Row array allocation | ~5% |

---

## Key Bottlenecks (Ranked by Impact)

### 1. Escape Check in getFieldUnescaped() — HIGH IMPACT

**Problem:** Every field (1M calls) does `indexOf('""')` to check if unescaping is needed. This is 47% of materialization time (~19ms).

**Current code (scanner.ts:392-398):**
```typescript
export function getFieldUnescaped(...): string {
  const raw = getField(input, offsets, row, col, fieldCount);
  const escaped = quote + quote;
  if (raw.indexOf(escaped) === -1) {  // ← 1M indexOf calls!
    return raw;
  }
  return raw.replaceAll(escaped, quote);
}
```

**uDSV approach (uDSV.mjs:565-632):** Tracks `shouldRep` flag during parsing. Only fields that actually contain escaped quotes get the flag set. No indexOf check needed during materialization.

**Proposed fix:**
- Add a `hasEscapedQuotes` bit array during scan()
- Only call replaceAll() when bit is set
- Expected savings: ~15-18ms (skip 99% of indexOf calls)

**Impact: HIGH** | **Effort: MEDIUM**

---

### 2. Two-Pass Architecture — HIGH IMPACT

**Problem:** We iterate the input twice:
1. scan() builds Uint32Array offsets
2. parse() iterates offsets to build string[][]

uDSV does this in ONE pass — parse and materialize simultaneously.

**Current architecture:**
```
Input → scan() → offsets → getFieldUnescaped() × 1M → string[][]
         Pass 1              Pass 2
```

**uDSV architecture (uDSV.mjs:382-716):**
```
Input → parse() → string[][] directly
         Single pass: find delimiter → slice → assign to row[]
```

**Key uDSV technique (line 441-442):**
```javascript
let s = csvStr.slice(pos, pos2);
row[colIdx] = trim ? s.trim() : s;  // Direct assignment during parse
```

**Proposed fix:**
- Create new `parseFast()` function that builds strings during scan
- Eliminate offset arrays for the common case
- Keep scan() API for advanced use cases (lazy access, streaming)

**Impact: HIGH** | **Effort: HIGH**

---

### 3. Function Call Overhead — MEDIUM IMPACT

**Problem:** 1.1M function calls during scan():
- recordField(): 1,000,010 calls
- endRow(): 100,001 calls

These are closures with scope lookups.

**Current code (scanner.ts:89-112):**
```typescript
function recordField(start: number, end: number) {
  if (offsetIdx >= offsetCapacity * 2) growOffsets();
  offsets[offsetIdx++] = start;
  offsets[offsetIdx++] = end;
  currentRowFieldCount++;
}
```

**uDSV approach:** No helper functions — inline all operations in the main loop.

**Proposed fix:**
- Inline recordField() and endRow() into scanNoQuotes/scanWithQuotes
- Remove closure overhead

**Impact: MEDIUM** | **Effort: EASY**

---

### 4. Quote Path Detection — MEDIUM IMPACT

**Problem:** The synthetic CSV has quoted fields, triggering the slow path (`scanWithQuotes`). The slow path does character-by-character checks more often.

**Current check (scanner.ts:56):**
```typescript
const hasQuotes = input.indexOf(quote) !== -1;
```

If quotes exist ANYWHERE, entire file uses slow path — even if only 1% of fields are quoted.

**uDSV approach (uDSV.mjs:429):** Uses the slow path only when `colEncl !== ''`, but the path itself is more optimized with inline slicing.

**Proposed fix:**
- Optimize the quote path to be closer to the fast path
- Use indexOf jumps more aggressively inside quoted fields
- Consider hybrid: fast path per-field, switch to quote handling only when quote encountered

**Impact: MEDIUM** | **Effort: MEDIUM**

---

### 5. String.slice() Overhead — LOW IMPACT

**Problem:** 48% of materialization is in slice operations. This is fundamental — we need to extract substrings.

**Current code:**
```typescript
return input.slice(start, end);
```

**Analysis:** slice() is already highly optimized in V8 (copy-on-write for small strings). Hard to improve without changing the API.

**Possible optimizations:**
- Batch slicing (extract multiple fields at once)
- Return views/references instead of copies (API change)

**Impact: LOW** | **Effort: HIGH**

---

## Priority Ranking

| Priority | Optimization | Expected Savings | Effort |
|----------|--------------|------------------|--------|
| **1** | Escape check elimination | ~15-18ms | Medium |
| **2** | Single-pass parsing | ~10-15ms | High |
| **3** | Inline function calls | ~3-5ms | Easy |
| **4** | Quote path optimization | ~2-4ms | Medium |

### Recommended Approach

**Phase 1: Quick wins (close ~50% of gap)**
1. Eliminate escape check with bit tracking
2. Inline recordField/endRow

**Phase 2: Architecture change (close remaining gap)**
3. Implement single-pass `parseFast()`

---

## Implementation Notes

### Escape Check Elimination

Add a flags array during scan:
```typescript
interface ScanResult {
  offsets: Uint32Array;
  rowOffsets: Uint32Array;
  flags: Uint8Array;  // Bit 0: has escaped quotes
  // ...
}
```

Set flag when encountering `""` during scan (already detecting this in scanWithQuotes).

### Single-Pass Parsing

Create a streaming callback-based API similar to uDSV:
```typescript
function parseFast(input: string, each: (row: string[]) => boolean): void {
  // Build row[] array during scan, call each() per row
}
```

This matches uDSV's `parse(csvStr, schema, skip, each, withEOF)` pattern.

---

## Verification

After implementing optimizations, re-run benchmarks:
```bash
bun run bench          # Compare against uDSV
bun run bench:profile  # Verify phase improvements
bun run bench:correctness  # Ensure no regressions
```

Target: **< 1.5x slower than uDSV** (currently 2.53x)
