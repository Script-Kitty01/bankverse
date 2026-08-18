/**
 * BankVerse — Robust CSV Parser
 *
 * RFC 4180 compliant CSV parser with support for:
 * - Quoted fields with escaped quotes (`""`)
 * - Embedded commas and newlines in quoted fields
 * - Case-insensitive header normalization
 * - Trailing/empty line filtering with line number tracking
 * - Fault tolerant error handling for malformed quotes or field mismatches
 */

export interface ParsedCsvResult {
  headers: string[];
  normalizedHeaders: string[];
  rows: Array<{
    rowIndex: number;
    rawRecord: Record<string, string>;
  }>;
  parseErrors: Array<{
    line: number;
    message: string;
  }>;
}

export interface CsvParseOptions {
  delimiter?: string;
  trimValues?: boolean;
}

/**
 * Normalizes a header string: lowercases, replaces spaces/dashes with underscores,
 * strips special characters.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Parses raw CSV string into tokens per field, respecting quotes.
 */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        currentField += '"';
        i += 2;
        continue;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (char === delimiter && !inQuotes) {
      fields.push(currentField);
      currentField = "";
      i++;
      continue;
    }

    currentField += char;
    i++;
  }

  fields.push(currentField);
  return fields;
}

/**
 * Parses a full multi-line CSV string into structured records with headers and line indexes.
 */
export function parseCsvText(csvText: string, options: CsvParseOptions = {}): ParsedCsvResult {
  const delimiter = options.delimiter || ",";
  const trimValues = options.trimValues !== false;

  const result: ParsedCsvResult = {
    headers: [],
    normalizedHeaders: [],
    rows: [],
    parseErrors: [],
  };

  if (!csvText || typeof csvText !== "string" || csvText.trim().length === 0) {
    return result;
  }

  // Handle embedded newlines inside quoted strings by splitting statefully
  const lines: string[] = [];
  let currentLine = "";
  let insideQuote = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      insideQuote = !insideQuote;
      currentLine += char;
    } else if ((char === "\n" || char === "\r") && !insideQuote) {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i++; // skip \n of \r\n
      }
      lines.push(currentLine);
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return result;
  }

  // Line 1: Header row
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  result.headers = rawHeaders.map((h) => (trimValues ? h.trim() : h));
  result.normalizedHeaders = result.headers.map((h) => normalizeHeader(h));

  // Remaining lines: Data rows
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    if (!rawLine || rawLine.trim().length === 0) {
      continue; // Skip blank lines
    }

    const fieldValues = parseCsvLine(rawLine, delimiter);
    const rawRecord: Record<string, string> = {};

    let hasNonEmpty = false;
    result.normalizedHeaders.forEach((normHeader, colIdx) => {
      let val = fieldValues[colIdx] !== undefined ? fieldValues[colIdx] : "";
      if (trimValues) val = val.trim();
      rawRecord[normHeader] = val;
      // Also keep original header key for flexibility
      const origHeader = result.headers[colIdx];
      if (origHeader && origHeader !== normHeader) {
        rawRecord[origHeader] = val;
      }
      if (val.length > 0) hasNonEmpty = true;
    });

    if (!hasNonEmpty) {
      continue;
    }

    // Check field count mismatch warning
    if (fieldValues.length !== result.headers.length) {
      result.parseErrors.push({
        line: lineIdx + 1,
        message: `Field count mismatch: header has ${result.headers.length} columns, row has ${fieldValues.length}`,
      });
    }

    result.rows.push({
      rowIndex: lineIdx + 1,
      rawRecord,
    });
  }

  return result;
}
