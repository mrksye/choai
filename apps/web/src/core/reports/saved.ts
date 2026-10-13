import { createRoot, createSignal } from "solid-js"
import { Err, Ok, type Result } from "~/core/lib/monad"
import { decodedReports, replaceReport, type DefinitionTrouble, type SavedReport } from "./custom"

const KEY = "choai.reports"

const readSaved = (): Result<readonly SavedReport[], DefinitionTrouble> => {
  try {
    const written = localStorage.getItem(KEY) ?? undefined
    return written === undefined ? Ok([]) : decodedReports(JSON.parse(written) as unknown)
  } catch (cause) {
    return Err({ kind: "storage", cause })
  }
}

const [saved, setSaved] = createRoot(() => createSignal(readSaved()))
export const savedReports = saved

const keep = (reports: readonly SavedReport[]): Result<readonly SavedReport[], DefinitionTrouble> => {
  try {
    localStorage.setItem(KEY, JSON.stringify(reports))
    setSaved(Ok(reports))
    return Ok(reports)
  } catch (cause) {
    return Err({ kind: "storage", cause })
  }
}

export const saveReport = (report: SavedReport): Result<readonly SavedReport[], DefinitionTrouble> => {
  const current = saved()
  return current.ok ? keep(replaceReport(current.value, report)) : current
}

export const removeReport = (id: string): Result<readonly SavedReport[], DefinitionTrouble> => {
  const current = saved()
  return current.ok ? keep(current.value.filter((report) => report.id !== id)) : current
}
