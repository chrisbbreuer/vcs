/**
 * Format command output as text or JSON.
 * Every command uses this to support --format=json for agent consumption.
 */
export function formatOutput(
  format: string | undefined,
  data: Record<string, unknown>,
  textRenderer: () => void | Promise<void>,
): void {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2))
  } else {
    textRenderer()
  }
}
