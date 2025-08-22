#!/usr/bin/env node

process.emitWarning = () => {}
process.removeAllListeners("warning")

// Suppress specific experimental warnings
const originalEmit = process.emit
process.emit = function (event, ...args) {
  if (
    event === "warning" &&
    // @ts-expect-error - This is a workaround to suppress experimental warnings
    ((args[0] && args[0].name === "ExperimentalWarning") || (args[0] && args[0].code === "DEP0040"))
  ) {
    return false
  }
  // @ts-expect-error - This is a workaround to suppress experimental warnings
  return originalEmit.apply(process, [event, ...args])
} as typeof process.emit

// Use the file extension to help the module resolver find the file
// eslint-disable-next-line import/no-unresolved
import("./run.js")
