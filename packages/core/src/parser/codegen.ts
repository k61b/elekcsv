import type { ParseOptions } from "../types";

// ============================================================================
// Types
// ============================================================================

export interface ParseResult {
	/** Header row field names, if header:true (default) */
	headers: string[] | null;
	/** Data rows as string arrays */
	rows: string[][];
	/** Total data rows (excluding header if header:true) */
	rowCount: number;
	/** Fields per row */
	fieldCount: number;
}

export interface CompiledParser {
	/** Generated parse function that returns rows starting from position */
	fn: (input: string, startPos: number) => string[][];
	/** Number of fields per row (detected from first row) */
	fieldCount: number;
	/** Whether the sample contained quote characters */
	hasQuotes: boolean;
	/** Detected line ending: '\n' or '\r\n' */
	lineEnding: string;
}

interface SchemaInfo {
	fieldCount: number;
	hasQuotes: boolean;
	lineEnding: string;
	delimiter: string;
	quote: string;
}

// ============================================================================
// Cache
// ============================================================================

const cache = new Map<string, CompiledParser>();

function getCacheKey(info: SchemaInfo): string {
	return `${info.delimiter}-${info.quote}-${info.fieldCount}-${info.hasQuotes}-${info.lineEnding}`;
}

// ============================================================================
// Schema Detection
// ============================================================================

function detectSchema(sample: string, options?: ParseOptions): SchemaInfo {
	const delimiter = options?.delimiter ?? ",";
	const quote = options?.quote ?? '"';

	const firstNl = sample.indexOf("\n");
	const firstLine = firstNl === -1 ? sample : sample.slice(0, firstNl);

	// Detect line ending
	const lineEnding = firstNl > 0 && sample.charCodeAt(firstNl - 1) === 13 ? "\r\n" : "\n";

	// Count fields from first line (simple count of delimiters + 1)
	// Handle quoted fields in the first line for accurate count
	let fieldCount = 1;
	let inQuote = false;
	const quoteCode = quote.charCodeAt(0);
	const delimCode = delimiter.charCodeAt(0);

	for (let i = 0; i < firstLine.length; i++) {
		const c = firstLine.charCodeAt(i);
		if (c === quoteCode) {
			inQuote = !inQuote;
		} else if (c === delimCode && !inQuote) {
			fieldCount++;
		}
	}

	// Check if quotes exist anywhere in the sample
	const hasQuotes = sample.indexOf(quote) !== -1;

	return { fieldCount, hasQuotes, lineEnding, delimiter, quote };
}

// ============================================================================
// Code Generators
// ============================================================================

/**
 * Build unrolled parser for CSVs without quoted fields.
 * This is the fast path - no quote checking needed.
 */
function buildUnquotedParser(fieldCount: number, delimiter: string, lineEnding: string): string {
	const delimEsc = JSON.stringify(delimiter);
	const lastColIdx = fieldCount - 1;

	// Use \n for finding lines, then handle \r if present
	let body = `
var rows = [];
var pos = start;
var len = input.length;
`;

	if (fieldCount === 1) {
		// Single column CSV - just split by newlines
		body += `
while (pos < len) {
  var nl = input.indexOf('\\n', pos);
  if (nl === -1) {
    var endPos = len;
    if (endPos > pos && input.charCodeAt(endPos - 1) === 13) endPos--;
    rows.push([input.slice(pos, endPos)]);
    break;
  }
  var endPos = nl;
  if (nl > pos && input.charCodeAt(nl - 1) === 13) endPos--;
  rows.push([input.slice(pos, endPos)]);
  pos = nl + 1;
}
return rows;
`;
		return body;
	}

	// Generate unrolled column parsing
	body += `
while (pos < len) {
`;

	// Generate indexOf for each column delimiter
	for (let i = 0; i < lastColIdx; i++) {
		if (i === 0) {
			body += `  var c${i} = input.indexOf(${delimEsc}, pos);\n`;
		} else {
			body += `  var c${i} = input.indexOf(${delimEsc}, c${i - 1} + 1);\n`;
		}
		body += `  if (c${i} === -1) {\n`;
		// Incomplete row - take remaining as last field value
		body += "    var remaining = input.slice(pos);\n";
		body += "    if (remaining.length > 0) {\n";
		body += "      var endPos = remaining.length;\n";
		body += "      if (remaining.charCodeAt(endPos - 1) === 10) endPos--;\n";
		body += "      if (endPos > 0 && remaining.charCodeAt(endPos - 1) === 13) endPos--;\n";
		body += "      if (endPos > 0) rows.push([remaining.slice(0, endPos)]);\n";
		body += "    }\n";
		body += "    return rows;\n  }\n";
	}

	// Find end of row (newline)
	body += `  var nl = input.indexOf('\\n', c${lastColIdx - 1} + 1);\n`;
	body += "  if (nl === -1) {\n";
	// Last row without trailing newline
	body += "    var lastEnd = len;\n";
	body += "    if (lastEnd > 0 && input.charCodeAt(lastEnd - 1) === 13) lastEnd--;\n";
	body += "    rows.push([";
	for (let i = 0; i < fieldCount; i++) {
		if (i > 0) body += ", ";
		if (i === 0) {
			body += "input.slice(pos, c0)";
		} else if (i === lastColIdx) {
			body += `input.slice(c${i - 1} + 1, lastEnd)`;
		} else {
			body += `input.slice(c${i - 1} + 1, c${i})`;
		}
	}
	body += "]);\n    break;\n  }\n";

	// Complete row - check for \r before \n
	body += "  var rowEnd = nl;\n";
	body += "  if (nl > 0 && input.charCodeAt(nl - 1) === 13) rowEnd--;\n";
	body += "  rows.push([";
	for (let i = 0; i < fieldCount; i++) {
		if (i > 0) body += ", ";
		if (i === 0) {
			body += "input.slice(pos, c0)";
		} else if (i === lastColIdx) {
			body += `input.slice(c${i - 1} + 1, rowEnd)`;
		} else {
			body += `input.slice(c${i - 1} + 1, c${i})`;
		}
	}
	body += "]);\n";
	body += "  pos = nl + 1;\n";
	body += "}\nreturn rows;\n";

	return body;
}

/**
 * Build parser for CSVs with quoted fields.
 * Uses a more careful approach - checks for quote at field start.
 */
function buildQuotedParser(fieldCount: number, delimiter: string, quote: string): string {
	const delimEsc = JSON.stringify(delimiter);
	const quoteEsc = JSON.stringify(quote);
	const quoteCode = quote.charCodeAt(0);
	const delimCode = delimiter.charCodeAt(0);
	const escaped = quote + quote;
	const escapedEsc = JSON.stringify(escaped);

	const body = `
var rows = [];
var pos = start;
var len = input.length;
var escaped = ${escapedEsc};
var quoteChar = ${quoteEsc};
var QUOTE = ${quoteCode};
var DELIM = ${delimCode};
var LF = 10;
var CR = 13;

function extractQuoted(startPos) {
  var p = startPos + 1;
  var hasEscaped = false;
  while (p < len) {
    var nextQuote = input.indexOf(quoteChar, p);
    if (nextQuote === -1) {
      return [input.slice(startPos + 1), len];
    }
    if (nextQuote + 1 < len && input.charCodeAt(nextQuote + 1) === QUOTE) {
      hasEscaped = true;
      p = nextQuote + 2;
      continue;
    }
    var value = input.slice(startPos + 1, nextQuote);
    if (hasEscaped) value = value.replaceAll(escaped, quoteChar);
    return [value, nextQuote + 1];
  }
  return [input.slice(startPos + 1), len];
}

while (pos < len) {
  var row = new Array(${fieldCount});
  var colIdx = 0;

  while (colIdx < ${fieldCount} && pos < len) {
    var c = input.charCodeAt(pos);

    if (c === QUOTE) {
      var result = extractQuoted(pos);
      row[colIdx] = result[0];
      pos = result[1];

      if (pos < len) {
        c = input.charCodeAt(pos);
        if (c === DELIM) {
          pos++;
          colIdx++;
          continue;
        }
        if (c === LF) {
          pos++;
          colIdx++;
          break;
        }
        if (c === CR) {
          pos++;
          if (pos < len && input.charCodeAt(pos) === LF) pos++;
          colIdx++;
          break;
        }
        pos++;
      }
      colIdx++;
    } else {
      var nextDelim = input.indexOf(${delimEsc}, pos);
      var nextLf = input.indexOf('\\n', pos);

      var isLastCol = colIdx === ${fieldCount - 1};

      if (isLastCol) {
        if (nextLf === -1) {
          var endPos = len;
          if (endPos > pos && input.charCodeAt(endPos - 1) === CR) endPos--;
          row[colIdx] = input.slice(pos, endPos);
          pos = len;
          colIdx++;
          break;
        }
        var endPos = nextLf;
        if (nextLf > pos && input.charCodeAt(nextLf - 1) === CR) endPos--;
        row[colIdx] = input.slice(pos, endPos);
        pos = nextLf + 1;
        colIdx++;
        break;
      }

      if (nextDelim === -1) {
        var endPos = nextLf !== -1 ? nextLf : len;
        if (endPos > pos && input.charCodeAt(endPos - 1) === CR) endPos--;
        row[colIdx] = input.slice(pos, endPos);
        colIdx++;
        pos = nextLf !== -1 ? nextLf + 1 : len;
        break;
      }

      if (nextLf !== -1 && nextLf < nextDelim) {
        var endPos = nextLf;
        if (nextLf > pos && input.charCodeAt(nextLf - 1) === CR) endPos--;
        row[colIdx] = input.slice(pos, endPos);
        colIdx++;
        pos = nextLf + 1;
        break;
      }

      row[colIdx] = input.slice(pos, nextDelim);
      pos = nextDelim + 1;
      colIdx++;
    }
  }

  while (colIdx < ${fieldCount}) {
    row[colIdx++] = '';
  }

  rows.push(row);
}

return rows;
`;

	return body;
}

// ============================================================================
// Compiler
// ============================================================================

/**
 * Analyzes the CSV sample and generates a specialized parser function.
 */
export function compileParser(sample: string, options?: ParseOptions): CompiledParser {
	const info = detectSchema(sample, options);

	// Check cache
	const key = getCacheKey(info);
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}

	// Generate function body
	let body: string;
	if (!info.hasQuotes) {
		body = buildUnquotedParser(info.fieldCount, info.delimiter, info.lineEnding);
	} else {
		body = buildQuotedParser(info.fieldCount, info.delimiter, info.quote);
	}

	// Create the function
	const fn = new Function("input", "start", body) as CompiledParser["fn"];

	const compiled: CompiledParser = {
		fn,
		fieldCount: info.fieldCount,
		hasQuotes: info.hasQuotes,
		lineEnding: info.lineEnding,
	};

	// Cache it
	cache.set(key, compiled);

	return compiled;
}

/**
 * Clears the parser cache.
 */
export function clearParserCache(): void {
	cache.clear();
}

// ============================================================================
// High-Level Parse Functions
// ============================================================================

const CR = 13;

/**
 * Parse the first row of CSV to extract field values.
 */
function parseFirstRow(firstLine: string, info: SchemaInfo): string[] {
	const { delimiter, quote } = info;
	const result: string[] = [];
	const quoteCode = quote.charCodeAt(0);
	const delimCode = delimiter.charCodeAt(0);
	const escaped = quote + quote;

	let pos = 0;
	const len = firstLine.length;

	while (pos < len) {
		const c = firstLine.charCodeAt(pos);

		if (c === quoteCode) {
			// Quoted field
			let hasEscaped = false;
			let fieldEnd = -1;
			let searchPos = pos + 1;

			while (searchPos < len) {
				const nextQuote = firstLine.indexOf(quote, searchPos);
				if (nextQuote === -1) {
					fieldEnd = len;
					break;
				}
				if (nextQuote + 1 < len && firstLine.charCodeAt(nextQuote + 1) === quoteCode) {
					hasEscaped = true;
					searchPos = nextQuote + 2;
					continue;
				}
				fieldEnd = nextQuote;
				break;
			}

			if (fieldEnd === -1) fieldEnd = len;
			let value = firstLine.slice(pos + 1, fieldEnd);
			if (hasEscaped) value = value.replaceAll(escaped, quote);
			result.push(value);

			pos = fieldEnd + 1;
			if (pos < len && firstLine.charCodeAt(pos) === delimCode) {
				pos++;
			}
		} else {
			// Unquoted field
			const nextDelim = firstLine.indexOf(delimiter, pos);
			if (nextDelim === -1) {
				result.push(firstLine.slice(pos));
				break;
			}
			result.push(firstLine.slice(pos, nextDelim));
			pos = nextDelim + 1;
		}
	}

	return result;
}

/**
 * Parse CSV using code-generated parser.
 */
export function parseCodegen(input: string, options?: ParseOptions): ParseResult {
	const len = input.length;

	// Handle empty input
	if (len === 0) {
		return {
			headers: null,
			rows: [],
			rowCount: 0,
			fieldCount: 0,
		};
	}

	const wantHeader = options?.header ?? true;
	const skipEmptyLines = options?.skipEmptyLines ?? false;

	// Compile parser from sample
	const compiled = compileParser(input, options);

	// Parse header row
	let headers: string[] | null = null;
	let dataStart = 0;

	if (wantHeader) {
		const firstNl = input.indexOf("\n");
		if (firstNl === -1) {
			// Header only, no data rows
			let firstLine = input;
			if (input.charCodeAt(input.length - 1) === CR) {
				firstLine = input.slice(0, input.length - 1);
			}
			const info = detectSchema(input, options);
			headers = parseFirstRow(firstLine, info);
			return {
				headers,
				rows: [],
				rowCount: 0,
				fieldCount: compiled.fieldCount,
			};
		}

		const firstLineEnd = input.charCodeAt(firstNl - 1) === CR ? firstNl - 1 : firstNl;
		const firstLine = input.slice(0, firstLineEnd);
		const info = detectSchema(input, options);
		headers = parseFirstRow(firstLine, info);
		dataStart = firstNl + 1;
	}

	// No more data after header
	if (dataStart >= len) {
		return {
			headers,
			rows: [],
			rowCount: 0,
			fieldCount: compiled.fieldCount,
		};
	}

	// Parse data rows with compiled function
	let rows = compiled.fn(input, dataStart);

	// Handle skipEmptyLines
	if (skipEmptyLines) {
		rows = rows.filter((row) => {
			for (let i = 0; i < row.length; i++) {
				if (row[i] !== "") return true;
			}
			return false;
		});
	}

	return {
		headers,
		rows,
		rowCount: rows.length,
		fieldCount: compiled.fieldCount,
	};
}
