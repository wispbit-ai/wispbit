#!/usr/bin/env node

import { spawn } from "child_process"
import fs from "fs"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

import * as esbuild from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read package.json to get dependencies
const packageJson = JSON.parse(fs.readFileSync(resolve(__dirname, "package.json"), "utf8"))
const dependencies = Object.keys(packageJson.dependencies || {})

// Node.js built-in modules that should always be external
const nodeBuiltins = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "vm",
  "zlib",
]

function buildTypeScript() {
  return new Promise<void>((resolve, reject) => {
    console.log("Generating TypeScript declarations...")

    const tsc = spawn(
      "npx",
      ["tsc", "--declaration", "--emitDeclarationOnly", "--outDir", "dist", "--declarationMap"],
      {
        stdio: "inherit",
        shell: true,
        cwd: __dirname,
      }
    )

    tsc.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`TypeScript compilation failed with code ${code}`))
      }
    })
  })
}

async function build() {
  console.log("Building SDK with esbuild...")

  try {
    // Clean dist directory
    if (fs.existsSync(resolve(__dirname, "dist"))) {
      fs.rmSync(resolve(__dirname, "dist"), { recursive: true })
    }
    fs.mkdirSync(resolve(__dirname, "dist"), { recursive: true })

    // Build ESM version with multiple entry points
    await esbuild.build({
      entryPoints: [
        "src/codebaseRules.ts",
        "src/openai.ts",
        "src/types.ts",
        "src/tools.ts",
        "src/patchParser.ts",
        "src/CodeReviewer.ts",
        "src/CodeReviewerExecutor.ts",
        // Add missing entry points
        "src/CodeReviewerViolationValidator.ts",
        "src/models.ts",
        "src/hash.ts",
        "src/fileExists.ts",
        "src/isExecutable.ts",
        "src/codeReviewPrompt.ts",
      ],
      bundle: true,
      platform: "node",
      target: "node16",
      outdir: "dist",
      format: "esm",
      external: [
        // Keep external dependencies external
        ...dependencies,
        // Don't bundle Node.js built-in modules
        ...nodeBuiltins,
        // Make internal SDK imports external so they resolve to subpath exports
        "@wispbit/sdk/*",
        "@wispbit/sdk",
      ],
      minify: false,
      sourcemap: true,
      treeShaking: true,
      splitting: false,
      metafile: true,
    })

    // Generate TypeScript declarations
    await buildTypeScript()

    console.log("Build complete!")

    // Copy package.json to dist directory (optional for publishing)
    const distPackageJson = {
      ...packageJson,
      devDependencies: undefined,
      scripts: undefined,
      private: false,
      // Fix paths since this package.json will be inside the dist directory
      main: packageJson.main?.replace(/^dist\//, "") || "CodeReviewer.js",
      types: packageJson.types?.replace(/^dist\//, "") || "CodeReviewer.d.ts",
      exports: Object.fromEntries(
        Object.entries(packageJson.exports || {}).map(([key, value]: [string, any]) => [
          key,
          {
            types: value.types?.replace(/^\.\/dist\//, "./"),
            import: value.import?.replace(/^\.\/dist\//, "./"),
          },
        ])
      ),
    }
    fs.writeFileSync(
      resolve(__dirname, "dist/package.json"),
      JSON.stringify(distPackageJson, null, 2)
    )

    // Copy README.md to dist directory
    fs.copyFileSync(resolve(__dirname, "README.md"), resolve(__dirname, "dist/README.md"))

    console.log("SDK build successful!")
  } catch (error) {
    console.error("Build failed:", error)
    process.exit(1)
  }
}

build()
