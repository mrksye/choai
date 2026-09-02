/**
 * A promise settled from somewhere other than the work it stands for.
 *
 * For the one thing a signal cannot do: let something outside the reactive
 * graph — a test, a script — wait for a moment that is already arranged to
 * happen elsewhere. Settling again after the first time does nothing, so
 * whoever holds it need not know whether they are first.
 */
export interface Deferred<T> {
  readonly promise: Promise<T>
  readonly settle: (value: T) => void
}

export const deferred = <T,>(): Deferred<T> => {
  const held: { settle?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => {
    held.settle = resolve
  })

  return {
    promise,
    settle: (value: T): void => held.settle?.(value),
  }
}
