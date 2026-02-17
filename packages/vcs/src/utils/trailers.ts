/**
 * Parse git commit message trailers (key: value pairs at the end).
 */
export function parseTrailers(message: string): Record<string, string> {
  const trailers: Record<string, string> = {}
  const lines = message.trimEnd().split('\n')

  // Walk backwards from end collecting trailer lines
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*): (.+)$/)
    if (match) {
      trailers[match[1]] = match[2]
    } else if (line.trim() === '') {
      // Blank line separates trailers from body
      break
    } else {
      // Non-trailer, non-blank line — stop
      break
    }
  }

  return trailers
}

/**
 * Add trailers to a commit message.
 * Ensures a blank line separates the body from trailers.
 */
export function addTrailers(message: string, trailers: Record<string, string>): string {
  const trailerLines = Object.entries(trailers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')

  const trimmed = message.trimEnd()

  // If message already ends with trailers, append after them
  // Otherwise add blank line separator
  const needsSeparator = trimmed.length > 0 && !trimmed.endsWith('\n\n')
  return `${trimmed}${needsSeparator ? '\n\n' : ''}${trailerLines}\n`
}

/**
 * Strip trailers from a commit message, returning just the subject + body.
 */
export function stripTrailers(message: string): string {
  const lines = message.trimEnd().split('\n')
  let trailerStart = lines.length

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (line.match(/^[A-Za-z][A-Za-z0-9-]*: .+$/)) {
      trailerStart = i
    } else if (line.trim() === '') {
      trailerStart = i
      break
    } else {
      break
    }
  }

  return lines.slice(0, trailerStart).join('\n').trimEnd()
}

/**
 * Extract the first line (subject) from a commit message.
 */
export function extractSubject(message: string): string {
  return message.split('\n')[0].trim()
}
