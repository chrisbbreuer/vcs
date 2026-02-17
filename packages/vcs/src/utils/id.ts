import { randomBytes } from 'node:crypto'
import type { ChangeId, CommitOid, EntityId, OperationId } from '../types'

const REVERSE_HEX_MAP: Record<string, string> = {
  '0': 'k', '1': 'l', '2': 'm', '3': 'n',
  '4': 'o', '5': 'p', '6': 'q', '7': 'r',
  '8': 's', '9': 't', 'a': 'u', 'b': 'v',
  'c': 'w', 'd': 'x', 'e': 'y', 'f': 'z',
}

const HEX_REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(REVERSE_HEX_MAP).map(([k, v]) => [v, k]),
)

/**
 * Encode hex string as reverse-hex (k-z instead of 0-f).
 * Produces visually distinct IDs from SHA-1 commit hashes.
 */
export function reverseHexEncode(hex: string): string {
  return hex.replace(/[0-9a-f]/g, c => REVERSE_HEX_MAP[c] ?? c)
}

/**
 * Decode reverse-hex string back to hex.
 */
export function reverseHexDecode(encoded: string): string {
  return encoded.replace(/[k-z]/g, c => HEX_REVERSE_MAP[c] ?? c)
}

/**
 * Generate a new random Change ID (32 chars, reverse-hex encoded).
 */
export function generateChangeId(): ChangeId {
  const bytes = randomBytes(16)
  const hex = bytes.toString('hex')
  return reverseHexEncode(hex) as ChangeId
}

/**
 * Derive a deterministic Change ID from a git commit OID.
 * Used for commits created by git (not by VCS).
 * Nibble-swaps each byte then reverse-hex encodes, matching jj's approach.
 */
export function deriveChangeIdFromCommit(oid: CommitOid | string): ChangeId {
  const hex = oid.slice(0, 32)
  const swapped = hex.replace(/[0-9a-f]{2}/g, (byte) => {
    const num = Number.parseInt(byte, 16)
    const rev = ((num & 0x0F) << 4) | ((num & 0xF0) >> 4)
    return rev.toString(16).padStart(2, '0')
  })
  return reverseHexEncode(swapped) as ChangeId
}

/**
 * Generate a UUIDv7 (time-ordered, random).
 */
export function generateEntityId(): EntityId {
  const now = Date.now()
  const bytes = new Uint8Array(16)

  // Timestamp (48 bits)
  bytes[0] = (now / 2 ** 40) & 0xFF
  bytes[1] = (now / 2 ** 32) & 0xFF
  bytes[2] = (now / 2 ** 24) & 0xFF
  bytes[3] = (now / 2 ** 16) & 0xFF
  bytes[4] = (now / 2 ** 8) & 0xFF
  bytes[5] = now & 0xFF

  // Random bits
  const rand = randomBytes(10)
  for (let i = 0; i < 10; i++) {
    bytes[6 + i] = rand[i]
  }

  // Version 7
  bytes[6] = (bytes[6] & 0x0F) | 0x70
  // Variant 10xx
  bytes[8] = (bytes[8] & 0x3F) | 0x80

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')

  return uuid as EntityId
}

export function generateOperationId(): OperationId {
  return generateEntityId() as unknown as OperationId
}

/**
 * Find the shortest unique prefix for a Change ID given a set of all IDs.
 */
export function shortestPrefix(id: string, allIds: string[], minLength = 4): string {
  for (let len = minLength; len <= id.length; len++) {
    const prefix = id.slice(0, len)
    const matches = allIds.filter(other => other.startsWith(prefix))
    if (matches.length === 1) return prefix
  }
  return id
}
