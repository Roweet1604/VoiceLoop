// CSV encoding (RFC 4180) for exports that will be opened in spreadsheets.

// Spreadsheet apps run a cell that starts with one of these as a formula, so a
// customer could type "=HYPERLINK(...)" into feedback and have it execute on
// the owner's computer. A leading apostrophe makes the cell plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  // Quote anything containing a delimiter, quote or line break; double quotes
  // inside. Line breaks stay as they are, inside the quotes.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvRow = (values) => `${values.map(csvCell).join(",")}\r\n`;
