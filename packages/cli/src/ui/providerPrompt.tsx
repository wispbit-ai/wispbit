import { PasswordInput } from "@inkjs/ui"
import { Box, Text, render, useInput } from "ink"
import React, { useState } from "react"

import { PROVIDERS } from "@wispbit/cli/providers"

interface ProviderPromptProps {
  onSubmit: (provider: string, apiKey: string) => void
  onCancel: () => void
}

export interface ProviderSelection {
  provider: string
  apiKey: string
}

/**
 * Prompt the user to select a provider and enter API key
 * @returns A promise that resolves to the provider selection or null if canceled
 */
export function promptForProvider(): Promise<ProviderSelection | null> {
  return new Promise((resolve) => {
    let unmount: (() => void) | null = null

    const handleSubmit = (provider: string, apiKey: string) => {
      if (unmount) {
        unmount()
      }
      resolve({ provider, apiKey })
    }

    const handleCancel = () => {
      if (unmount) {
        unmount()
      }
      resolve(null)
    }

    const ProviderPromptComponent: React.FC<ProviderPromptProps> = ({ onSubmit, onCancel }) => {
      const [selectedProviderIndex, setSelectedProviderIndex] = useState(0)
      const [apiKey, setApiKey] = useState("")
      const [step, setStep] = useState<"select-provider" | "enter-api-key">("select-provider")
      const [error, setError] = useState<string | null>(null)

      const selectedProvider = PROVIDERS[selectedProviderIndex]

      useInput((input, key) => {
        if (key.escape || (key.ctrl && input === "c")) {
          onCancel()
          return
        }

        if (step === "select-provider") {
          if (key.upArrow) {
            setSelectedProviderIndex((prev) => (prev > 0 ? prev - 1 : PROVIDERS.length - 1))
          } else if (key.downArrow) {
            setSelectedProviderIndex((prev) => (prev < PROVIDERS.length - 1 ? prev + 1 : 0))
          } else if (key.return) {
            setStep("enter-api-key")
          }
        } else if (step === "enter-api-key") {
          if (key.return && apiKey.trim()) {
            onSubmit(selectedProvider.id, apiKey.trim())
          } else if (key.leftArrow && input === "") {
            setStep("select-provider")
            setApiKey("")
            setError(null)
          }
        }
      })

      const handleApiKeySubmit = () => {
        if (!apiKey.trim()) {
          setError("API key cannot be empty.")
          return
        }
        onSubmit(selectedProvider.id, apiKey.trim())
      }

      return (
        <Box flexDirection="column" padding={1}>
          <Box marginBottom={1}>
            <Text bold color="green">
              Configure Code Review Provider
            </Text>
          </Box>

          {step === "select-provider" && (
            <>
              <Box marginBottom={1}>
                <Text>Select a provider for code review:</Text>
              </Box>

              <Box marginBottom={2} flexDirection="column">
                {PROVIDERS.map((provider, index) => (
                  <Box key={provider.id} marginY={0}>
                    <Text color={index === selectedProviderIndex ? "green" : "gray"}>
                      {index === selectedProviderIndex ? "› " : "  "}
                      {provider.name} - {provider.description}
                    </Text>
                  </Box>
                ))}
              </Box>

              <Box marginTop={1}>
                <Text color="gray">Use arrow keys to navigate, Enter to select</Text>
              </Box>
            </>
          )}

          {step === "enter-api-key" && (
            <>
              <Box marginBottom={1}>
                <Text>
                  Selected provider:{" "}
                  <Text bold color="green">
                    {selectedProvider.name}
                  </Text>
                </Text>
              </Box>

              <Box marginBottom={1}>
                <Text>Please enter your {selectedProvider.apiKeyName}:</Text>
              </Box>

              {error && (
                <Box marginBottom={1}>
                  <Text color="red">{error}</Text>
                </Box>
              )}

              <Box marginBottom={1}>
                <Text>{selectedProvider.apiKeyName}: </Text>
                <PasswordInput
                  onChange={setApiKey}
                  placeholder="Enter your API key"
                  onSubmit={handleApiKeySubmit}
                />
              </Box>

              <Box marginTop={1}>
                <Text color="gray">
                  Press Enter to submit, Left arrow to go back, Ctrl+C to cancel
                </Text>
              </Box>
            </>
          )}
        </Box>
      )
    }

    const { unmount: u } = render(
      <ProviderPromptComponent onSubmit={handleSubmit} onCancel={handleCancel} />
    )

    unmount = u
  })
}
