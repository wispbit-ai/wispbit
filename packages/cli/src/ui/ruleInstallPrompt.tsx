import { Box, Text, render, useInput } from "ink"
import React, { useState, useEffect } from "react"

import {
  DefaultRuleCategory,
  loadDefaultRules,
  installCategoryRules,
} from "../commands/installCategoryRules"

interface RuleInstallPromptProps {
  onComplete: () => void
  onCancel: () => void
  showInitialPrompt?: boolean
}

type ViewState = "initial" | "loading" | "categories" | "installing" | "success"

/**
 * Prompt the user to select and install default rules
 */
export function promptForRuleInstall(showInitialPrompt: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    let unmount: (() => void) | null = null

    const handleComplete = () => {
      if (unmount) {
        unmount()
      }
      resolve(true)
    }

    const handleCancel = () => {
      if (unmount) {
        unmount()
      }
      resolve(false)
    }

    const RuleInstallPromptComponent: React.FC<RuleInstallPromptProps> = ({
      onComplete,
      onCancel,
      showInitialPrompt = false,
    }) => {
      const [viewState, setViewState] = useState<ViewState>(
        showInitialPrompt ? "initial" : "loading"
      )
      const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0)
      const [selectedInitialOption, setSelectedInitialOption] = useState<"install" | "exit">(
        "install"
      )
      const [categories, setCategories] = useState<DefaultRuleCategory[]>([])
      const [selectedCategory, setSelectedCategory] = useState<DefaultRuleCategory | null>(null)
      const [error, setError] = useState<string | null>(null)

      // Load categories when transitioning from initial to loading
      useEffect(() => {
        if (viewState === "loading") {
          const loadCategories = async () => {
            try {
              const loadedCategories = await loadDefaultRules()
              setCategories(loadedCategories)
              setViewState("categories")
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to load rules")
              setViewState("categories")
            }
          }
          loadCategories()
        }
      }, [viewState])

      useInput((input, key) => {
        if (key.escape || (key.ctrl && input === "c")) {
          onCancel()
          return
        }

        if (viewState === "initial") {
          if (key.upArrow || key.downArrow) {
            setSelectedInitialOption(selectedInitialOption === "install" ? "exit" : "install")
          } else if (key.return) {
            if (selectedInitialOption === "install") {
              setViewState("loading")
            } else {
              onCancel()
            }
          }
        } else if (viewState === "categories") {
          if (key.upArrow) {
            setSelectedCategoryIndex(Math.max(0, selectedCategoryIndex - 1))
          } else if (key.downArrow) {
            setSelectedCategoryIndex(Math.min(categories.length - 1, selectedCategoryIndex + 1))
          } else if (key.return) {
            if (categories.length > 0 && selectedCategoryIndex < categories.length) {
              setSelectedCategory(categories[selectedCategoryIndex])
              installSelectedCategory(categories[selectedCategoryIndex])
            }
          }
        } else if (viewState === "success") {
          // Remove the Enter key handler since we auto-exit now
        }
      })

      const installSelectedCategory = async (category: DefaultRuleCategory) => {
        setViewState("installing")
        setError(null)

        try {
          await installCategoryRules(category)
          setViewState("success")
          // Exit immediately after successful installation
          onComplete()
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unknown error occurred")
          setViewState("categories")
        }
      }

      if (viewState === "initial") {
        return (
          <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="yellowBright">
                No Rules Found
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text>It looks like you don't have any rules! Would you like to install some?</Text>
            </Box>

            <Box marginY={1} flexDirection="column">
              <Box>
                <Text color={selectedInitialOption === "install" ? "green" : "gray"}>
                  {selectedInitialOption === "install" ? "› " : "  "}Yes, install default rules
                </Text>
              </Box>
              <Box>
                <Text color={selectedInitialOption === "exit" ? "green" : "gray"}>
                  {selectedInitialOption === "exit" ? "› " : "  "}No, exit
                </Text>
              </Box>
            </Box>

            <Box marginTop={1}>
              <Text color="gray">Use arrow keys to navigate, Enter to select, Esc to cancel</Text>
            </Box>
          </Box>
        )
      }

      if (viewState === "loading") {
        return (
          <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="yellowBright">
                Loading Rules...
              </Text>
            </Box>
            <Text>Scanning rule directories...</Text>
          </Box>
        )
      }

      if (viewState === "categories") {
        if (categories.length === 0) {
          return (
            <Box flexDirection="column" padding={1}>
              <Box marginBottom={1}>
                <Text bold color="red">
                  No Rules Found
                </Text>
              </Box>

              <Box marginBottom={1}>
                <Text>No rule categories could be loaded from the rules directory.</Text>
              </Box>

              {error && (
                <Box marginBottom={1}>
                  <Text color="red">Error: {error}</Text>
                </Box>
              )}

              <Box marginTop={1}>
                <Text color="gray">Press Esc to cancel</Text>
              </Box>
            </Box>
          )
        }

        return (
          <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="yellowBright">
                Install Default Rules
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text>Select a language to install rules for:</Text>
            </Box>

            <Box flexDirection="column" marginY={1}>
              {categories.map((category, index) => (
                <Box key={category.language}>
                  <Text color={selectedCategoryIndex === index ? "green" : "gray"}>
                    {selectedCategoryIndex === index ? "› " : "  "}
                    {category.displayName} ({category.rules.length} rules)
                  </Text>
                </Box>
              ))}
            </Box>

            {error && (
              <Box marginTop={1}>
                <Text color="red">Error: {error}</Text>
              </Box>
            )}

            <Box marginTop={1}>
              <Text color="gray">Use arrow keys to navigate, Enter to install, Esc to cancel</Text>
            </Box>
          </Box>
        )
      }

      if (viewState === "installing") {
        return (
          <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="yellowBright">
                Installing Rules...
              </Text>
            </Box>
            <Text>Installing {selectedCategory?.displayName} rules to .wispbit/rules/</Text>
          </Box>
        )
      }

      if (viewState === "success") {
        return (
          <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
              <Text bold color="green">
                Rules Installed Successfully!
              </Text>
            </Box>

            <Box marginBottom={1}>
              <Text>
                {selectedCategory?.rules.length} {selectedCategory?.displayName} rule
                {selectedCategory?.rules.length === 1 ? "" : "s"} installed to .wispbit/rules/
              </Text>
            </Box>
          </Box>
        )
      }

      return null
    }

    const { unmount: u } = render(
      <RuleInstallPromptComponent
        onComplete={handleComplete}
        onCancel={handleCancel}
        showInitialPrompt={showInitialPrompt}
      />
    )

    unmount = u
  })
}
