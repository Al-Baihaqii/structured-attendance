export function createCsv(rows: (string | number | null)[][]) {
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text = value === null ? "" : String(value);
    // Quoting alone does not prevent spreadsheet formula execution.
    if (typeof value === "string" && /^[\s\uFEFF]*[=+@-]/u.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}

export function csvFilename(groupName: string, format: string, filters: { from?: string; to?: string }) {
  const name = groupName.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "-").trim().slice(0, 100) || "kelompok";
  const period = !filters.from && !filters.to ? "semua-tanggal" : `${filters.from || "awal"}_${filters.to || "akhir"}`;
  return `${name}_${format}_${period}.csv`;
}
