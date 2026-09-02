import type { JSX } from "solid-js"

import listTreeSvg from "./list-tree.svg?raw"
import fileTextSvg from "./file-text.svg?raw"
import percentSvg from "./percent.svg?raw"
import landmarkSvg from "./landmark.svg?raw"
import calendarCheckSvg from "./calendar-check.svg?raw"

/**
 * This edition's icons, drawn the way core draws its.
 *
 * Its own rather than core's, for the reason the edition contract gives: an
 * edition brings its own screens and reusing a core icon would put the balance
 * sheet's scales beside a second screen that is not the balance sheet. Same
 * source, same weight, same trick — the SVG bodies live beside this file with
 * `currentColor` and `width/height=100%`, so they inherit colour and take their
 * size from the class they are handed.
 *
 * All lucide, at the version core vendors, with the licence comment each file
 * came with. Anything added later comes from there too.
 */

export type IconProps = { readonly class?: string }

const icon =
  (svg: string) =>
  (props: IconProps): JSX.Element => (
    <span class={`inline-flex shrink-0 ${props.class ?? ""}`} aria-hidden="true" innerHTML={svg} />
  )

/** A chart of accounts: names hanging off names. */
export const ChartIcon = icon(listTreeSvg)

/** The statements: a document with figures on it. */
export const StatementsIcon = icon(fileTextSvg)

/** Consumption tax, which is a rate. */
export const ConsumptionTaxIcon = icon(percentSvg)

/** Fixed assets: what a company owns and keeps. */
export const FixedAssetsIcon = icon(landmarkSvg)

/** The year end, which is a date something has to be done by. */
export const ClosingIcon = icon(calendarCheckSvg)
