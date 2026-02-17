import * as fs from 'node:fs'
import * as path from 'node:path'
import git from 'isomorphic-git'
import type { CommitOid } from '../types'
import type { GitAuthor, GitBackend, GitCommitObject, GitRefEntry, StatusRow } from './git-backend'

export class IsomorphicGitBackend implements GitBackend {
  constructor(
    public readonly dir: string,
    public readonly gitdir: string = path.join(dir, '.git'),
  ) {}

  async readCommit(oid: string): Promise<GitCommitObject> {
    const result = await git.readCommit({ fs, dir: this.dir, gitdir: this.gitdir, oid })
    const c = result.commit
    return {
      oid: result.oid,
      message: c.message,
      tree: c.tree,
      parent: c.parent,
      author: c.author,
      committer: c.committer,
    }
  }

  async writeBlob(content: Uint8Array): Promise<string> {
    return git.writeBlob({ fs, dir: this.dir, gitdir: this.gitdir, blob: content })
  }

  async readBlob(oid: string): Promise<Uint8Array> {
    const result = await git.readBlob({ fs, dir: this.dir, gitdir: this.gitdir, oid })
    return result.blob
  }

  async resolveRef(ref: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs, dir: this.dir, gitdir: this.gitdir, ref })
    } catch {
      return null
    }
  }

  async writeRef(ref: string, oid: string): Promise<void> {
    // isomorphic-git doesn't have a direct writeRef for arbitrary refs,
    // so we write the ref file directly
    const refPath = path.join(this.gitdir, ref)
    await fs.promises.mkdir(path.dirname(refPath), { recursive: true })
    await fs.promises.writeFile(refPath, `${oid}\n`)
  }

  async deleteRef(ref: string): Promise<void> {
    const refPath = path.join(this.gitdir, ref)
    try {
      await fs.promises.unlink(refPath)
    } catch {
      // ref doesn't exist
    }
  }

  async listRefs(prefix: string): Promise<GitRefEntry[]> {
    const refDir = path.join(this.gitdir, prefix)
    const entries: GitRefEntry[] = []

    try {
      await this.walkRefDir(refDir, prefix, entries)
    } catch {
      // directory doesn't exist yet
    }

    return entries
  }

  private async walkRefDir(dir: string, prefix: string, entries: GitRefEntry[]): Promise<void> {
    const items = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        await this.walkRefDir(fullPath, `${prefix}${item.name}/`, entries)
      } else {
        const oid = (await fs.promises.readFile(fullPath, 'utf8')).trim()
        entries.push({ ref: `${prefix}${item.name}`, oid })
      }
    }
  }

  async add(filepath: string): Promise<void> {
    await git.add({ fs, dir: this.dir, gitdir: this.gitdir, filepath })
  }

  async remove(filepath: string): Promise<void> {
    await git.remove({ fs, dir: this.dir, gitdir: this.gitdir, filepath })
  }

  async statusMatrix(): Promise<StatusRow[]> {
    const matrix = await git.statusMatrix({ fs, dir: this.dir, gitdir: this.gitdir })
    return matrix as StatusRow[]
  }

  async commit(params: { message: string; author: GitAuthor }): Promise<CommitOid> {
    const oid = await git.commit({
      fs,
      dir: this.dir,
      gitdir: this.gitdir,
      message: params.message,
      author: {
        name: params.author.name,
        email: params.author.email,
        timestamp: params.author.timestamp,
        timezoneOffset: params.author.timezoneOffset,
      },
    })
    return oid as CommitOid
  }

  async addNote(params: { ref: string; oid: string; note: string; author: GitAuthor }): Promise<void> {
    await git.addNote({
      fs,
      dir: this.dir,
      gitdir: this.gitdir,
      ref: params.ref,
      oid: params.oid,
      note: params.note,
      author: {
        name: params.author.name,
        email: params.author.email,
        timestamp: params.author.timestamp,
        timezoneOffset: params.author.timezoneOffset,
      },
      force: true,
    })
  }

  async readNote(params: { ref: string; oid: string }): Promise<string | null> {
    try {
      const note = await git.readNote({
        fs,
        dir: this.dir,
        gitdir: this.gitdir,
        ref: params.ref,
        oid: params.oid,
      })
      return new TextDecoder().decode(note)
    } catch {
      return null
    }
  }

  async log(params: { ref: string; depth?: number }): Promise<GitCommitObject[]> {
    try {
      const commits = await git.log({
        fs,
        dir: this.dir,
        gitdir: this.gitdir,
        ref: params.ref,
        depth: params.depth,
      })
      return commits.map(c => ({
        oid: c.oid,
        message: c.commit.message,
        tree: c.commit.tree,
        parent: c.commit.parent,
        author: c.commit.author,
        committer: c.commit.committer,
      }))
    } catch {
      return []
    }
  }
}
