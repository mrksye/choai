/**
 * The editions this repository builds, and what each of them is called.
 *
 * One code base, two deployments: `choai.dev` serves the global edition and
 * `jp.choai.dev` the Japanese one. Which of them a build is comes from
 * `CHOAI_EDITION` at build time, never from anything the running app asks —
 * an edition is a fact about a deployment, not a setting somebody turns on.
 *
 * This file is plain data with no imports of its own, because it is read from
 * both sides of the build: `vite.config.ts` needs the name for the manifest an
 * installed app is listed under, and the app needs it for the window it is
 * looked at in. The module an edition is built from is
 * `src/editions/<id>/index.ts` — by the directory it is kept in rather than by a
 * path written down here, so there is one fewer thing to keep in step.
 */
export const EDITIONS = {
  global: { name: "choai" },
  jp: { name: "choai JP" },
} as const

export type EditionId = keyof typeof EDITIONS

/**
 * The edition a build is when nothing says otherwise.
 *
 * The global edition, because it is the one that depends on nowhere: a build
 * that has forgotten to say what it is should come out as the app for anybody,
 * not as one country's tax rules loose in the world.
 */
export const DEFAULT_EDITION = "global" satisfies EditionId

export const isEditionId = (name: string): name is EditionId => Object.hasOwn(EDITIONS, name)

/** What an edition calls itself — the app's own name, in this build. */
export const nameOf = (id: EditionId): string => EDITIONS[id].name
