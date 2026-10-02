import type { JSX } from 'solid-js'
import receiptSvg from './receipt.svg?raw'
import scaleSvg from './scale.svg?raw'
import settingsSvg from './settings.svg?raw'
import panelLeftSvg from './panel-left.svg?raw'
import plusSvg from './plus.svg?raw'
import xSvg from './x.svg?raw'
import helpSvg from './help.svg?raw'
import downloadSvg from './download.svg?raw'
import fileCodeSvg from './file-code.svg?raw'
import cloudSvg from './cloud.svg?raw'
import importSvg from './import.svg?raw'
import refreshCwSvg from './refresh-cw.svg?raw'
import searchSvg from './search.svg?raw'
import chevronLeftSvg from './chevron-left.svg?raw'
import gitBranchSvg from './git-branch.svg?raw'
import funnelSvg from './funnel.svg?raw'

/**
 * Icons. The SVG bodies live beside this file as .svg files, drawn with
 * `currentColor` and sized `width/height=100%` so they inherit colour and fit
 * whatever box they are given. This module only pours them into a span and
 * makes them Solid components; size (h-4 w-4) and colour (text-*) are passed as
 * classes by the caller.
 *
 * All of them are lucide, so anything added later should come from there too
 * rather than mixing drawing styles.
 */
export type IconProps = { class?: string }

const icon =
  (svg: string) =>
  (props: IconProps): JSX.Element =>
    (<span class={`inline-flex shrink-0 ${props.class ?? ''}`} aria-hidden="true" innerHTML={svg} />)

/**
 * The books, each drawn as what it is rather than as what it looks like: the
 * slips as they come in, and the scales everything written has to come to.
 */
/** The daily journal — the slips as they come in. */
export const ReceiptIcon = icon(receiptSvg)
/** The statements: a pair of scales, which is what the books must balance to. */
export const ScaleIcon = icon(scaleSvg)
/** Settings. */
export const SettingsIcon = icon(settingsSvg)
/** Narrowing what a report covers. */
export const FunnelIcon = icon(funnelSvg)
/** The repository the books are kept in, and the history of what was sent to it. */
export const GitBranchIcon = icon(gitBranchSvg)
/** Fold or unfold the side panel. */
export const PanelLeftIcon = icon(panelLeftSvg)
/** Add something new. */
export const PlusIcon = icon(plusSvg)
/** Dismiss or close. */
export const XIcon = icon(xSvg)
/** What can be done here: a question mark in a circle. */
export const HelpIcon = icon(helpSvg)
/** Take the books out of the app. */
export const DownloadIcon = icon(downloadSvg)
/** The file behind what is on screen, opened as the text it is. */
export const FileCodeIcon = icon(fileCodeSvg)
/** Back the way you came. */
/** Somewhere else the books are kept. */
export const CloudIcon = icon(cloudSvg)
/** Taking something into the books: receipts photographed, statements downloaded. */
export const ImportIcon = icon(importSvg)

export const RefreshIcon = icon(refreshCwSvg)

export const SearchIcon = icon(searchSvg)

export const ChevronLeftIcon = icon(chevronLeftSvg)
