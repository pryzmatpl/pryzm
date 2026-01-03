# Void Software - Time Step Diagram

This document illustrates the sequence of events when a user interacts with Void's AI assistant, showing the flow from user input through tool execution to final response.

## Complete Message Flow with Tool Call

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI<br/>(SidebarChat)
    participant CTS as ChatThreadService<br/>(Browser)
    participant LLMS as LLMMessageService<br/>(Browser)
    participant IPC as IPC Channel<br/>(void-channel-llmMessage)
    participant Main as Main Process<br/>(LLMMessageChannel)
    participant LLMImpl as sendLLMMessage.impl<br/>(Provider API)
    participant LLM as LLM Provider<br/>(OpenAI/Anthropic/etc)
    participant TS as ToolsService<br/>(Browser)
    participant Tool as Tool Implementation<br/>(read_file, etc)
    participant MCP as MCP Service<br/>(Optional)

    User->>UI: Types message & submits
    UI->>CTS: addUserMessageAndStreamResponse()

    Note over CTS: Builds message history<br/>with context

    CTS->>LLMS: sendLLMMessage({messages, onText, onFinalMessage})
    LLMS->>IPC: call('sendLLMMessage', params)

    Note over IPC: Serializes params<br/>(strips functions)

    IPC->>Main: sendLLMMessage(params)
    Main->>LLMImpl: sendLLMMessage(params)
    LLMImpl->>LLM: HTTP/WebSocket Request

    Note over LLM: Processes request<br/>with tool definitions

    LLM-->>LLMImpl: Stream: Text chunks + Tool call
    LLMImpl-->>Main: onText({fullText, toolCall})
    Main-->>IPC: Emit onText event
    IPC-->>LLMS: onText callback
    LLMS-->>CTS: onText callback
    CTS-->>UI: Update UI with streaming text

    LLM-->>LLMImpl: Final message with complete tool call
    LLMImpl-->>Main: onFinalMessage({toolCall})
    Main-->>IPC: Emit onFinalMessage event
    IPC-->>LLMS: onFinalMessage callback
    LLMS-->>CTS: onFinalMessage callback

    Note over CTS: Detects tool call,<br/>enters tool execution loop

    CTS->>TS: validateParams(toolName, rawParams)
    TS-->>CTS: Validated params

    alt Tool requires approval
        CTS->>UI: Show approval dialog
        UI-->>CTS: User approves/rejects
        alt User rejects
            CTS-->>User: Request cancelled
        end
    end

    CTS->>TS: callTool(toolName, params)

    alt Builtin Tool
        TS->>Tool: Execute tool (e.g., read_file)
        Tool->>Tool: Access file system,<br/>read file contents
        Tool-->>TS: Tool result
    else MCP Tool
        TS->>MCP: Call MCP tool
        MCP->>MCP: Execute via MCP server
        MCP-->>TS: Tool result
    else Tool needs Main Process
        TS->>IPC: Call IPC channel<br/>(e.g., void-channel-pdfReader)
        IPC->>Main: Execute in main process
        Main-->>IPC: Result
        IPC-->>TS: Tool result
    end

    TS->>TS: stringOfResult(toolName, result)
    TS-->>CTS: Formatted tool result string

    Note over CTS: Adds tool result to<br/>message history as<br/>tool_response message

    CTS->>LLMS: sendLLMMessage({messages + tool_result})
    LLMS->>IPC: call('sendLLMMessage', params)
    IPC->>Main: sendLLMMessage(params)
    Main->>LLMImpl: sendLLMMessage(params)
    LLMImpl->>LLM: HTTP/WebSocket Request<br/>(with tool result)

    LLM-->>LLMImpl: Stream: Final response text
    LLMImpl-->>Main: onText({fullText})
    Main-->>IPC: Emit onText event
    IPC-->>LLMS: onText callback
    LLMS-->>CTS: onText callback
    CTS-->>UI: Update UI with final response

    LLM-->>LLMImpl: Final message (no tool call)
    LLMImpl-->>Main: onFinalMessage({fullText})
    Main-->>IPC: Emit onFinalMessage event
    IPC-->>LLMS: onFinalMessage callback
    LLMS-->>CTS: onFinalMessage callback

    Note over CTS: Tool loop complete,<br/>adds checkpoint

    CTS-->>User: Display final response
```

## Tool Execution Flow (Detailed)

```mermaid
sequenceDiagram
    participant CTS as ChatThreadService
    participant TS as ToolsService
    participant VS as VoidModelService
    participant FS as FileService
    participant Main as Main Process<br/>(IPC Channels)
    participant Tool as Tool Implementation

    Note over CTS: Tool call detected from LLM

    CTS->>TS: validateParams('read_file', {uri: '...'})
    TS->>TS: Validate URI format<br/>Check workspace context
    TS-->>CTS: {uri: URI, startLine: null, ...}

    CTS->>TS: callTool('read_file', params)

    TS->>VS: initializeModel(uri)
    VS->>FS: Check file exists
    FS-->>VS: File stat
    VS-->>TS: Model initialized

    TS->>VS: getModelSafe(uri)
    VS-->>TS: {model: ITextModel}

    TS->>VS: model.getValue() or<br/>model.getValueInRange()
    VS-->>TS: File contents

    TS->>TS: Paginate if needed<br/>(MAX_FILE_CHARS_PAGE)
    TS->>TS: stringOfResult('read_file', result)
    TS-->>CTS: Formatted result string

    Note over CTS: Result added to history
```

## IPC Channel Communication Pattern

```mermaid
sequenceDiagram
    participant Browser as Browser Process
    participant IPC as IPC Channel<br/>(Electron IPC)
    participant Main as Main Process
    participant Node as Node.js APIs

    Note over Browser: Cannot import node_modules<br/>directly

    Browser->>IPC: getChannel('void-channel-pdfReader')
    Browser->>IPC: channel.call('readPDF', params)

    IPC->>Main: PDFReaderChannel.call('readPDF')
    Main->>Node: fs.readFileSync(filePath)
    Main->>Node: import('pdf-parse')
    Node-->>Main: PDF data
    Main->>Main: Extract text, paginate
    Main-->>IPC: PDFResult
    IPC-->>Browser: Result
    Browser->>Browser: Use result in tool
```

## Multi-Tool Call Loop

```mermaid
stateDiagram-v2
    [*] --> UserMessage: User sends message
    UserMessage --> SendToLLM: Build message history
    SendToLLM --> Streaming: LLM streams response
    Streaming --> CheckToolCall: Response complete

    CheckToolCall --> ExecuteTool: Tool call detected
    CheckToolCall --> FinalResponse: No tool call

    ExecuteTool --> ValidateParams: Validate tool parameters
    ValidateParams --> CheckApproval: Params valid

    CheckApproval --> AwaitApproval: Requires approval
    CheckApproval --> RunTool: Auto-approved

    AwaitApproval --> RunTool: User approved
    AwaitApproval --> [*]: User rejected

    RunTool --> FormatResult: Tool executed
    FormatResult --> AddToHistory: Result formatted
    AddToHistory --> SendToLLM: Add tool_result to history

    FinalResponse --> AddCheckpoint: Save checkpoint
    AddCheckpoint --> [*]: Complete

    note right of ExecuteTool
        Tools can be:
        - Builtin (read_file, etc)
        - MCP tools
        - Main process tools (PDF, OCR)
    end note
```

## Error Handling Flow

```mermaid
sequenceDiagram
    participant LLM as LLM Provider
    participant Main as Main Process
    participant Browser as Browser Process
    participant UI as User Interface

    LLM-->>Main: Error response
    Main->>Main: onError({message, fullError})
    Main-->>Browser: Emit error event
    Browser->>Browser: onError callback
    Browser->>UI: Display error message
    UI-->>Browser: User dismisses error
    Browser->>Browser: Clear error state

    alt Retry Logic
        Browser->>Browser: Increment retry count
        Browser->>Main: Retry with same params
    else Abort
        Browser->>Main: abort(requestId)
        Main->>LLM: Cancel request
    end
```

