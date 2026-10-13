import type { CommandReport } from "~/core/hledger/wire"
import { Err, Ok, type Result } from "~/core/lib/monad"

export const CUSTOM_REPORT_PREFIX = "custom:"

export interface SavedReport {
  readonly id: string
  readonly name: string
  readonly command: string
}

export type DefinitionTrouble =
  | { readonly kind: "missing-name" }
  | { readonly kind: "missing-command" }
  | { readonly kind: "invalid-storage" }
  | { readonly kind: "storage"; readonly cause: unknown }

export const reportDefinition = (id: string, name: string, command: string): Result<SavedReport, DefinitionTrouble> =>
  name.trim() === "" ? Err({ kind: "missing-name" })
    : command.trim() === "" ? Err({ kind: "missing-command" })
    : Ok({ id, name: name.trim(), command: command.trim() })

export const replaceReport = (reports: readonly SavedReport[], report: SavedReport): readonly SavedReport[] =>
  reports.some((kept) => kept.id === report.id)
    ? reports.map((kept) => kept.id === report.id ? report : kept)
    : [...reports, report]

export const decodedReports = (value: unknown): Result<readonly SavedReport[], DefinitionTrouble> => {
  if (!Array.isArray(value)) return Err({ kind: "invalid-storage" })
  const valid = value.every((row: unknown) => {
    if (typeof row !== "object" || row === null) return false
    const report = row as Record<string, unknown>
    return typeof report.id === "string" && report.id !== ""
      && typeof report.name === "string" && report.name.trim() !== ""
      && typeof report.command === "string" && report.command.trim() !== ""
  })
  return valid && new Set(value.map((report: SavedReport) => report.id)).size === value.length
    ? Ok(value as readonly SavedReport[]) : Err({ kind: "invalid-storage" })
}

export const addressOfCustomReport = (id: string): string => `/reports#${CUSTOM_REPORT_PREFIX}${encodeURIComponent(id)}`

export const customReportIdOf = (hash: string): string | undefined => {
  const page = hash.replace(/^#/, "").split("+")[0]
  return page.startsWith(CUSTOM_REPORT_PREFIX)
    ? decodeURIComponent(page.slice(CUSTOM_REPORT_PREFIX.length))
    : undefined
}

/** Native HTML is reduced to the report elements before it enters the app DOM. */
export const contentOfReport = (report: CommandReport, translateHeader: (header: string) => string = (header) => header): string =>
  report.format === "html" ? sanitizedHtml(report.output, translateHeader) : `<pre>${escapedText(report.output)}</pre>`

const reportElements = new Set([
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "CAPTION", "COLGROUP", "COL",
  "DIV", "SPAN", "P", "PRE", "BR", "B", "STRONG", "I", "EM", "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI",
])

const reportAttributes = new Set(["align", "class", "colspan", "rowspan", "scope"])

const sanitizedHtml = (html: string, translateHeader: (header: string) => string): string => {
  const source = new DOMParser().parseFromString(html, "text/html")
  const clean = (node: Node): Node | undefined => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "")
    if (!(node instanceof Element) || !reportElements.has(node.tagName)) return undefined
    const copy = document.createElement(node.tagName.toLowerCase())
    for (const attribute of Array.from(node.attributes)) {
      if (reportAttributes.has(attribute.name)) copy.setAttribute(attribute.name, attribute.value)
    }
    if (node.tagName === "TH") {
      copy.textContent = translateHeader(node.textContent?.trim() ?? "")
      return copy
    }
    for (const child of Array.from(node.childNodes)) {
      const kept = clean(child)
      if (kept !== undefined) copy.appendChild(kept)
    }
    return copy
  }
  return Array.from(source.body.childNodes).flatMap((node) => {
    const kept = clean(node)
    return kept === undefined ? [] : [kept]
  }).map((node) => node instanceof Element ? node.outerHTML : escapedText(node.textContent ?? "")).join("")
}

const escapedText = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
