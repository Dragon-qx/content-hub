/**
 * Minimal RFC 4180 CSV parser — no external dependency.
 *
 * Supports:
 *   - quoted fields containing commas, newlines, and escaped double-quotes ("")
 *   - CRLF and LF line endings
 *   - header row → returns one record object per data row
 *
 * The parser is deliberately strict about ragged rows (a row whose column
 * count differs from the header count produces an error record) so the
 * import service can surface a per-row error to the caller.
 */

export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: CsvRowError[];
}

export interface CsvRowError {
  line: number; // 1-based, counting from the first data row (header is line 0)
  raw: string;
  reason: string;
}

/**
 * Split a CSV string into a 2D array of cells. The returned array always has
 * the same number of columns per row as the header (short rows are padded,
 * long rows are flagged as errors by the higher-level helper).
 */
function tokenizeCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // escaped quote inside a quoted field
          field += '"';
          i += 2;
          continue;
        }
        // end of quoted field
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // not inside quotes
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // swallow CR, commit on LF
      i += 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // flush trailing field / row if any content remains
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Lower-cased, trimmed lookup so ` Platform ` and `platform` both work. */
function normalize(value: string): string {
  return value.trim();
}

/**
 * Parse a CSV document with a header row into records. Empty lines are
 * skipped. Ragged rows (column count != header count) are reported in
 * `errors` and skipped.
 *
 * The first non-empty row is treated as the header.
 */
export function parseCsv(input: string): CsvParseResult {
  const errors: CsvRowError[] = [];
  const rawRows = tokenizeCsv(input).filter(
    (r) => !(r.length === 1 && r[0].trim() === ''),
  );

  if (rawRows.length === 0) {
    return { headers: [], rows: [], errors: [] };
  }

  const headers = rawRows[0].map(normalize);
  const expected = headers.length;
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const cells = rawRows[r];
    if (cells.length !== expected) {
      errors.push({
        line: r,
        raw: cells.join(','),
        reason: `column count mismatch: expected ${expected}, got ${cells.length}`,
      });
      continue;
    }
    const record: Record<string, string> = {};
    for (let c = 0; c < expected; c++) {
      record[headers[c]] = cells[c].trim();
    }
    rows.push(record);
  }

  return { headers, rows, errors };
}

/**
 * Compose a platform-specific credential map from a CSV record. The record
 * may use either the raw credential field names per platform (`appid`,
 * `clientKey`, …) or a single `credentials` column holding a JSON object.
 *
 * Empty strings are dropped so they don't clobber defaults in
 * `composeCredentials`.
 */
export function credentialsFromRecord(
  platform: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const creds: Record<string, unknown> = {};

  // Credential column names that are shared across platforms. Each platform
  // reads a subset; extra keys are harmless (composeCredentials ignores them).
  const credentialKeys = [
    'appid',
    'secret',
    'rawId',
    'clientKey',
    'clientSecret',
    'appKey',
    'appSecret',
    'accessKey',
    'bearerToken',
    'apiKey',
    'apiSecret',
    'clientId',
    'clientSecretYouTube',
    'channelId',
    'callbackUrl',
  ];

  for (const key of credentialKeys) {
    const v = record[key];
    if (typeof v === 'string' && v.length > 0) {
      creds[key] = v;
    }
  }

  // A literal `credentials` JSON column overrides / supplies whatever the
  // per-column keys did not cover.
  if (typeof record.credentials === 'string' && record.credentials.trim().length > 0) {
    try {
      const parsed = JSON.parse(record.credentials);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(creds, parsed);
      }
    } catch {
      // Non-JSON `credentials` column — ignore, individual keys still apply.
      // The import service row validator will surface a structured error.
    }
  }

  void platform; // reserved for platform-specific mapping tweaks later
  return creds;
}
