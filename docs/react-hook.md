# React Integration - useCSVImporter

The `@elekcsv/react` package provides a headless React hook for building CSV import interfaces. It manages the entire import flow: file loading, parsing, column mapping, validation, and result handling.

## Installation

```bash
npm install @elekcsv/react
# or
pnpm add @elekcsv/react
```

`@elekcsv/react` has `@elekcsv/core` as a peer dependency.

## Basic Usage

```typescript
import { useCSVImporter } from "@elekcsv/react";

function CSVImporter() {
  const importer = useCSVImporter({
    schema: {
      columns: {
        name: { type: "string", rules: [{ rule: "required" }] },
        email: { type: "string", rules: [{ rule: "email" }] },
        age: { type: "integer" },
      },
    },
    onComplete: (result) => {
      console.log("Import complete:", result.data);
    },
  });

  return (
    <div>
      {importer.step === "idle" && (
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importer.loadFile(file);
          }}
        />
      )}

      {importer.step === "mapping" && (
        <div>
          <h2>Column Mapping</h2>
          <p>Auto-mapped: {importer.state.mapping?.autoMapped}</p>
          <button onClick={importer.confirmMapping}>Confirm</button>
        </div>
      )}

      {importer.step === "review" && (
        <div>
          <h2>Validation Results</h2>
          <p>Rows: {importer.state.rowCount}</p>
          <p>Errors: {importer.getErrors().length}</p>
          <button onClick={importer.accept}>Accept</button>
        </div>
      )}

      {importer.step === "complete" && (
        <div>
          <h2>Done!</h2>
          <button onClick={importer.reset}>Import Another</button>
        </div>
      )}

      {importer.isLoading && <p>Processing...</p>}
    </div>
  );
}
```

## Hook Options

```typescript
interface UseCSVImporterOptions {
  // Required
  schema: Schema;

  // Behavior
  autoMap?: boolean;           // Auto-skip mapping if high confidence (default: true)
  autoMapThreshold?: number;   // Confidence threshold for auto-map (default: 0.8)
  maxPreviewRows?: number;     // Rows to include in preview (default: 10)
  maxRows?: number;            // Max rows to process (optional)
  locale?: string;             // Override schema locale

  // Callbacks
  onComplete?: (result: ImportResult) => void;
  onError?: (error: string) => void;
  onStepChange?: (step: ImporterStep) => void;

  // Parser options
  delimiter?: string;          // CSV delimiter (default: ",")
  quote?: string;              // Quote character (default: '"')
}
```

## Hook Return Value

```typescript
interface UseCSVImporterReturn {
  // State
  state: ImporterState;        // Full state object
  step: ImporterStep;          // Current step shorthand

  // Computed
  isLoading: boolean;          // True during parsing/validating
  isComplete: boolean;         // True when step === "complete"
  hasErrors: boolean;          // True if validation found errors
  canGoBack: boolean;          // True if goBack() is available
  canGoForward: boolean;       // True if forward action available

  // Actions
  loadFile: (file: File) => void;
  loadString: (content: string, fileName?: string) => void;
  updateMapping: (csvIndex: number, schemaColumn: string | null) => void;
  confirmMapping: () => void;
  accept: () => void;
  reset: () => void;
  goBack: () => void;

  // Data accessors
  getErrors: (options?: { limit?: number; offset?: number }) => ValidationError[];
  getRowErrors: (row: number) => ValidationError[];
  getCellError: (row: number, col: number) => ValidationError | null;
  getErrorSummary: () => Record<string, number>;
}
```

## State Machine Steps

```
     +---------+
     |  idle   |  <-- reset()
     +----+----+
          | loadFile() / loadString()
          v
     +---------+
     | parsing |
     +----+----+
          | success
          v
     +---------+
     | mapping |  <-- goBack() from review
     +----+----+
          | confirmMapping() / autoMap
          v
     +------------+
     | validating |
     +-----+------+
           | success
           v
     +--------+
     | review |  <-- goBack() from complete
     +----+---+
          | accept()
          v
     +----------+
     | complete |
     +----------+
```

## ImporterState

```typescript
interface ImporterState {
  step: ImporterStep;

  // Parse results
  rawData: string[][] | null;       // Parsed data (without header)
  headers: string[] | null;         // CSV headers
  preview: string[][] | null;       // First 10 rows for preview
  rowCount: number;                 // Total data rows

  // Mapping results
  mapping: MappingResult | null;    // Column mapping
  mappedData: string[][] | null;    // Data reordered to schema

  // Validation results
  validation: ValidationResult | null;
  bitmapValidation: BitmapValidationResult | null;

  // File info
  file: File | null;
  fileName: string | null;
  fileSize: number | null;

  // Performance
  parseTime: number | null;
  validationTime: number | null;
  progress: number;                 // 0-100

  // Error
  error: string | null;
}

type ImporterStep =
  | "idle"
  | "parsing"
  | "mapping"
  | "validating"
  | "review"
  | "complete"
  | "error";
```

## Complete Example with Mapping UI

```tsx
import { useCSVImporter } from "@elekcsv/react";
import type { Schema } from "@elekcsv/core";

const schema: Schema = {
  locale: "tr",
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
    birthDate: {
      type: "date",
      aliases: ["dogum tarihi", "tarih"],
    },
  },
};

function CSVImporter() {
  const {
    step,
    state,
    isLoading,
    loadFile,
    updateMapping,
    confirmMapping,
    accept,
    reset,
    goBack,
    canGoBack,
    getErrors,
    getErrorSummary,
  } = useCSVImporter({
    schema,
    autoMap: true,
    onComplete: (result) => {
      console.log("Imported rows:", result.data.length);
      console.log("Valid rows:", result.stats.validRows);
    },
    onError: (error) => {
      console.error("Import error:", error);
    },
  });

  // Step: Idle - File selection
  if (step === "idle") {
    return (
      <div>
        <h2>Upload CSV</h2>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
      </div>
    );
  }

  // Step: Parsing
  if (step === "parsing") {
    return <div>Parsing file...</div>;
  }

  // Step: Mapping - Show column matches
  if (step === "mapping" && state.mapping) {
    const schemaColumns = Object.keys(schema.columns);

    return (
      <div>
        <h2>Column Mapping</h2>
        <p>
          Auto-mapped: {state.mapping.autoMapped} |
          Needs review: {state.mapping.needsReview} |
          Unmapped: {state.mapping.unmapped}
        </p>

        <table>
          <thead>
            <tr>
              <th>CSV Column</th>
              <th>Maps To</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {state.mapping.mappings.map((m, i) => (
              <tr key={i}>
                <td>{m.csvHeader}</td>
                <td>
                  <select
                    value={m.schemaColumn}
                    onChange={(e) => updateMapping(i, e.target.value || null)}
                  >
                    <option value="">-- Not mapped --</option>
                    {schemaColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{m.confidence} ({(m.score * 100).toFixed(0)}%)</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={confirmMapping}>Confirm Mapping</button>
      </div>
    );
  }

  // Step: Validating
  if (step === "validating") {
    return <div>Validating data...</div>;
  }

  // Step: Review - Show errors
  if (step === "review") {
    const errors = getErrors({ limit: 20 });
    const summary = getErrorSummary();

    return (
      <div>
        <h2>Validation Results</h2>
        <p>
          Total rows: {state.rowCount} |
          Errors: {errors.length}
        </p>

        <h3>Error Summary</h3>
        <ul>
          {Object.entries(summary).map(([rule, count]) => (
            <li key={rule}>{rule}: {count}</li>
          ))}
        </ul>

        <h3>Errors (first 20)</h3>
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Column</th>
              <th>Value</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e, i) => (
              <tr key={i}>
                <td>{e.row + 1}</td>
                <td>{e.field}</td>
                <td>{e.value}</td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          {canGoBack && <button onClick={goBack}>Back</button>}
          <button onClick={accept}>Accept & Complete</button>
        </div>
      </div>
    );
  }

  // Step: Complete
  if (step === "complete") {
    return (
      <div>
        <h2>Import Complete!</h2>
        <p>
          Processed {state.rowCount} rows in{" "}
          {((state.parseTime || 0) + (state.validationTime || 0)).toFixed(0)}ms
        </p>
        <button onClick={reset}>Import Another File</button>
      </div>
    );
  }

  // Step: Error
  if (step === "error") {
    return (
      <div>
        <h2>Error</h2>
        <p>{state.error}</p>
        <button onClick={reset}>Try Again</button>
      </div>
    );
  }

  return null;
}
```

## Loading CSV from String

```typescript
const importer = useCSVImporter({ schema });

// Load from string (e.g., from API or clipboard)
importer.loadString(csvContent, "data.csv");
```

## State Machine Utilities

For advanced use cases, you can access the state machine utilities:

```typescript
import {
  importerReducer,
  createInitialState,
  isValidTransition,
  canGoBack,
  canGoForward,
  getBackSteps,
} from "@elekcsv/react";

// Create a fresh state
const state = createInitialState();

// Check valid transitions
isValidTransition("mapping", "validating");  // true
isValidTransition("idle", "complete");        // false

// Navigation helpers
canGoBack("review");     // true
canGoForward("mapping"); // true
getBackSteps("review");  // ["mapping"]
```
