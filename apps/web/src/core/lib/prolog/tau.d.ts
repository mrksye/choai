/**
 * The little of Tau Prolog this app touches. It ships no types of its own.
 */

declare module "tau-prolog" {
  export interface TauTerm {
    readonly id?: string
    readonly args?: readonly TauTerm[]
    readonly value?: number
  }

  export interface TauAnswer {
    readonly links: Readonly<Record<string, TauTerm>>
  }

  export interface TauSession {
    consult(
      program: string,
      options: {
        success: () => void
        error: (cause: unknown) => void
        script?: boolean
        file?: boolean
        url?: boolean
        html?: boolean
      },
    ): void
    query(goal: string, options: { success: () => void; error: (cause: unknown) => void }): void
    answer(options: {
      success: (answer: TauAnswer) => void
      fail: () => void
      error: (cause: unknown) => void
      limit: () => void
    }): void
    format_answer(answer: unknown): string
  }

  export interface Tau {
    create(limit?: number): TauSession
  }

  const tau: Tau
  export default tau
}

declare module "tau-prolog/modules/lists.js" {
  import type { Tau } from "tau-prolog"
  const lists: (tau: Tau) => void
  export default lists
}
