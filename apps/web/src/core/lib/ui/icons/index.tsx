import type { JSX } from 'solid-js'
import receiptSvg from './receipt.svg?raw'
import scaleSvg from './scale.svg?raw'
import trendingUpSvg from './trending-up.svg?raw'
import bookOpenSvg from './book-open.svg?raw'
import settingsSvg from './settings.svg?raw'
import panelLeftSvg from './panel-left.svg?raw'
import plusSvg from './plus.svg?raw'
import xSvg from './x.svg?raw'
import helpSvg from './help.svg?raw'
import downloadSvg from './download.svg?raw'
import fileCodeSvg from './file-code.svg?raw'
import cloudSvg from './cloud.svg?raw'
import sparklesSvg from './sparkles.svg?raw'
import paperclipSvg from './paperclip.svg?raw'
import sendSvg from './send.svg?raw'
import circleStopSvg from './circle-stop.svg?raw'
import refreshCwSvg from './refresh-cw.svg?raw'
import searchSvg from './search.svg?raw'
import chevronLeftSvg from './chevron-left.svg?raw'

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
 * The four books, each drawn as what it is rather than as what it looks like.
 *
 * A slip, the book those slips are gathered into, the scales that book has to
 * come to, and the line it traces over a period. One drawn structurally instead
 * — two columns, a table — reads as a different sort of claim beside the other
 * three, and two columns is the balance sheet's shape as much as anything's.
 */
/** The daily journal — the slips as they come in. */
export const ReceiptIcon = icon(receiptSvg)
/** The trial balance — every account gathered into the one book. */
export const BookOpenIcon = icon(bookOpenSvg)
/** The balance sheet: a pair of scales, which is what it must balance to. */
export const ScaleIcon = icon(scaleSvg)
/** The income statement — change over a period. */
export const TrendingUpIcon = icon(trendingUpSvg)
/** Settings. */
export const SettingsIcon = icon(settingsSvg)
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
/** Asking rather than looking: the same books, answered in words. */
export const SparklesIcon = icon(sparklesSvg)
/** Something brought along with what is being said — a receipt, a statement. */
export const PaperclipIcon = icon(paperclipSvg)
/** Send what has been written. */
export const SendIcon = icon(sendSvg)
/** Ending something that is under way, as against closing something that is not. */
export const CircleStopIcon = icon(circleStopSvg)

export const RefreshIcon = icon(refreshCwSvg)

export const SearchIcon = icon(searchSvg)

export const ChevronLeftIcon = icon(chevronLeftSvg)
