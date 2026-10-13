import { describe, expect, test } from "bun:test"
import { changedPaths, safeLocalPath, saveLocalFolder, type LocalFolder } from "~/core/journal/local"

const folderWith = (contents: Readonly<Record<string, string>>, permission: PermissionState = "granted", failAt?: string) => {
  const disk = new Map(Object.entries(contents))
  const writes: string[] = []
  const directory = (prefix: string): FileSystemDirectoryHandle => ({
    kind: "directory",
    name: "books",
    requestPermission: async () => permission,
    getDirectoryHandle: async (name: string) => directory(`${prefix}${name}/`),
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      const path = prefix + name
      if (!disk.has(path) && !options?.create) return Promise.reject(new DOMException("Missing", "NotFoundError"))
      return {
        getFile: async () => new File([disk.get(path) ?? ""], name),
        createWritable: async () => {
          if (path === failAt) return Promise.reject(new DOMException("Refused", "NotAllowedError"))
          const pending = { text: "" }
          return {
            write: async (text: string) => { pending.text = text },
            close: async () => { disk.set(path, pending.text); writes.push(path) },
          }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle)
  return { disk, writes, handle: directory("") }
}

describe("original folder", () => {
  test("only changed files are selected and paths cannot escape the folder", () => {
    expect(changedPaths({ "main.journal": "a", "accounts.journal": "b" }, { "main.journal": "a", "accounts.journal": "c", "transactions.journal": "d" })).toEqual(["accounts.journal", "transactions.journal"])
    expect(safeLocalPath("adjustments/2026-12-31.journal")).toBe(true)
    for (const path of ["", "/main.journal", "../main.journal", "a/../b", "a//b", "a/./b", "a\\b"]) expect(safeLocalPath(path)).toBe(false)
  })

  test("saves changed and new nested files, not untouched files", async () => {
    const folder = folderWith({ "main.journal": "a", "accounts.journal": "b" })
    const result = await saveLocalFolder({ handle: folder.handle, base: { "main.journal": "a", "accounts.journal": "b" } }, {
      "main.journal": "a", "accounts.journal": "c", "adjustments/2026.journal": "d",
    })
    expect(result.ok).toBe(true)
    expect(folder.writes).toEqual(["accounts.journal", "adjustments/2026.journal"])
    expect(folder.disk.get("adjustments/2026.journal")).toBe("d")
  })

  test("an external edit to even an untouched file blocks all writes", async () => {
    const folder = folderWith({ "main.journal": "external", "accounts.journal": "b" })
    const result = await saveLocalFolder({ handle: folder.handle, base: { "main.journal": "a", "accounts.journal": "b" } }, { "main.journal": "a", "accounts.journal": "c" })
    expect(result).toEqual({ ok: false, error: { at: "changed", path: "main.journal" } })
    expect(folder.writes).toEqual([])
  })

  test("a missing original or a colliding new file is not overwritten", async () => {
    for (const contents of [{} as Readonly<Record<string, string>>, { "main.journal": "other" }]) {
      const folder = folderWith(contents)
      const base: Readonly<Record<string, string>> = Object.keys(contents).length === 0 ? { "main.journal": "old" } : {}
      const result = await saveLocalFolder({ handle: folder.handle, base }, { "main.journal": "new" })
      expect(result).toEqual({ ok: false, error: { at: "changed", path: "main.journal" } })
      expect(folder.writes).toEqual([])
    }
  })

  test("permission refusal and unsafe paths write nothing", async () => {
    const folder = folderWith({ "main.journal": "a" }, "denied")
    expect(await saveLocalFolder({ handle: folder.handle, base: { "main.journal": "a" } }, { "main.journal": "b" })).toEqual({ ok: false, error: { at: "permission" } })
    expect(await saveLocalFolder({ handle: folder.handle, base: {} }, { "../escape": "b" })).toEqual({ ok: false, error: { at: "unsafe-path", path: "../escape" } })
    expect(folder.writes).toEqual([])
  })

  test("partial writes advance the persisted baseline for a safe retry", async () => {
    const folder = folderWith({ "main.journal": "a", "accounts.journal": "b" }, "granted", "accounts.journal")
    const kept: LocalFolder[] = []
    const result = await saveLocalFolder({ handle: folder.handle, base: { "main.journal": "a", "accounts.journal": "b" } }, { "main.journal": "new", "accounts.journal": "new" }, async (next) => { kept.push(next) })
    expect(result.ok).toBe(false)
    expect(folder.writes).toEqual(["main.journal"])
    expect(kept[0]?.base).toEqual({ "main.journal": "new", "accounts.journal": "b" })
    const retry = folderWith(Object.fromEntries(folder.disk))
    const retried = await saveLocalFolder({ ...kept[0]!, handle: retry.handle }, { "main.journal": "new", "accounts.journal": "new" })
    expect(retried.ok).toBe(true)
    expect(retry.writes).toEqual(["accounts.journal"])
  })
})
