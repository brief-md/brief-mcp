// src/ontology/table-render.ts — Structured section table rendering utilities

/** Escape pipe characters in a cell value for markdown tables. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Format a cell value from an entry field. Arrays are joined with "; ". */
function formatCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return escapeCell(value.join("; "));
  return escapeCell(String(value));
}

/** Render a markdown table header row with separator. */
export function renderTableHeader(columns: string[]): string {
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  return `${header}\n${separator}`;
}

/** Render a single markdown table row from an entry record. */
export function renderTableRow(
  entry: Record<string, unknown>,
  columns: string[],
): string {
  const cells = columns.map((col) => formatCell(entry[col]));
  return `| ${cells.join(" | ")} |`;
}

/** Render a full markdown table (header + rows) from entry records. */
export function renderFullTable(
  entries: Array<Record<string, unknown>>,
  columns: string[],
): string {
  const header = renderTableHeader(columns);
  const rows = entries.map((e) => renderTableRow(e, columns));
  return [header, ...rows].join("\n");
}

/** Parse a markdown table back into row objects.
 *  Returns an array of records keyed by column header names. */
export function parseTableRows(
  tableText: string,
): Array<Record<string, string>> {
  const lines = tableText.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 2) return []; // Need at least header + separator

  // Parse header columns
  const headers = lines[0]
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);

  // Skip separator (line 1), parse data rows
  const rows: Array<Record<string, string>> = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Append a table row to section content. Creates the table if none exists.
 *  Returns the updated section content string.
 *  The tag comment is placed on the line immediately after the row. */
export function appendTableRow(
  sectionContent: string,
  entry: Record<string, unknown>,
  columns: string[],
  tagComment: string,
): string {
  const row = renderTableRow(entry, columns);
  const lines = sectionContent.split("\n");

  // Check if a table already exists (look for header row with pipes)
  const tableHeaderIdx = lines.findIndex(
    (l) => l.trim().startsWith("|") && l.includes(" | "),
  );

  if (tableHeaderIdx === -1) {
    // No table exists — create one
    const header = renderTableHeader(columns);
    return `${sectionContent.trimEnd()}\n\n${header}\n${row}\n${tagComment}\n`;
  }

  // Find the last table row (last line starting with |, after separator)
  let lastTableRow = tableHeaderIdx;
  for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|")) {
      lastTableRow = i;
    } else if (!lines[i].trim().startsWith("<!--")) {
      // Stop at first non-table, non-comment line
      break;
    }
  }

  // Also skip any tag comments that follow the last table row
  let insertAfter = lastTableRow;
  for (let i = lastTableRow + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("<!-- brief:ontology")) {
      insertAfter = i;
    } else {
      break;
    }
  }

  // Insert the new row + comment after the last entry
  lines.splice(insertAfter + 1, 0, row, tagComment);
  return lines.join("\n");
}
