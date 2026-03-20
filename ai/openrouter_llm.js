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
        // Track per-name call count so IDs match the corresponding response IDs.
        // Using name+count (not a global index) ensures responses can reconstruct
        // the same ID without needing to know the global position.
        /** @type {Record<string, number>} */
        const callNameCount = {}
        messages.push({
          role: 'assistant',
          content: textParts.length > 0 ? textParts.join('\n') : null,
          tool_calls: functionCalls.map((p) => {
            const name = p.functionCall.name
            const count = callNameCount[name] ?? 0
            callNameCount[name] = count + 1
            return {
              id: `call_${name}_${count}`,
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify(p.functionCall.args || {}),
              },
            }
          }),
        })
        continue
      }

      // Check if this content contains function responses (tool results)
      const functionResponses = parts.filter((p) => p.functionResponse)
      if (functionResponses.length > 0) {
        // Mirror the per-name counter used when building function calls above
        // so tool_call_id values always match their originating call ID.
        /** @type {Record<string, number>} */
        const responseNameCount = {}
        for (const p of functionResponses) {
          const name = p.functionResponse.name
          const count = responseNameCount[name] ?? 0
          responseNameCount[name] = count + 1
          console.log(`[OpenRouter] Tool response: ${name}`, JSON.stringify(p.functionResponse.response, null, 2))
          messages.push({
            role: 'tool',
            tool_call_id: `call_${name}_${count}`,
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
          /** @type {Record<string, unknown>} */
          let args = {}
          if (toolCall.function.arguments) {
            try {
              args = JSON.parse(toolCall.function.arguments)
            } catch {
              // Streaming can deliver partial JSON across chunks; skip malformed args
              console.log(
                '[OpenRouter] Could not parse tool arguments for',
                toolCall.function.name,
                '— skipping',
              )
            }
          }
          console.log(`[OpenRouter] Tool call: ${toolCall.function.name}`, JSON.stringify(args, null, 2))
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args,
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
      finishReason: isComplete
        ? /** @type {import('@google/genai').FinishReason} */ ('STOP')
        : undefined,
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

    // Check if any message contains image content
    const hasImages = messages.some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((p) => p.type === 'image_url'),
    )

    if (hasImages) {
      console.log(
        '[OpenRouter] Vision request detected — excluding Bedrock provider',
      )
    }

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
      // Exclude Bedrock for vision — it rejects base64 images
      ...(hasImages && {
        provider: { ignore: ['Amazon Bedrock'] },
      }),
    }

    console.log('[OpenRouter] Calling API...')

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer':
          'https://github.com/slack-samples/bolt-js-assistant-template',
        'X-Title': 'Ticketron Slack Assistant',
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

      try {
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
                // Skip invalid JSON in SSE stream
              }
            }
          }
        }
      } finally {
        // Always release the reader lock, even if the consumer breaks early
        reader.cancel().catch(() => {})
      }
    } else {
      const raw = await response.text()
      let data
      try {
        data = JSON.parse(raw)
      } catch {
        console.log('[OpenRouter] Non-JSON response body:', raw.slice(0, 200))
        yield {
          errorCode: 'INVALID_RESPONSE',
          errorMessage: `OpenRouter returned non-JSON: ${raw.slice(0, 200)}`,
        }
        return
      }
      const llmResponse = this.convertToLlmResponse(data, false)

      yield llmResponse
    }
  }

  /**
   * Live connections not supported for OpenRouter.
   * @returns {Promise<import('@google/adk').BaseLlmConnection>}
   */
  async connect(_llmRequest) {
    throw new Error('Live connections are not supported for OpenRouter')
  }
}

// Register the OpenRouter LLM with the registry
LLMRegistry.register(OpenRouterLlm)
