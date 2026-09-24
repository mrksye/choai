import { For, Show, createResource, type JSX } from "solid-js"

import { SnagNote } from "~/core/components/github-panel"
import { detailOf } from "~/core/github/history"
import { fromPatch } from "~/core/lib/diff"
import { t } from "~/core/i18n"
import { DiffView } from "./diff-view"

/**
 * One commit: what it said, who made it, and every file it changed.
 *
 * Each file is folded until opened, because a commit that touched a dozen
 * files is otherwise a page of patches to scroll past to reach the one wanted.
 * One that changed a single file is opened already, since there is no choosing
 * to do.
 */
export function CommitView(props: { readonly sha: string }): JSX.Element {
  const [detail] = createResource(() => props.sha, detailOf)
  const read = () => {
    const result = detail()
    return result?.ok === true ? result.value : undefined
  }
  const snag = () => {
    const result = detail()
    return result?.ok === false ? result.error : undefined
  }
  return (
    <>
      <Show when={detail.loading}>
        <p class="text-xs text-muted-foreground">{t("git.readingCommit")}</p>
      </Show>
      <Show when={snag()}>{(cause) => <SnagNote snag={cause()} />}</Show>
      <Show when={detail.loading ? undefined : read()}>
        {(commit) => (
          <article class="flex flex-col gap-3">
            <header class="flex flex-col gap-1">
              <p class="whitespace-pre-wrap text-sm font-medium">{commit().message}</p>
              <p class="text-xs text-muted-foreground">
                {commit().author} · {new Date(commit().at).toLocaleString()} · <code>{commit().sha.slice(0, 7)}</code>
              </p>
              <p class="text-xs text-muted-foreground">{t("git.filesChanged", { count: commit().files.length })}</p>
            </header>
            <For each={commit().files}>
              {(file) => (
                <details open={commit().files.length === 1}>
                  <summary class="cursor-pointer text-xs">
                    <span class="font-mono">{file.path}</span>{" "}
                    <span class="text-success-foreground">+{file.additions}</span>{" "}
                    <span class="text-error-foreground">−{file.deletions}</span>
                  </summary>
                  <div class="mt-1">
                    <Show when={file.patch} fallback={<p class="text-xs text-muted-foreground">{t("git.noPatch")}</p>}>
                      {(patch) => <DiffView lines={fromPatch(patch())} />}
                    </Show>
                  </div>
                </details>
              )}
            </For>
          </article>
        )}
      </Show>
    </>
  )
}
