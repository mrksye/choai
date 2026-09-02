import type { JSX } from 'solid-js'
import xSvg from './x.svg?raw'

/**
 * The shell's own icons. Only what the shell itself draws lives here — it ships
 * its copy rather than reaching into the host application's icon set, so the
 * package keeps its promise of depending on nothing but solid-js.
 *
 * The SVG bodies sit beside this file, drawn with `currentColor` and sized
 * `width/height=100%` so they inherit colour and fit whatever box they are
 * given. Size and colour are passed as classes by the caller.
 */
export type IconProps = { class?: string }

const icon =
  (svg: string) =>
  (props: IconProps): JSX.Element =>
    (<span class={`inline-flex shrink-0 ${props.class ?? ''}`} aria-hidden="true" innerHTML={svg} />)

/** Dismiss or close. */
export const XIcon = icon(xSvg)
