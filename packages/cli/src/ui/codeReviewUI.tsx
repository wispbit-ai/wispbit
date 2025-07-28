import { render, Box, Text, useStdout } from "ink"
import React, { useState, useLayoutEffect, useEffect } from "react"

import { FileWithStatus, ViolationDetail } from "@wispbit/cli/types"

interface CodeReviewUIProps {
  files: FileWithStatus[]
  totalFiles: number
  completedCount: number
  onExit?: () => void
}

// Ora-style spinner frames
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

// Cool waiting animation frames
const waitingFrames = ["◐", "◓", "◑", "◒"]

// Simplified config header
const SimpleConfigHeader = ({ model, localRulesCount }: ReviewUIOptions) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text>rules: </Text>
        <Text color="grey">local {localRulesCount || 0}</Text>
      </Box>
      <Box>
        <Text>model: </Text>
        <Text color="grey">{model || "Default model"}</Text>
      </Box>
    </Box>
  )
}

// Status icon mapper matching the screenshot format
const getStatusIcon = (
  status: FileWithStatus["status"],
  violations?: number,
  frame: number = 0,
  waitingFrame: number = 0,
  skippedReason?: string
): { icon: string; color: string } => {
  switch (status) {
    case "completed":
      return (violations && violations > 0) || skippedReason === "error"
        ? { icon: "⨉", color: "red" }
        : { icon: "✓", color: "green" }
    case "skipped":
      // Show red X for skipped files with previous review that have violations
      if (skippedReason === "cached") {
        if (violations && violations > 0) {
          return { icon: "⨉", color: "red" }
        }
        return { icon: "✓", color: "green" }
      }
      return { icon: "⊘", color: "gray" }
    case "processing":
      // Return current spinner frame for processing files
      return { icon: spinnerFrames[frame], color: "yellowBright" }
    default:
      // Return waiting animation frame for queued files
      return { icon: waitingFrames[waitingFrame], color: "yellow" }
  }
}

// Simple file row for status display with formatting similar to the screenshot
const FileRow = ({
  file,
  spinnerFrame,
  waitingFrame,
}: {
  file: FileWithStatus
  spinnerFrame: number
  waitingFrame: number
}) => {
  const statusInfo = getStatusIcon(
    file.status,
    file.violations?.length,
    spinnerFrame,
    waitingFrame,
    file.skippedReason
  )

  // Format the status text similar to the screenshot
  let statusText = ""
  let statusColor = "gray"

  if (file.status === "completed") {
    if (file.violations && file.violations.length > 0) {
      statusText = `${file.violations.length} violation${file.violations.length > 1 ? "s" : ""}`
      statusColor = "red"
    } else {
      statusText = "no violations"
      statusColor = "green"
    }
  } else if (file.status === "skipped") {
    if (file.skippedReason === "cached") {
      if (!file.violations || file.violations.length === 0) {
        statusText = "no violations (cached)"
        statusColor = "green"
      } else {
        statusText = `${file.violations.length} violation${file.violations.length > 1 ? "s" : ""} (cached)`
        statusColor = "red"
      }
    } else if (file.skippedReason === "no matching rules") {
      statusText = "skipped (no matching rules)"
      statusColor = "gray"
    } else if (file.skippedReason === "error") {
      statusText = "skipped (error)"
      statusColor = "red"
    } else {
      statusText = `skipped${file.skippedReason ? ` (${file.skippedReason})` : ""}`
      statusColor = "gray"
    }
  } else if (file.status === "processing") {
    statusText = "reviewing"
    statusColor = "yellowBright"
  } else {
    statusText = "queued"
    statusColor = "yellow"
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Box marginRight={1}>
          <Text color={statusInfo.color}>{statusInfo.icon}</Text>
        </Box>
        <Box marginRight={1}>
          <Text color={statusColor}>{file.fileName}:</Text>
        </Box>
        <Box>
          <Text color={statusColor}>{statusText}</Text>
        </Box>
      </Box>
      {/* Show rules being evaluated when processing */}
      {file.status === "processing" && file.rules && file.rules.length > 0 && (
        <Box marginLeft={4}>
          <Text color="blue">{file.rules.map((rule) => rule.name).join(", ")}</Text>
        </Box>
      )}
    </Box>
  )
}

const FileViolationDetails = ({ violations }: { violations: ViolationDetail[] }) => {
  return (
    <Box flexDirection="column" marginLeft={4}>
      {violations.map((violation, index) => {
        const lineInfo = `line ${violation.line.start}${
          violation.line.start !== violation.line.end ? `-${violation.line.end}` : ""
        }`

        return (
          <Text key={index} color="red">
            {index + 1}. {lineInfo} → {violation.description}
          </Text>
        )
      })}
    </Box>
  )
}

// Processing status component with simplified prompt
const ProcessingStatus = ({
  completedCount,
  totalFiles,
  waitingFrame,
  isReviewComplete,
}: {
  completedCount: number
  totalFiles: number
  waitingFrame: number
  isReviewComplete: boolean
}) => {
  const remaining = totalFiles - completedCount

  return (
    <Box marginTop={1} marginBottom={1} flexDirection="column">
      <Box width="100%">
        {!isReviewComplete && (
          <Box>
            <Box marginRight={1}>
              <Text color="yellow">{waitingFrames[waitingFrame]}</Text>
            </Box>
            <Text color="magenta">
              Processing: {completedCount}/{totalFiles} files ({remaining} remaining)
            </Text>
            <Text color="grey"> ctrl+c to exit</Text>
          </Box>
        )}
        {isReviewComplete && (
          <Box>
            <Box marginRight={1}>
              <Text color="green">✓</Text>
            </Box>
            <Text color="green" bold>
              Review completed!
            </Text>
          </Box>
        )}
        <Box flexGrow={1} />
      </Box>
    </Box>
  )
}

export interface ReviewUIOptions {
  /**
   * Rules directory path
   */
  rulesDir?: string

  /**
   * Model name
   */
  model?: string

  /**
   * Current branch name
   */
  currentBranch?: string

  /**
   * Branch being diffed against
   */
  diffBranch?: string

  /**
   * Commit being diffed against
   */
  diffCommit?: string

  /**
   * Count of local rules
   */
  localRulesCount?: number
}

/**
 * Create and render the code review UI
 */
export function createCodeReviewUI(
  files: { filename: string; patch?: string }[],
  options: ReviewUIOptions = {}
) {
  // Set up the file statuses
  const fileStatuses = new Map<string, FileWithStatus>()
  files.forEach((file) => {
    fileStatuses.set(file.filename, { fileName: file.filename, status: "queued" })
  })

  // Convert to the format our component needs
  const filesWithStatus: FileWithStatus[] = files.map((file) => ({
    fileName: file.filename,
    status: fileStatuses.get(file.filename)?.status || "queued",
  }))

  // Initialize UI state
  const initialState = {
    files: filesWithStatus,
    totalFiles: files.length,
    completedCount: 0,
    filesWithViolations: [] as string[],
    temporaryMessage: "",
  }

  // Create refs to store update functions
  const updateUIRef = { current: null as any }
  const cleanupRef = { current: null as any }
  const exitHandlerRef = { current: null as (() => void) | null }
  const rerunHandlerRef = { current: null as (() => void) | null }
  const changeDetectionIntervalRef = { current: null as NodeJS.Timeout | null }
  const temporaryMessageTimeoutRef = { current: null as NodeJS.Timeout | null }

  // Create a promise to ensure initialization is complete
  let resolveInitialized: () => void
  const initialized = new Promise<void>((resolve) => {
    resolveInitialized = resolve
  })

  // Add signal handlers for SIGINT (Ctrl+C)
  const cleanupSignalListeners = () => {
    process.off("SIGINT", handleExit)
    process.off("SIGTERM", handleExit)
  }

  const handleExit = () => {
    console.log("\nAborting code review...")
    if (cleanupRef.current) cleanupRef.current()
    unmount()
    cleanupSignalListeners()

    // Clear any change detection interval
    if (changeDetectionIntervalRef.current) {
      clearInterval(changeDetectionIntervalRef.current)
    }

    // Clear any temporary message timeout
    if (temporaryMessageTimeoutRef.current) {
      clearTimeout(temporaryMessageTimeoutRef.current)
    }

    // Call external exit handler if provided
    if (exitHandlerRef.current) exitHandlerRef.current()

    // We don't call process.exit here to allow the parent process
    // to handle the cleanup properly
  }

  // Set up the signal handlers
  process.on("SIGINT", handleExit)
  process.on("SIGTERM", handleExit)

  const { unmount } = render(
    <CodeReviewApp
      {...initialState}
      setUpdateUI={(updater) => {
        updateUIRef.current = updater
        if (resolveInitialized) resolveInitialized()
      }}
      setCleanup={(cleaner) => {
        cleanupRef.current = cleaner
      }}
      setExitHandler={(handler) => {
        exitHandlerRef.current = handler
      }}
      setRerunHandler={(handler) => {
        rerunHandlerRef.current = handler
      }}
      options={options}
    />
  )

  // Helper to safely call updateUI
  const safeUpdateUI = async (updates: Partial<typeof initialState>) => {
    await initialized
    if (updateUIRef.current) {
      updateUIRef.current(updates)
    }
  }

  // Return methods to manipulate the UI
  return {
    updateFileStatus: async (file: FileWithStatus) => {
      const files = [...initialState.files]
      const fileIndex = files.findIndex((f) => f.fileName === file.fileName)

      if (fileIndex >= 0) {
        files[fileIndex].status = file.status
        files[fileIndex].violations = file.violations
        files[fileIndex].skippedReason = file.skippedReason
        files[fileIndex].rules = file.rules

        // Add file to violations list if it has violations
        if (
          file.violations &&
          file.violations.length > 0 &&
          !initialState.filesWithViolations.includes(file.fileName)
        ) {
          initialState.filesWithViolations.push(file.fileName)
        }

        // Update completed count
        if (file.status === "completed" || file.status === "skipped") {
          initialState.completedCount++
        }

        await safeUpdateUI({
          files,
          completedCount: initialState.completedCount,
          filesWithViolations: initialState.filesWithViolations,
        })
      }
    },

    finishReview: async () => {
      // Show final state but don't clean up automatically
      await safeUpdateUI({})

      // Return a promise that resolves when the UI is ready
      return Promise.resolve()
    },

    cleanup: () => {
      if (cleanupRef.current) cleanupRef.current()
      unmount()
      cleanupSignalListeners()

      // Clear any change detection interval
      if (changeDetectionIntervalRef.current) {
        clearInterval(changeDetectionIntervalRef.current)
      }

      // Clear any temporary message timeout
      if (temporaryMessageTimeoutRef.current) {
        clearTimeout(temporaryMessageTimeoutRef.current)
      }
    },

    // Allow setting an external exit handler
    setExitHandler: (handler: () => void) => {
      exitHandlerRef.current = handler
    },

    // Add rerun handler setter
    setRerunHandler: (handler: () => void) => {
      rerunHandlerRef.current = handler
    },
  }
}

interface CodeReviewAppProps extends CodeReviewUIProps {
  setUpdateUI: (updater: (updates: Partial<CodeReviewUIProps>) => void) => void
  setCleanup: (cleaner: () => void) => void
  setExitHandler: (handler: () => void) => void
  setRerunHandler: (handler: () => void) => void
  options: ReviewUIOptions
  filesWithViolations: string[]
}

// The main app component
const CodeReviewApp = ({
  files,
  totalFiles,
  completedCount,
  filesWithViolations,
  setUpdateUI,
  setCleanup,
  setExitHandler,
  setRerunHandler,
  options,
  onExit,
}: CodeReviewAppProps) => {
  const [state, setState] = useState({
    files,
    totalFiles,
    completedCount,
    filesWithViolations,
  })
  const [spinnerFrame, setSpinnerFrame] = useState(0)
  const [waitingFrame, setWaitingFrame] = useState(0)

  const { stdout } = useStdout()
  const width = stdout.columns || 80

  // Set up spinner animation
  useEffect(() => {
    // Only animate if there are files in processing state
    const hasProcessingFiles = state.files.some((file) => file.status === "processing")
    const hasQueuedFiles = state.files.some((file) => file.status === "queued")

    if (hasProcessingFiles || hasQueuedFiles) {
      const timer = setInterval(() => {
        setSpinnerFrame((prev) => (prev + 1) % spinnerFrames.length)
        setWaitingFrame((prev) => (prev + 1) % waitingFrames.length)
      }, 100) // Update every 100ms for smooth animation

      return () => clearInterval(timer)
    }
  }, [state.files])

  // Set up the update function - using useLayoutEffect for synchronous execution
  useLayoutEffect(() => {
    setUpdateUI((updates) => {
      setState((currentState) => {
        return {
          ...currentState,
          ...updates,
        }
      })
    })

    setCleanup(() => {
      // Any cleanup needed
    })

    // Set exit handler if onExit prop exists from the props, not options
    if (onExit) {
      setExitHandler(onExit)
    }

    // Set rerun handler if onExit prop exists
    if (onExit) {
      setRerunHandler(onExit)
    }

    return () => {
      // Component cleanup
    }
  }, [])

  const isReviewComplete = state.completedCount === state.totalFiles

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text bold color="yellowBright">
          wispbit AI code reviewer
        </Text>
      </Box>

      <Box marginBottom={1} />

      <SimpleConfigHeader localRulesCount={options.localRulesCount} model={options.model} />

      {options.currentBranch && options.diffBranch && (
        <Box>
          <Text>diff: </Text>
          <Text color="cyan">{options.currentBranch} (+untracked/staged)</Text>
          <Text>{" -> "}</Text>
          <Text color="magenta">
            {options.diffBranch} ({options.diffCommit ? options.diffCommit.slice(0, 7) : "unknown"})
          </Text>
        </Box>
      )}
      <Box flexDirection="column">
        {state.files.map((file) => (
          <Box key={file.fileName} flexDirection="column" marginLeft={3}>
            <FileRow file={file} spinnerFrame={spinnerFrame} waitingFrame={waitingFrame} />
            {file.violations && file.violations.length > 0 && (
              <FileViolationDetails violations={file.violations} />
            )}
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <ProcessingStatus
          completedCount={state.completedCount}
          totalFiles={state.totalFiles}
          waitingFrame={waitingFrame}
          isReviewComplete={isReviewComplete}
        />
      </Box>
    </Box>
  )
}
