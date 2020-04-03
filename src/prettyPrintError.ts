export function prettyPrintError(message: string | undefined | null, error: Error | undefined | null): string {
  let result = '';
  if (message !== undefined && message !== null) {
    result += `error: ${message}\n`;
  }
  if (error !== undefined && error !== null) {
    result += `error: ${error.message}\n`;
    if (error.stack !== undefined) {
      result += `error: ${error.stack}\n`;
    }
  }

  return result;
}
