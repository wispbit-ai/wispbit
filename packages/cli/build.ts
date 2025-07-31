#!/usr/bin/env node

import fs from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

import * as esbuild from "esbuild"
import tscPlugin from "esbuild-plugin-tsc"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json to get dependencies
const packageJson = JSON.parse(fs.readFileSync(resolve(__dirname, "package.json"), "utf8"))
const dependencies = Object.keys(packageJson.dependencies || {})

// Filter out our internal packages so they get bundled
const externalDeps = dependencies.filter((dep) => !dep.startsWith("@wispbit/"))

// Node.js built-in modules that should not be bundled
const nodeBuiltins = [
  "node:os",
  "node:fs",
  "node:path",
  "node:url",
  "node:crypto",
  "node:http",
  "node:https",
  "node:stream",
  "node:buffer",
  "node:events",
  "node:util",
  "node:process",
  "node:child_process",
  "node:cluster",
  "node:dgram",
  "node:dns",
  "node:domain",
  "node:module",
  "node:net",
  "node:punycode",
  "node:querystring",
  "node:readline",
  "node:repl",
  "node:string_decoder",
  "node:sys",
  "node:timers",
  "node:tls",
  "node:tty",
  "node:vm",
  "node:worker_threads",
  "node:zlib",
  // Also include the non-prefixed versions
  "os",
  "fs",
  "path",
  "url",
  "crypto",
  "http",
  "https",
  "stream",
  "buffer",
  "events",
  "util",
  "process",
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "domain",
  "module",
  "net",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "tty",
  "vm",
  "worker_threads",
  "zlib",
]

async function build() {
  console.log("Building CLI with esbuild...")

  try {
    // Build the main application code (run.ts) first
    await esbuild.build({
      entryPoints: ["src/run.ts"],
      bundle: true,
      platform: "node",
      target: "node16",
      outfile: "dist/src/run.js",
      format: "esm",
      external: [
        // Keep external dependencies external, but bundle internal ones
        ...externalDeps,
        // Don't bundle Node.js built-in modules
        ...nodeBuiltins,
      ],
      minify: false,
      sourcemap: false,
      plugins: [
        tscPlugin({
          tsconfigPath: resolve(__dirname, "./tsconfig.json"),
        }),
      ],
    })

    // Build the thin wrapper (index.ts) separately
    await esbuild.build({
      entryPoints: ["src/index.ts"],
      bundle: true,
      platform: "node",
      target: "node16",
      outfile: "dist/src/index.js",
      format: "esm",
      external: [
        // Keep external dependencies external, but bundle internal ones
        ...externalDeps,
        // Don't bundle Node.js built-in modules
        ...nodeBuiltins,
        // Properly externalize the run.js file (not run.ts)
        "./run.js",
      ],
      minify: false,
      sourcemap: false,
      plugins: [
        tscPlugin({
          tsconfigPath: resolve(__dirname, "./tsconfig.json"),
        }),
      ],
    })

    console.log("Build complete!")

    // Make the output file executable
    fs.chmodSync(resolve(__dirname, "dist/src/index.js"), "755")

    // Copy package.json to dist directory
    fs.copyFileSync(resolve(__dirname, "package.json"), resolve(__dirname, "dist/package.json"))

    // Copy README.md from workspace root to dist directory
    fs.copyFileSync(resolve(__dirname, "../../README.md"), resolve(__dirname, "dist/README.md"))

    // No need for separate type generation as tscPlugin handles it
    console.log("TypeScript compilation complete.")
  } catch (error) {
    console.error("Build failed:", error)
    process.exit(1)
  }
}

build()
