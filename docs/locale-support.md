# Locale-Aware Processing

elek supports locale-specific parsing and validation for dates, numbers, currency, phone numbers, and boolean values. This is essential for handling CSV exports from European systems or Turkish software.

## Built-in Locales

| Locale | Date Format | Number | Currency | Phone | Boolean |
|--------|-------------|--------|----------|-------|---------|
| `tr` | 25.01.2025 | 1.234,56 | 1.234,56 ₺ | +90 5XX XXX XX XX | evet/hayir |
| `en` | 01/25/2025 | 1,234.56 | $1,234.56 | +1 (XXX) XXX-XXXX | yes/no |
| `en-GB` | 25/01/2025 | 1,234.56 | £1,234.56 | +44 XXXX XXXXXX | yes/no |
| `de` | 25.01.2025 | 1.234,56 | 1.234,56 € | +49 XXX XXXXXXX | ja/nein |
| `fr` | 25/01/2025 | 1 234,56 | 1 234,56 € | +33 X XX XX XX XX | oui/non |

## Using Locales in Schema

```typescript
import { validate } from "@elekcsv/core";

// Set default locale for entire schema
const schema = {
  locale: "tr",  // All columns use Turkish locale
  columns: {
    name: { type: "string" },
    birthDate: { type: "date" },          // Parses "25.01.1990"
    salary: { type: "currency" },         // Parses "1.234,56 ₺"
    active: { type: "boolean" },          // Accepts "evet"/"hayir"
    phone: { type: "phone" },             // Validates +90 numbers
  },
};

// Override locale per column
const mixedSchema = {
  locale: "en",  // Default
  columns: {
    name: { type: "string" },
    trDate: { type: "date", locale: "tr" },  // Turkish dates
    usDate: { type: "date", locale: "en" },  // US dates
    deNumber: { type: "number", locale: "de" }, // German numbers
  },
};
```

## Date Formats by Locale

```typescript
// Turkish (tr)
"25.01.2025"  // DD.MM.YYYY
"25/01/2025"  // DD/MM/YYYY

// English US (en)
"01/25/2025"  // MM/DD/YYYY
"2025-01-25"  // YYYY-MM-DD (ISO)

// English UK (en-GB)
"25/01/2025"  // DD/MM/YYYY
"2025-01-25"  // YYYY-MM-DD (ISO)

// German (de)
"25.01.2025"  // DD.MM.YYYY
"2025-01-25"  // YYYY-MM-DD (ISO)

// French (fr)
"25/01/2025"  // DD/MM/YYYY
"2025-01-25"  // YYYY-MM-DD (ISO)
```

## Number Formats by Locale

```typescript
// Turkish & German (tr, de): dot for thousands, comma for decimal
"1.234,56"     // 1234.56
"-1.234,56"    // -1234.56
"1234,56"      // 1234.56

// English (en, en-GB): comma for thousands, dot for decimal
"1,234.56"     // 1234.56
"-1,234.56"    // -1234.56
"1234.56"      // 1234.56

// French (fr): space for thousands, comma for decimal
"1 234,56"     // 1234.56
"-1 234,56"    // -1234.56
```

## Currency Formats by Locale

```typescript
// Turkish (tr): ₺ or TL symbol
"1.234,56 ₺"
"₺1.234,56"
"1.234,56 TL"

// English US (en): $ prefix
"$1,234.56"
"$1234.56"

// English UK (en-GB): £ prefix
"£1,234.56"
"£1234.56"

// German (de): € suffix or prefix
"1.234,56 €"
"€1.234,56"

// French (fr): € suffix
"1 234,56 €"
```

## Boolean Values by Locale

```typescript
// Turkish (tr)
true:  "evet", "dogru", "e", "1", "true", "yes"
false: "hayir", "yanlis", "h", "0", "false", "no"

// English (en, en-GB)
true:  "true", "yes", "y", "1"
false: "false", "no", "n", "0"

// German (de)
true:  "ja", "wahr", "j", "1", "true", "yes"
false: "nein", "falsch", "n", "0", "false", "no"

// French (fr)
true:  "oui", "vrai", "o", "1", "true", "yes"
false: "non", "faux", "n", "0", "false", "no"
```

## Phone Number Validation

Phone validation checks digit count and country code:

```typescript
// Turkish (tr): +90 + 10 digits
"+90 532 123 45 67"
"0532 123 45 67"
"5321234567"

// US (en): +1 + 10 digits
"+1 (555) 123-4567"
"(555) 123-4567"
"5551234567"

// UK (en-GB): +44 + 10 digits
"+44 7911 123456"
"07911 123456"

// Germany (de): +49 + 10-11 digits
"+49 151 12345678"
"0151 12345678"

// France (fr): +33 + 9 digits
"+33 6 12 34 56 78"
"06 12 34 56 78"
```

## Registering Custom Locales

```typescript
import { registerLocale } from "@elekcsv/core";

registerLocale({
  id: "se",  // Swedish
  dateFormats: ["YYYY-MM-DD", "DD/MM/YYYY"],
  thousandsSeparator: " ",
  decimalSeparator: ",",
  currencySymbols: ["kr", "SEK"],
  currencyPosition: "suffix",
  phoneCountryCode: "+46",
  phonePatterns: [
    /^\+46\s?\d{2,3}\s?\d{6,7}$/,
    /^0\d{2,3}\s?\d{6,7}$/,
  ],
  phoneTotalDigits: 12,
  trueValues: ["ja", "sant", "1", "true", "yes"],
  falseValues: ["nej", "falskt", "0", "false", "no"],
});

// Now use it
const schema = {
  locale: "se",
  columns: {
    price: { type: "currency" },  // "1 234,56 kr"
    date: { type: "date" },       // "2025-01-25"
  },
};
```

## LocaleConfig Interface

```typescript
interface LocaleConfig {
  id: string;

  // Date
  dateFormats: string[];  // In priority order, e.g., ["DD.MM.YYYY", "DD/MM/YYYY"]

  // Number
  thousandsSeparator: string;  // "." for tr/de, "," for en, " " for fr
  decimalSeparator: string;    // "," for tr/de/fr, "." for en

  // Currency
  currencySymbols: string[];   // ["₺", "TL"] for tr
  currencyPosition: "prefix" | "suffix" | "both";

  // Phone
  phoneCountryCode: string;    // "+90" for tr
  phonePatterns: RegExp[];     // Validation patterns
  phoneTotalDigits: number;    // Expected total digits

  // Boolean
  trueValues: string[];        // ["evet", "dogru", "1"]
  falseValues: string[];       // ["hayir", "yanlis", "0"]
}
```

## Locale Utility Functions

```typescript
import {
  getLocale,
  hasLocale,
  getLocaleIds,
  parseDate,
  parseNumber,
  parseCurrency,
  parsePhone,
  parseBoolean,
  normalizeDateToISO,
  normalizeNumber,
  normalizeCurrency,
  normalizePhone,
  normalizeBoolean,
} from "@elekcsv/core";

// Check if locale exists
hasLocale("tr");  // true
hasLocale("xx");  // false

// Get all locale IDs
getLocaleIds();  // ["tr", "en", "en-US", "en-GB", "de", "fr"]

// Get locale config
const tr = getLocale("tr");
console.log(tr.dateFormats);  // ["DD.MM.YYYY", "DD/MM/YYYY"]

// Parse values
parseDate("25.01.2025", "tr");     // { day: 25, month: 1, year: 2025 }
parseNumber("1.234,56", "tr");     // 1234.56
parseCurrency("1.234,56 ₺", "tr"); // 1234.56
parsePhone("0532 123 4567", "tr"); // "+905321234567"
parseBoolean("evet", "tr");        // true

// Normalize to standard format
normalizeDateToISO("25.01.2025", "tr");  // "2025-01-25"
normalizeNumber("1.234,56", "tr");       // "1234.56"
normalizeCurrency("1.234,56 ₺", "tr");   // "1234.56"
normalizePhone("0532 123 4567", "tr");   // "+905321234567"
normalizeBoolean("evet", "tr");          // "true"
```

## Complete Example: Turkish E-Commerce Data

```typescript
import { parse, mapColumns, applyMapping, validate } from "@elekcsv/core";

const csv = `Urun,Fiyat,Tarih,Stok,Aktif
Laptop,15.999,00 ₺,25.01.2025,50,evet
Telefon,7.499,00 ₺,20.01.2025,100,evet
Tablet,4.999,00 ₺,15.01.2025,0,hayir`;

const { headers, rows } = parse(csv);

const schema = {
  locale: "tr",
  columns: {
    product: {
      type: "string",
      rules: [{ rule: "required" }],
      aliases: ["urun"],
    },
    price: {
      type: "currency",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["fiyat"],
    },
    date: {
      type: "date",
      aliases: ["tarih"],
    },
    stock: {
      type: "integer",
      rules: [{ rule: "min", value: 0 }],
      aliases: ["stok"],
    },
    active: {
      type: "boolean",
      aliases: ["aktif"],
    },
  },
};

const mapping = mapColumns(headers!, schema);
const mappedData = applyMapping([headers!, ...rows], mapping.mappings, schema);
const result = validate(mappedData.slice(1), schema);

console.log(result.valid);  // true
```
