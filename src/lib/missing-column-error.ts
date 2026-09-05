/** Only retry a legacy SELECT when the server identifies that exact column. */
export function isMissingColumnError(
  error: { code?: string; message: string },
  table: string,
  column: string,
): boolean {
  if (error.code === '42703') {
    return error.message === `column ${table}.${column} does not exist`
      || error.message === `column "${column}" does not exist`
      || error.message === `column ${column} does not exist`
  }
  return error.code === 'PGRST204'
    && error.message === `Could not find the '${column}' column of '${table}' in the schema cache`
}
