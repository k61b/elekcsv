# Examples

Complete, copy-pasteable code examples for common elek use cases.

## Example 1: Basic CSV Import

Simple CSV parsing with validation.

```typescript
import { parse, validate } from "@elekcsv/core";

const csv = `name,email,age
Omer,omer@example.com,25
Sebnem,sebnem@example.com,30
Ayse,invalid-email,28`;

// Parse CSV
const { headers, rows } = parse(csv, { header: true });

// Define schema
const schema = {
  columns: {
    name: { type: "string", rules: [{ rule: "required" }] },
    email: { type: "string", rules: [{ rule: "email" }] },
    age: { type: "integer", rules: [{ rule: "min", value: 0 }] },
  },
};

// Validate
const result = validate(rows, schema);

console.log("Valid:", result.valid);  // false
console.log("Errors:", result.errors.length);  // 1

result.errors.forEach(e => {
  console.log(`Row ${e.row + 1}: ${e.field} - ${e.message}`);
});
// Row 3: email - Invalid email format
```

## Example 2: Turkish E-Commerce Data

Handling Turkish locale for dates, currency, and boolean values.

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

const csv = `Urun Adi,Fiyat,Eklenme Tarihi,Stokta,Kategori
Laptop,15.999,00 ₺,25.01.2025,evet,Elektronik
Telefon,7.499,50 ₺,20.01.2025,evet,Elektronik
Masa,2.500,00 ₺,15.01.2025,hayir,Mobilya
Sandalye,899,00 ₺,10.01.2025,evet,Mobilya`;

const { headers, rows } = parse(csv);

const schema = {
  locale: "tr",
  columns: {
    productName: {
      type: "string",
      rules: [{ rule: "required" }, { rule: "maxLength", value: 100 }],
      aliases: ["urun adi", "urun", "adi"],
    },
    price: {
      type: "currency",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["fiyat", "ucret"],
    },
    addedDate: {
      type: "date",
      aliases: ["eklenme tarihi", "tarih"],
    },
    inStock: {
      type: "boolean",
      aliases: ["stokta", "stok"],
    },
    category: {
      type: "string",
      rules: [{ rule: "enum", values: ["Elektronik", "Mobilya", "Giyim", "Gida"] }],
      aliases: ["kategori"],
    },
  },
};

// Map columns
const mapping = mapColumns(headers!, schema);
console.log(`Auto-mapped: ${mapping.autoMapped} columns`);

// Apply mapping and validate
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);
const result = validate(mappedData.slice(1), schema);

console.log(`Valid: ${result.valid}`);
console.log(`Total rows: ${result.stats.totalRows}`);
console.log(`Valid rows: ${result.stats.validRows}`);
```

## Example 3: Multi-Locale Support

Same validation logic with different regional formats.

```typescript
import { parse, validate, registerLocale } from "@elekcsv/core";

// Sample data in different formats
const turkishCSV = `tarih,fiyat
25.01.2025,1.234,56`;

const americanCSV = `date,price
01/25/2025,"1,234.56"`;

const germanCSV = `datum,preis
25.01.2025,1.234,56`;

// Same schema structure, different locales
function validateWithLocale(csv: string, locale: string) {
  const { rows } = parse(csv, { header: true });

  const schema = {
    locale,
    columns: {
      date: { type: "date" },
      price: { type: "number" },
    },
  };

  return validate(rows, schema);
}

console.log("Turkish:", validateWithLocale(turkishCSV, "tr").valid);   // true
console.log("American:", validateWithLocale(americanCSV, "en").valid); // true
console.log("German:", validateWithLocale(germanCSV, "de").valid);     // true
```

## Example 4: Large File with Bitmap Validation

Processing 100K+ rows efficiently.

```typescript
import { parse, mapColumns, applyMapping, validateBitmap } from "@elekcsv/core";

async function processLargeFile(csvContent: string) {
  console.log("Starting import...");
  const startTime = performance.now();

  // 1. Parse
  const parseStart = performance.now();
  const { headers, rows } = parse(csvContent, { header: true });
  console.log(`Parse: ${(performance.now() - parseStart).toFixed(0)}ms, ${rows.length} rows`);

  // 2. Schema
  const schema = {
    columns: {
      id: { type: "string", rules: [{ rule: "required" }, { rule: "unique" }] },
      name: { type: "string", rules: [{ rule: "required" }] },
      email: { type: "string", rules: [{ rule: "email" }] },
      status: { type: "string", rules: [{ rule: "enum", values: ["active", "inactive"] }] },
    },
  };

  // 3. Map columns
  const mapStart = performance.now();
  const mapping = mapColumns(headers!, schema);
  console.log(`Map: ${(performance.now() - mapStart).toFixed(0)}ms`);

  // 4. Apply mapping
  const applyStart = performance.now();
  const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);
  console.log(`Apply: ${(performance.now() - applyStart).toFixed(0)}ms`);

  // 5. Validate with bitmap (recommended for large files)
  const validateStart = performance.now();
  const result = validateBitmap(mappedData.slice(1), schema);
  console.log(`Validate: ${(performance.now() - validateStart).toFixed(0)}ms`);

  // 6. Report
  console.log(`\nResults:`);
  console.log(`  Valid: ${result.valid}`);
  console.log(`  Error count: ${result.errorCount}`);
  console.log(`  Rows with errors: ${result.getErrorRowCount()}`);
  console.log(`  Memory: ${(result.getMemoryUsage().total / 1024).toFixed(0)}KB`);
  console.log(`  Total time: ${(performance.now() - startTime).toFixed(0)}ms`);

  // 7. Error summary
  const summary = result.getErrorSummary();
  console.log(`\nErrors by rule:`);
  Object.entries(summary).forEach(([rule, count]) => {
    console.log(`  ${rule}: ${count}`);
  });

  // 8. Sample errors
  console.log(`\nFirst 5 errors:`);
  result.getErrors({ limit: 5 }).forEach(e => {
    console.log(`  Row ${e.row + 1}, ${e.field}: ${e.value} - ${e.message}`);
  });

  return result;
}
```

## Example 5: React File Upload Flow

Complete React component for CSV import.

```tsx
import { useCSVImporter } from "@elekcsv/react";
import type { Schema } from "@elekcsv/core";

const schema: Schema = {
  locale: "tr",
  columns: {
    name: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["ad", "isim", "ad soyad"],
    },
    email: {
      type: "string",
      rules: [{ rule: "required" }, { rule: "email" }],
      aliases: ["e-posta", "mail"],
    },
    phone: {
      type: "phone",
      aliases: ["telefon", "tel"],
    },
    birthDate: {
      type: "date",
      aliases: ["dogum tarihi", "tarih"],
    },
  },
};

export function CSVImporter() {
  const {
    step,
    state,
    isLoading,
    hasErrors,
    canGoBack,
    loadFile,
    updateMapping,
    confirmMapping,
    accept,
    reset,
    goBack,
    getErrors,
    getErrorSummary,
  } = useCSVImporter({
    schema,
    autoMap: true,
    autoMapThreshold: 0.8,
    onComplete: (result) => {
      console.log("Import complete!");
      console.log("Rows:", result.data.length);
      console.log("Valid:", result.stats.validRows);
      // Send to API, update state, etc.
    },
    onError: (error) => {
      alert(`Import failed: ${error}`);
    },
  });

  // Step: Idle - File Upload
  if (step === "idle") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Import CSV</h2>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
        <p style={{ color: "#666", marginTop: 10 }}>
          Expected columns: name, email, phone, birthDate
        </p>
      </div>
    );
  }

  // Step: Parsing
  if (step === "parsing") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Parsing...</h2>
        <p>Reading file...</p>
      </div>
    );
  }

  // Step: Mapping
  if (step === "mapping" && state.mapping) {
    const schemaColumns = Object.keys(schema.columns);

    return (
      <div style={{ padding: 20 }}>
        <h2>Column Mapping</h2>
        <p>
          Auto-mapped: {state.mapping.autoMapped} |
          Needs review: {state.mapping.needsReview} |
          Unmapped: {state.mapping.unmapped}
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", margin: "20px 0" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ padding: 10, textAlign: "left" }}>CSV Column</th>
              <th style={{ padding: 10, textAlign: "left" }}>Maps To</th>
              <th style={{ padding: 10, textAlign: "left" }}>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {state.mapping.mappings.map((m, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 10 }}>{m.csvHeader || "(empty)"}</td>
                <td style={{ padding: 10 }}>
                  <select
                    value={m.schemaColumn}
                    onChange={(e) => updateMapping(i, e.target.value || null)}
                    style={{ padding: 5, width: 150 }}
                  >
                    <option value="">-- Skip --</option>
                    {schemaColumns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 10 }}>
                  <span style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: m.confidence === "exact" ? "#c8e6c9" :
                               m.confidence === "alias" ? "#e3f2fd" :
                               m.confidence === "fuzzy" ? "#fff3e0" : "#f5f5f5",
                  }}>
                    {m.confidence} ({(m.score * 100).toFixed(0)}%)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 10 }}>
          {canGoBack && (
            <button onClick={goBack} style={{ padding: "10px 20px" }}>
              Back
            </button>
          )}
          <button
            onClick={confirmMapping}
            style={{ padding: "10px 20px", background: "#1976d2", color: "white", border: "none" }}
          >
            Confirm Mapping
          </button>
        </div>
      </div>
    );
  }

  // Step: Validating
  if (step === "validating") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Validating...</h2>
        <p>Checking {state.rowCount} rows...</p>
      </div>
    );
  }

  // Step: Review
  if (step === "review") {
    const errors = getErrors({ limit: 20 });
    const summary = getErrorSummary();

    return (
      <div style={{ padding: 20 }}>
        <h2>Validation Results</h2>

        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          <div style={{ padding: 15, background: "#f5f5f5", borderRadius: 8 }}>
            <div style={{ fontSize: 24, fontWeight: "bold" }}>{state.rowCount}</div>
            <div style={{ color: "#666" }}>Total Rows</div>
          </div>
          <div style={{ padding: 15, background: hasErrors ? "#ffebee" : "#e8f5e9", borderRadius: 8 }}>
            <div style={{ fontSize: 24, fontWeight: "bold" }}>{errors.length}</div>
            <div style={{ color: "#666" }}>Errors</div>
          </div>
        </div>

        {Object.keys(summary).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3>Error Summary</h3>
            <ul>
              {Object.entries(summary).map(([rule, count]) => (
                <li key={rule}>{rule}: {count}</li>
              ))}
            </ul>
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3>Errors (first 20)</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Row</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Column</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Value</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{e.row + 1}</td>
                    <td style={{ padding: 8 }}>{e.field}</td>
                    <td style={{ padding: 8, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.value || "(empty)"}
                    </td>
                    <td style={{ padding: 8 }}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {canGoBack && (
            <button onClick={goBack} style={{ padding: "10px 20px" }}>
              Back to Mapping
            </button>
          )}
          <button
            onClick={accept}
            style={{ padding: "10px 20px", background: "#4caf50", color: "white", border: "none" }}
          >
            {hasErrors ? "Accept with Errors" : "Complete Import"}
          </button>
        </div>
      </div>
    );
  }

  // Step: Complete
  if (step === "complete") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Import Complete!</h2>
        <p>
          Successfully processed {state.rowCount} rows in{" "}
          {((state.parseTime || 0) + (state.validationTime || 0)).toFixed(0)}ms
        </p>
        <button
          onClick={reset}
          style={{ padding: "10px 20px", marginTop: 20 }}
        >
          Import Another File
        </button>
      </div>
    );
  }

  // Step: Error
  if (step === "error") {
    return (
      <div style={{ padding: 20 }}>
        <h2 style={{ color: "#d32f2f" }}>Import Failed</h2>
        <p>{state.error}</p>
        <button onClick={reset} style={{ padding: "10px 20px", marginTop: 20 }}>
          Try Again
        </button>
      </div>
    );
  }

  return null;
}
```

## Example 6: Custom Validation Rules

Using custom functions for complex validation.

```typescript
import { parse, validate } from "@elekcsv/core";

const csv = `code,iban,vat_number
TR-001,TR330006100519786457841326,TR1234567890
TR-002,DE89370400440532013000,DE123456789
XX-003,INVALID,XX999`;

const { headers, rows } = parse(csv);

const schema = {
  columns: {
    code: {
      type: "string",
      rules: [
        { rule: "required" },
        {
          rule: "custom",
          fn: (value) => /^TR-\d{3}$/.test(value),
          message: "Code must be TR-XXX format",
        },
      ],
    },
    iban: {
      type: "string",
      rules: [
        { rule: "required" },
        {
          rule: "custom",
          fn: (value) => {
            // Basic IBAN validation
            const cleaned = value.replace(/\s/g, "");
            return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleaned);
          },
          message: "Invalid IBAN format",
        },
      ],
    },
    vat_number: {
      type: "string",
      rules: [
        {
          rule: "custom",
          fn: (value) => {
            if (!value) return true;  // Optional field
            // Simple VAT pattern: 2 letters + 8-12 digits
            return /^[A-Z]{2}\d{8,12}$/.test(value);
          },
          message: "Invalid VAT number format",
        },
      ],
    },
  },
};

const result = validate(rows, schema);

result.errors.forEach(e => {
  console.log(`Row ${e.row + 1}, ${e.field}: ${e.message}`);
});
// Row 3, code: Code must be TR-XXX format
// Row 3, iban: Invalid IBAN format
```
