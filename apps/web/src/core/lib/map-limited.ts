/** Apply an asynchronous function without allowing more than `limit` calls at once. */
export const mapLimited = async <T, U>(
  items: readonly T[],
  limit: number,
  read: (item: T, index: number) => Promise<U>,
): Promise<readonly U[]> => {
  if (items.length === 0) return []
  const width = Math.max(1, Math.floor(limit))
  const results: U[] = []
  const next = { value: 0 }
  const worker = async (): Promise<void> => {
    const index = next.value++
    if (index >= items.length) return
    results[index] = await read(items[index]!, index)
    await worker()
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => worker()))
  return results
}
