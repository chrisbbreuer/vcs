import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import git from 'isomorphic-git'
import {
  generateChangeId,
  generateEntityId,
  deriveChangeIdFromCommit,
  reverseHexEncode,
  reverseHexDecode,
  shortestPrefix,
} from '../src/utils/id'
import { parseTrailers, addTrailers, stripTrailers, extractSubject } from '../src/utils/trailers'
import { IsomorphicGitBackend } from '../src/storage/isomorphic-git-backend'
import { JsonMetadataStore } from '../src/storage/json-metadata-store'
import type { Change, ChangeId, CommitOid } from '../src/types'

// ─── ID Utils ───────────────────────────────────────────────────

describe('id utils', () => {
  it('generateChangeId returns 32-char reverse-hex string', () => {
    const id = generateChangeId()
    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[k-z]+$/)
  })

  it('generateChangeId produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateChangeId()))
    expect(ids.size).toBe(100)
  })

  it('generateEntityId returns valid UUIDv7 format', () => {
    const id = generateEntityId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('reverseHexEncode/Decode are inverse operations', () => {
    const hex = 'a1b2c3d4e5f60789'
    const encoded = reverseHexEncode(hex)
    expect(encoded).not.toBe(hex)
    expect(reverseHexDecode(encoded)).toBe(hex)
  })

  it('deriveChangeIdFromCommit is deterministic', () => {
    const oid = 'a1b2c3d4e5f6a7b89c0d1e2f3a4b5c6d7e8f9a0b'
    const id1 = deriveChangeIdFromCommit(oid as CommitOid)
    const id2 = deriveChangeIdFromCommit(oid as CommitOid)
    expect(id1).toBe(id2)
    expect(id1).toHaveLength(32)
    expect(id1).toMatch(/^[k-z]+$/)
  })

  it('shortestPrefix finds unique prefixes', () => {
    const ids = ['kkkkllll', 'kkkkmmmm', 'llllmmmm']
    expect(shortestPrefix('kkkkllll', ids)).toBe('kkkkl')
    expect(shortestPrefix('llllmmmm', ids)).toBe('llll')
  })
})

// ─── Trailer Utils ──────────────────────────────────────────────

describe('trailer utils', () => {
  it('parseTrailers extracts key-value pairs', () => {
    const message = `Fix auth bug

Some details here.

Change-Id: kkqrmvlnopstuv
Session-Id: abc-123
VCS-Version: 0.1.0
`
    const trailers = parseTrailers(message)
    expect(trailers['Change-Id']).toBe('kkqrmvlnopstuv')
    expect(trailers['Session-Id']).toBe('abc-123')
    expect(trailers['VCS-Version']).toBe('0.1.0')
  })

  it('parseTrailers returns empty for no trailers', () => {
    const trailers = parseTrailers('Simple message')
    expect(Object.keys(trailers)).toHaveLength(0)
  })

  it('addTrailers appends with blank line separator', () => {
    const result = addTrailers('Fix bug', { 'Change-Id': 'abc' })
    expect(result).toBe('Fix bug\n\nChange-Id: abc\n')
  })

  it('stripTrailers removes trailers', () => {
    const message = `Fix auth bug

Some body.

Change-Id: abc
VCS-Version: 0.1.0`
    expect(stripTrailers(message)).toBe('Fix auth bug\n\nSome body.')
  })

  it('extractSubject returns first line', () => {
    expect(extractSubject('Fix bug\n\nBody text')).toBe('Fix bug')
  })
})

// ─── Integration: Git Backend + Metadata Store ──────────────────

describe('storage integration', () => {
  let tmpDir: string
  let gitBackend: IsomorphicGitBackend
  let metadataStore: JsonMetadataStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vcs-test-'))
    await git.init({ fs: await import('node:fs'), dir: tmpDir })
    gitBackend = new IsomorphicGitBackend(tmpDir)
    const vcsdir = path.join(tmpDir, '.vcs')
    await fs.mkdir(path.join(vcsdir, 'store', 'changes'), { recursive: true })
    await fs.mkdir(path.join(vcsdir, 'store', 'operations'), { recursive: true })
    await fs.mkdir(path.join(vcsdir, 'store', 'bookmarks'), { recursive: true })
    metadataStore = new JsonMetadataStore(vcsdir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('can create a commit and read it back', async () => {
    // Create a file and stage it
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'hello world')
    await gitBackend.add('hello.txt')

    const oid = await gitBackend.commit({
      message: 'Initial commit',
      author: {
        name: 'Test',
        email: 'test@test.com',
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: 0,
      },
    })

    expect(oid).toHaveLength(40)

    const commit = await gitBackend.readCommit(oid)
    expect(commit.message).toBe('Initial commit\n')
    expect(commit.parent).toHaveLength(0)
  })

  it('can write and read refs', async () => {
    // Create a commit first
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'test')
    await gitBackend.add('test.txt')
    const oid = await gitBackend.commit({
      message: 'test',
      author: { name: 'T', email: 't@t.com', timestamp: Math.floor(Date.now() / 1000), timezoneOffset: 0 },
    })

    await gitBackend.writeRef('refs/vcs/changes/testid', oid)
    const refs = await gitBackend.listRefs('refs/vcs/changes/')
    expect(refs).toHaveLength(1)
    expect(refs[0].ref).toBe('refs/vcs/changes/testid')
    expect(refs[0].oid).toBe(oid)
  })

  it('metadata store round-trips changes', async () => {
    const change: Change = {
      id: 'kkkkllllmmmmnnnn' as ChangeId,
      currentCommitOid: 'abc123' as CommitOid,
      predecessors: [],
      parentChangeIds: [],
      dependsOn: [],
      sessionId: null,
      taskId: null,
      transcriptIds: [],
      description: 'Test change',
      labels: [],
      abandoned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await metadataStore.putChange(change)
    const retrieved = await metadataStore.getChange('kkkkllllmmmmnnnn' as ChangeId)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe(change.id)
    expect(retrieved!.description).toBe('Test change')
  })

  it('metadata store lists changes excluding abandoned', async () => {
    const change1: Change = {
      id: 'aaaa' as ChangeId,
      currentCommitOid: 'oid1' as CommitOid,
      predecessors: [],
      parentChangeIds: [],
      dependsOn: [],
      sessionId: null,
      taskId: null,
      transcriptIds: [],
      description: 'Active',
      labels: [],
      abandoned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const change2: Change = {
      ...change1,
      id: 'bbbb' as ChangeId,
      currentCommitOid: 'oid2' as CommitOid,
      description: 'Abandoned',
      abandoned: true,
    }

    await metadataStore.putChange(change1)
    await metadataStore.putChange(change2)

    const changes = await metadataStore.listChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0].id).toBe('aaaa')
  })
})
