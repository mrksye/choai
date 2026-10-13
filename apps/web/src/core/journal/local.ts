import { readText } from "~/core/lib/text"
import { Err, Ok, type Result } from "~/core/lib/monad"

/** The folder and the text last read from or written to it survive browser visits. */
export interface LocalFolder {
  readonly handle: FileSystemDirectoryHandle
  readonly base: Readonly<Record<string, string>>
}

export type LocalFailure =
  | { readonly at: "not-linked" }
  | { readonly at: "permission" }
  | { readonly at: "changed"; readonly path: string }
  | { readonly at: "unsafe-path"; readonly path: string }
  | { readonly at: "filesystem"; readonly cause: unknown }

export const changedPaths = (base: Readonly<Record<string, string>>, files: Readonly<Record<string, string>>): readonly string[] =>
  Object.keys(files).filter((path) => files[path] !== base[path])

export const safeLocalPath = (path: string): boolean =>
  path.length > 0 && !path.includes("\\") && path.split("/").every((part) => part !== "" && part !== "." && part !== "..")

type PermissionHandle = FileSystemDirectoryHandle & {
  readonly requestPermission: (options: { readonly mode: "readwrite" }) => Promise<PermissionState>
}

/** Request permissions only from a user action, including after a browser restart. */
export const permitLocalFolder = async (folder: LocalFolder): Promise<Result<void, LocalFailure>> => {
  try {
    return await (folder.handle as PermissionHandle).requestPermission({ mode: "readwrite" }) === "granted"
      ? Ok(undefined) : Err({ at: "permission" })
  } catch (cause) {
    return Err({ at: "filesystem", cause })
  }
}

const fileAt = async (folder: FileSystemDirectoryHandle, parts: readonly string[], create: boolean): Promise<FileSystemFileHandle> => {
  const [first, ...rest] = parts
  return rest.length === 0
    ? folder.getFileHandle(first, { create })
    : fileAt(await folder.getDirectoryHandle(first, { create }), rest, create)
}

const textAt = async (folder: FileSystemDirectoryHandle, path: string): Promise<Result<string | undefined, LocalFailure>> => {
  try {
    return Ok(await readText(await (await fileAt(folder, path.split("/"), false)).getFile()))
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "NotFoundError"
      ? Ok(undefined) : Err({ at: "filesystem", cause })
  }
}

/** Refuse a conflicting or unsafe path before writing any file. Filesystem writes are not a multi-file transaction. */
export const saveLocalFolder = async (
  folder: LocalFolder,
  files: Readonly<Record<string, string>>,
  written: (folder: LocalFolder) => Promise<void> = async () => undefined,
): Promise<Result<LocalFolder, LocalFailure>> => {
  const paths = changedPaths(folder.base, files)
  const unsafe = [...Object.keys(folder.base), ...Object.keys(files)].find((path) => !safeLocalPath(path))
  if (unsafe !== undefined) return Err({ at: "unsafe-path", path: unsafe })
  const allowed = await permitLocalFolder(folder)
  if (!allowed.ok) return allowed
  return writeCheckedPaths(folder, files, paths, written)
}

const checkPaths = async (folder: LocalFolder, paths: readonly string[]): Promise<Result<void, LocalFailure>> => {
  const [path, ...rest] = paths
  if (path === undefined) return Ok(undefined)
  const disk = await textAt(folder.handle, path)
  if (!disk.ok) return disk
  return disk.value !== folder.base[path] ? Err({ at: "changed", path }) : checkPaths(folder, rest)
}

const writeCheckedPaths = async (
  folder: LocalFolder,
  files: Readonly<Record<string, string>>,
  paths: readonly string[],
  written: (folder: LocalFolder) => Promise<void>,
): Promise<Result<LocalFolder, LocalFailure>> => {
  const checked = await checkPaths(folder, [...new Set([...Object.keys(folder.base), ...Object.keys(files)])])
  if (!checked.ok) return checked
  return writePaths(folder, files, paths, written)
}

const writePaths = async (
  folder: LocalFolder,
  files: Readonly<Record<string, string>>,
  paths: readonly string[],
  written: (folder: LocalFolder) => Promise<void>,
): Promise<Result<LocalFolder, LocalFailure>> => {
  const [path, ...rest] = paths
  if (path === undefined) return Ok(folder)
  const checked = await checkPaths(folder, [path])
  if (!checked.ok) return checked
  try {
    const writable = await (await fileAt(folder.handle, path.split("/"), true)).createWritable()
    await writable.write(files[path])
    await writable.close()
    const next = { ...folder, base: { ...folder.base, [path]: files[path] } }
    await written(next)
    return writePaths(next, files, rest, written)
  } catch (cause) {
    return Err({ at: "filesystem", cause })
  }
}
