import path from "path"
import fs from "fs"

const pkgDir = path.resolve(import.meta.dirname, "../packages/opencode")
const outDir = path.resolve(import.meta.dirname, "../dist")

fs.mkdirSync(outDir, { recursive: true })

const { createSolidTransformPlugin } = await import("@opentui/solid/bun-plugin")
const plugin = createSolidTransformPlugin()

console.log("Bundling opencode → dist/ac.js")

const result = await Bun.build({
  entrypoints: [path.join(pkgDir, "src/index.ts")],
  outfile: path.join(outDir, "ac.js"),
  target: "bun",
  format: "esm",
  tsconfig: path.join(pkgDir, "tsconfig.json"),
  plugins: [plugin],
  external: ["node-gyp", "@parcel/watcher"],
  conditions: ["browser"],
  sourcemap: "none",
  define: {
    OPENCODE_VERSION: `'0.1.0'`,
    OPENCODE_MIGRATIONS: "[]",
    OPENCODE_MODELS_DEV: "{}",
    OTUI_TREE_SITTER_WORKER_PATH: '""',
    OPENCODE_WORKER_PATH: '""',
    OPENCODE_CHANNEL: '"dev"',
    OPENCODE_LIBC: '""',
  },
})

if (result.success) {
  const stats = fs.statSync(path.join(outDir, "ac.js"))
  console.log(`  ✓ ac.js (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
  console.log(`  ✓ ${result.outputs.length} output(s)`)
} else {
  console.log("Build failed:")
  for (const log of result.logs) {
    console.log(`  ${log}`)
  }
  process.exit(1)
}
