import fs from "fs"
import os from "os"
import path from "path"

import { Provider, PROVIDERS } from "@wispbit/cli/providers"

// Configuration file paths
export const CONFIG_DIR = path.join(os.homedir(), ".wispbit")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

// Default configuration
const DEFAULT_CONFIG = {
  provider: "",
  openrouterApiKey: "",
  anthropicApiKey: "",
}

// Interface for the configurations
interface WispbitConfig {
  provider: string
  openrouterApiKey: string
  anthropicApiKey: string
}

/**
 * Ensure the config directory exists
 */
export function ensureDirExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Load the config from disk
 */
export function loadConfig(): WispbitConfig {
  ensureDirExists(CONFIG_DIR)

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }

  try {
    const configData = fs.readFileSync(CONFIG_FILE, "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(configData) }
  } catch (error) {
    console.error("Error loading config, using defaults:", error)
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * Save the config to disk
 */
export function saveConfig(config: WispbitConfig): void {
  ensureDirExists(CONFIG_DIR)
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * Get the configured provider
 */
export function getProvider(): Provider | null {
  const config = loadConfig()
  return PROVIDERS.find((provider) => provider.id === config.provider) || null
}

export function getProviderById(id: string): Provider | null {
  return PROVIDERS.find((provider) => provider.id === id) || null
}

/**
 * Save provider to config
 */
export function saveProvider(provider: string): void {
  const config = loadConfig()
  config.provider = provider
  saveConfig(config)
}

/**
 * Get the API key for a specific provider
 */
export function getProviderApiKey(provider: string): string | null {
  const config = loadConfig()

  switch (provider) {
    case "openrouter":
      return config.openrouterApiKey || process.env.OPENROUTER_API_KEY || null
    case "anthropic":
      return config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null
    default:
      return null
  }
}

/**
 * Save API key for a specific provider
 */
export function saveProviderApiKey(provider: string, apiKey: string): void {
  const config = loadConfig()

  switch (provider) {
    case "openrouter":
      config.openrouterApiKey = apiKey
      break
    case "anthropic":
      config.anthropicApiKey = apiKey
      break
  }

  saveConfig(config)
}
