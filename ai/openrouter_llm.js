import { BaseLlm, LLMRegistry } from '@google/adk'

/**
 * OpenRouter LLM implementation for Google ADK.
 * Translates between Google's Content format and OpenAI-compatible API.
 */
export class OpenRouterLlm extends BaseLlm {
  static get supportedModels() {
    return [/^openrouter\/.*/]
  }

  constructor({ model }) {
    super({ model })
    this.apiKey = process.env.OPENROUTER_API_KEY
    this.baseUrl =
      process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
    // Strip 'openrouter/' prefix to get the actual model name
    this.openRouterModel = model.replace(/^openrouter\//, '')
  }

  /**
   * Convert Google Content format to OpenAI messages format.
   */
  convertToOpenAIMessages(contents, systemInstruction) {
    const messages = []

    // Add system instruction if present
    if (systemInstruction) {
      const systemText =
        typeof systemInstruction === 'string'
          ? systemInstruction
          : systemInstruction.parts?.map((p) => p.text).join('\n') || ''
      if (systemText) {
        messages.push({ role: 'system', content: systemText })
      }
    }

    // Convert each content to a message
    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : content.role
      const parts = content.parts || []

      // Check if this content contains function calls (tool use by the assistant)
      const functionCalls = parts.filter((p) => p.functionCall)
      if (functionCalls.length > 0) {
        const textParts = parts.filter((p) => p.text).map((p) => p.text)
        messages.push({
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('\n') : null,
          tool_calls: functionCalls.map((p, i) => ({
            id: `call_${p.functionCall.name}_${i}`,
            type: 'function',
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args || {}),
            },
          })),
        })
        continue
      }

      // Check if this content contains function responses (tool results)
      const functionResponses = parts.filter((p) => p.functionResponse)
      if (functionResponses.length > 0) {
        for (const p of functionResponses) {
          messages.push({
            role: 'tool',
            tool_call_id: `call_${p.functionResponse.name}_0`,
            content:
              typeof p.functionResponse.response === 'string'
                ? p.functionResponse.response
                : JSON.stringify(p.functionResponse.response),
          })
        }
        continue
      }

      // Regular message — may contain text and/or inline images
      const textParts = parts.filter((p) => p.text)
      const imageParts = parts.filter((p) => p.inlineData)

      if (imageParts.length > 0) {
        // Build OpenAI multi-part content array for vision messages
        /** @type {Array<Object>} */
        const content = []
        for (const p of textParts) {
          content.push({ type: 'text', text: p.text })
        }
        for (const p of imageParts) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
            },
          })
        }
        messages.push({ role, content })
      } else if (textParts.length > 0) {
        messages.push({
          role,
          content: textParts.map((p) => p.text).join('\n'),
        })
      }
    }

    return messages
  }

  /**
   * Convert Google tools to OpenAI tools format.
   */
  convertToOpenAITools(toolsDict) {
    if (!toolsDict || Object.keys(toolsDict).length === 0) {
      return undefined
    }

    const tools = []
    for (const [name, tool] of Object.entries(toolsDict)) {
      // MCP tools have a .mcpTool with the raw MCP schema (name, description, inputSchema).
      // We use that directly since ADK's _getDeclaration() crashes on schemas with missing type fields.
      const mcpTool = tool.mcpTool
      if (mcpTool) {
        tools.push({
          type: 'function',
          function: {
            name: mcpTool.name || name,
            description: mcpTool.description || '',
            parameters: mcpTool.inputSchema || {
              type: 'object',
              properties: {},
            },
          },
        })
      } else if (tool.declaration) {
        tools.push({
          type: 'function',
          function: {
            name: tool.declaration.name || name,
            description: tool.declaration.description || '',
            parameters: tool.declaration.parameters || {
              type: 'object',
              properties: {},
            },
          },
        })
      }
    }

    return tools.length > 0 ? tools : undefined
  }

  /**
   * Convert OpenAI response to Google LlmResponse format.
   */
  convertToLlmResponse(chunk, isStreaming = false) {
    const choice = chunk.choices?.[0]
    if (!choice) {
      return { content: undefined }
    }

    const delta = isStreaming ? choice.delta : choice.message
    const parts = []

    // Handle text content
    if (delta?.content) {
      parts.push({ text: delta.content })
    }

    // Handle tool calls
    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.function) {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: toolCall.function.arguments
                ? JSON.parse(toolCall.function.arguments)
                : {},
            },
          })
        }
      }
    }

    const finishReason = choice.finish_reason
    const isComplete = finishReason === 'stop' || finishReason === 'tool_calls'

    return {
      content: parts.length > 0 ? { role: 'model', parts } : undefined,
      partial: isStreaming && !isComplete,
      turnComplete: isComplete,
      finishReason: isComplete ? 'STOP' : undefined,
      usageMetadata: chunk.usage
        ? {
            promptTokenCount: chunk.usage.prompt_tokens,
            candidatesTokenCount: chunk.usage.completion_tokens,
            totalTokenCount: chunk.usage.total_tokens,
          }
        : undefined,
    }
  }

  /**
   * Generates content from OpenRouter API.
   */
  async *generateContentAsync(llmRequest, stream = false) {
    const messages = this.convertToOpenAIMessages(
      llmRequest.contents,
      llmRequest.config?.systemInstruction,
    )
    const tools = this.convertToOpenAITools(llmRequest.toolsDict)

    console.log(
      '[OpenRouter] Tools available:',
      tools ? tools.map((t) => t.function.name) : 'none',
    )
    console.log(
      '[OpenRouter] Messages count:',
      messages.length,
      'Roles:',
      messages.map((m) => m.role),
    )
    console.log('[OpenRouter] Calling API...')

    const body = {
      model: this.openRouterModel,
      messages,
      stream,
      ...(tools && { tools }),
      ...(llmRequest.config?.temperature !== undefined && {
        temperature: llmRequest.config.temperature,
      }),
      ...(llmRequest.config?.maxOutputTokens && {
        max_tokens: llmRequest.config.maxOutputTokens,
      }),
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/anthropics/claude-code',
        'X-Title': 'Slack Assistant',
      },
      body: JSON.stringify(body),
    })

    console.log('[OpenRouter] API responded:', response.status)

    if (!response.ok) {
      const error = await response.text()
      console.log('[OpenRouter] Error response:', error)
      yield {
        errorCode: response.status.toString(),
        errorMessage: `OpenRouter API error: ${error}`,
      }
      return
    }

    if (stream) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') {
              return
            }
            try {
              const chunk = JSON.parse(data)
              yield this.convertToLlmResponse(chunk, true)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } else {
      const data = await response.json()
      const llmResponse = this.convertToLlmResponse(data, false)

      yield llmResponse
    }
  }

  /**
   * Live connections not supported for OpenRouter.
   */
  async connect(_llmRequest) {
    throw new Error('Live connections are not supported for OpenRouter')
  }
}

// Register the OpenRouter LLM with the registry
LLMRegistry.register(OpenRouterLlm)
