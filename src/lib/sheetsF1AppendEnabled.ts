/** F1 upload → Google Sheets Activities append. Enabled only when env is explicitly "true" or "1". */
function envTruthy(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

export function isSheetsF1AppendEnabled(): boolean {
  return envTruthy(process.env.SHEETS_F1_APPEND_ENABLED)
}

/** Client-side mirror; set NEXT_PUBLIC_SHEETS_F1_APPEND_ENABLED when enabling on the server. */
export function isSheetsF1AppendEnabledPublic(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_SHEETS_F1_APPEND_ENABLED)
}
