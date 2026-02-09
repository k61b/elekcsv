# @elekcsv/core

CSV parsing, validation, and transformation engine.

## Installation

```bash
bun add @elekcsv/core
```

## Usage

```typescript
import { parse } from '@elekcsv/core'

const result = parse(csvString)
// result.headers  → ['name', 'age', 'city']
// result.rows     → [['Alice', '30', 'NYC'], ...]
// result.rowCount → 100000
```

## API

### Parsing

#### `parse(input: string, options?): ParseResult`

Parse a CSV string using a code-generated optimized parser.

```typescript
import { parse } from '@elekcsv/core'

const result = parse(`name,age,city
Alice,30,NYC
Bob,25,LA`)

console.log(result.headers)  // ['name', 'age', 'city']
console.log(result.rows[0])  // ['Alice', '30', 'NYC']
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delimiter` | `string` | `','` | Field delimiter |
| `quote` | `string` | `'"'` | Quote character |
| `header` | `boolean` | `true` | Treat first row as header |
| `skipEmptyLines` | `boolean` | `false` | Skip rows where all fields are empty |

#### `compileParser(sample: string, options?): CompiledParser`

Pre-compile a parser for a specific CSV shape.

#### `clearParserCache(): void`

Clear the internal parser cache.

### Types

The package exports comprehensive types for building CSV importers:

```typescript
import type {
  // Parsing
  ParseOptions,
  ParseResult,
  CompiledParser,

  // Schema & Validation
  Schema,
  ColumnDef,
  ColumnType,
  Rule,
  ValidationError,
  ValidationResult,
  ValidationStats,

  // Importer
  ImporterState,
  ImporterOptions,
  ImporterResult,
  ColumnMapping,
  ProgressInfo,
  OnProgressCallback,

  // Error codes
  ErrorCode,
  ERROR_CODES,
} from '@elekcsv/core'
```

## License

Apache-2.0
