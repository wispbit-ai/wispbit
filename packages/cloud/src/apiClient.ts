export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface LineReference {
  start: number
  end: number
  side: "LEFT" | "RIGHT"
}

export interface McpViolation {
  id: string
  fileName: string
  lineNumbers: string
  lineNumberSide: "LEFT" | "RIGHT"
  isResolved: boolean
  description: string
  ruleName: string
  ruleId: string
}

export interface McpOtherComment {
  id: number
  author: string
  body: string
  path: string
  lineReferences: LineReference[]
  isResolved: boolean
  created_at: string
}

export interface McpGrepRule {
  id: string
  name: string
  content: string
  directory: string
  include: string
}

export class WispbitApiClient {
  private baseUrl: string
  private apiKey: string

  constructor(apiKey: string, host: string) {
    this.baseUrl = host
    this.apiKey = apiKey
  }

  private async makeRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    // Add authorization header if API key is available
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      })

      const contentType = response.headers.get("content-type")
      let data: any

      if (contentType && contentType.includes("application/json")) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          message: typeof data === "string" ? data : data?.message || "Unknown error",
        }
      }

      return {
        success: true,
        data,
      }
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      }
    }
  }

  // POST request
  async post<T = any>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return await this.makeRequest<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }
}

export class WispbitApi {
  private client: WispbitApiClient

  constructor(apiKey: string, host: string) {
    this.client = new WispbitApiClient(apiKey, host)
  }

  // Grep rules API call
  async grepRules(params: {
    pattern: string
    case_sensitive?: boolean
    repository_url: string
  }): Promise<ApiResponse<{ rules: McpGrepRule[] }>> {
    return await this.client.post("/mcpv1/grep-rules", params)
  }

  // Create rule API call
  async createRule(params: {
    repository_url: string
    prompt: string
  }): Promise<ApiResponse<{ success: boolean }>> {
    return await this.client.post("/mcpv1/create-rule", params)
  }

  // Update rule API call
  async updateRule(params: {
    rule_id: string
    prompt: string
  }): Promise<ApiResponse<{ success: boolean }>> {
    return await this.client.post(`/mcpv1/update-rule`, {
      rule_id: params.rule_id,
      prompt: params.prompt,
    })
  }

  // Get violations API call
  async getViolations(params: {
    repository_url: string
    pull_request_number: number
    show_other_comments?: boolean
  }): Promise<ApiResponse<{ violations: McpViolation[]; other_comments?: McpOtherComment[] }>> {
    return await this.client.post(`/mcpv1/get-violations`, {
      repository_url: params.repository_url,
      pull_request_number: params.pull_request_number,
      show_other_comments: params.show_other_comments,
    })
  }
}

// Factory function to create API instance
export function createWispbitApi(apiKey: string, host: string): WispbitApi {
  return new WispbitApi(apiKey, host)
}
