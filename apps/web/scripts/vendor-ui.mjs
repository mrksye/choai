// Copy components out of solid-ui into this repo.
//
//   node scripts/vendor-ui.mjs button card table ...
//
// solid-ui is a copy-paste collection rather than a runtime dependency, which is
// the point: the components become ours to edit. This script exists so that the
// copying is recorded and repeatable instead of being a one-off manual step, and
// so the upstream revision is written into each file.
//
// Imports are rewritten from solid-ui's docs-app layout (~/registry/ui/...) to
// where they live here (~/components/ui/...).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const REPO = "stefan-karger/solid-ui";
const REF = "main";
const SOURCE = `https://raw.githubusercontent.com/${REPO}/${REF}/apps/docs/src/registry/ui`;
const DEST = "src/core/components/ui";

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("usage: vendor-ui.mjs <component> [component...]");
  process.exit(1);
}

await mkdir(DEST, { recursive: true });

for (const name of names) {
  const response = await fetch(`${SOURCE}/${name}.tsx`);
  if (!response.ok) {
    console.error(`${name}: ${response.status} ${response.statusText}`);
    process.exitCode = 1;
    continue;
  }
  const body = (await response.text()).replaceAll("~/registry/ui/", "~/components/ui/");
  const header = `// Vendored from ${REPO} (${REF}): apps/docs/src/registry/ui/${name}.tsx\n` +
    `// Edited freely -- this is a copy, not a dependency. Re-fetch with scripts/vendor-ui.mjs.\n\n`;
  const path = `${DEST}/${name}.tsx`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, header + body);

  // Surface any sibling components this one needs, so nothing is missed.
  const needs = [...body.matchAll(/~\/components\/ui\/([a-z-]+)/g)].map((m) => m[1]);
  const missing = [...new Set(needs)].filter((n) => !names.includes(n));
  console.log(`${name}: ${body.split("\n").length} lines` +
    (missing.length ? `  (also needs: ${missing.join(", ")})` : ""));
}

// Copied code carries its terms with it, so the licence is fetched alongside
// and written where the app's licence page reads it. Recorded here rather than
// typed out by hand, for the same reason the components are.
const licence = await fetch(`https://raw.githubusercontent.com/${REPO}/${REF}/LICENSE`);
if (licence.ok) {
  const entry = {
    name: "solid-ui",
    origin: "vendored",
    license: "MIT",
    homepage: `https://github.com/${REPO}`,
    note: `Components copied into ${DEST}, not installed as a dependency.`,
    text: (await licence.text()).trim(),
  };
  await mkdir("src/core/licenses", { recursive: true });
  await writeFile("src/core/licenses/vendored.json", `${JSON.stringify([entry], null, 2)}\n`);
  console.log("licence: src/core/licenses/vendored.json");
} else {
  console.error(`licence: ${licence.status} ${licence.statusText} -- vendored.json left as it was`);
  process.exitCode = 1;
}
