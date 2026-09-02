// Copy the built hledger wasm into the app.
//
//   node scripts/sync-hledger.mjs
//
// The wasm module and its generated JSFFI glue are build outputs of ../../wasm,
// not source, so they are not checked in. The wasm goes to public/ to be served
// as a plain asset (and precached by workbox); the glue is a JS module and goes
// into src/ to be bundled.

import { copyFile, mkdir } from "node:fs/promises";

const WASM_OUT = "../../wasm/out";

// The names the build writes, which are the cabal target's -- hledger-bindings,
// after the D stage of the size pipeline. Older names from earlier targets are
// still in that directory, so these are spelled out rather than guessed at.
const TARGET = "hledger-bindings";
const copies = [
  [`${WASM_OUT}/${TARGET}-D.wasm`, "public/hledger.wasm"],
  [`${WASM_OUT}/${TARGET}.jsffi.mjs`, "src/core/hledger/ghc-jsffi.mjs"],
];

await mkdir("src/core/hledger", { recursive: true });
for (const [from, to] of copies) {
  try {
    await copyFile(from, to);
    console.log(`${from} -> ${to}`);
  } catch (e) {
    console.error(`missing ${from}; run ../../wasm/scripts/build.sh hledger-bindings first`);
    process.exitCode = 1;
  }
}
