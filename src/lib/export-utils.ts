/**
 * Export utilities for generating clean CSV/Excel files and handling browser PDF printing.
 */

export type CsvCellValue = string | number | boolean | null | undefined;

/**
 * Escapes and formats a cell value according to RFC 4180 rules.
 */
export function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  let str = String(value);
  // Neutralize CSV formula injection (CWE-1236): prepend single-quote if string starts with =, +, -, @, \t, or \r
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // If the cell contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant CSV string with a UTF-8 Byte Order Mark (BOM)
 * so Microsoft Excel and other spreadsheet viewers open special characters and formatting cleanly.
 */
export function generateCsvContent(
  headers: string[],
  rows: CsvCellValue[][]
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  // \uFEFF is the UTF-8 Byte Order Mark for Excel
  return `\uFEFF${[headerLine, ...rowLines].join('\r\n')}`;
}

/**
 * Triggers a client-side file download in the browser.
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers the native browser print dialog configured for print-to-PDF.
 */
export function triggerPrintPdf(): void {
  if (typeof window === 'undefined') return;
  window.print();
}
