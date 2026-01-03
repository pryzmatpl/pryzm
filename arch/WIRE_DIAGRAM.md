# Void Software - Wire Diagram

This document illustrates the architectural components of Void, their relationships, and data flow patterns.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Electron Application"
        subgraph "Main Process (Node.js)"
            Main[Main Process<br/>electron-main/app.ts]
            LLMChannel[LLMMessageChannel<br/>IPC Channel]
            PDFChannel[PDFReaderChannel<br/>IPC Channel]
            OCRChannel[OCRChannel<br/>IPC Channel]
            MCPChannel[MCPChannel<br/>IPC Channel]
            LLMImpl[sendLLMMessage.impl<br/>Provider Implementations]
        end

        subgraph "Browser Process (Renderer)"
            UI[React UI Components<br/>SidebarChat.tsx]
            CTS[ChatThreadService<br/>Message Orchestration]
            LLMS[LLMMessageService<br/>LLM Communication]
            TS[ToolsService<br/>Tool Execution]
            VS[VoidModelService<br/>File Models]
            ECS[EditCodeService<br/>Code Editing]
            TTS[TerminalToolService<br/>Terminal Commands]
            SS[ScreenshotService<br/>Screenshot Capture]
        end

        subgraph "Common (Shared)"
            Types[Type Definitions<br/>toolsServiceTypes.ts]
            Prompts[Tool Prompts<br/>prompts.ts]
            Settings[VoidSettingsService<br/>Configuration]
        end
    end

    subgraph "External Services"
        LLMProviders[LLM Providers<br/>OpenAI, Anthropic,<br/>Ollama, etc.]
        MCPServers[MCP Servers<br/>Model Context Protocol]
    end

    UI -->|User Input| CTS
    CTS -->|Send Messages| LLMS
    LLMS -->|IPC| LLMChannel
    LLMChannel -->|Route| LLMImpl
    LLMImpl -->|HTTP/WebSocket| LLMProviders

    LLMImpl -->|Tool Definitions| Prompts
    LLMImpl -->|Tool Results| LLMChannel
    LLMChannel -->|IPC| LLMS
    LLMS -->|Callbacks| CTS

    CTS -->|Execute Tools| TS
    TS -->|Read Files| VS
    TS -->|Edit Files| ECS
    TS -->|Run Commands| TTS
    TS -->|Screenshots| SS
    TS -->|PDF Reading| PDFChannel
    TS -->|OCR| OCRChannel
    TS -->|MCP Tools| MCPChannel

    PDFChannel -->|IPC| Main
    OCRChannel -->|IPC| Main
    MCPChannel -->|IPC| Main
    MCPChannel -->|MCP Protocol| MCPServers

    TS -->|Type Definitions| Types
    TS -->|Tool Definitions| Prompts
    CTS -->|Settings| Settings
    LLMS -->|Settings| Settings

    style Main fill:#e1f5ff
    style LLMChannel fill:#e1f5ff
    style LLMImpl fill:#e1f5ff
    style CTS fill:#fff4e1
    style TS fill:#fff4e1
    style LLMS fill:#fff4e1
```

## Process Communication Architecture

```mermaid
graph LR
    subgraph "Browser Process"
        B1[React Components]
        B2[Services]
        B3[IPC Client]
    end

    subgraph "IPC Layer"
        IPC[Electron IPC<br/>Message Ports]
    end

    subgraph "Main Process"
        M1[IPC Channels]
        M2[LLM Implementation]
        M3[Node.js APIs]
    end

    B1 --> B2
    B2 --> B3
    B3 -->|Serialized Data| IPC
    IPC -->|Deserialize| M1
    M1 --> M2
    M2 --> M3

    M3 -->|Results| M2
    M2 -->|Events| M1
    M1 -->|Serialized Events| IPC
    IPC -->|Deserialize| B3
    B3 -->|Callbacks| B2
    B2 -->|Update State| B1

    style IPC fill:#ffebee
    style M1 fill:#e1f5ff
    style B3 fill:#fff4e1
```

## Tool System Architecture

```mermaid
graph TB
    subgraph "Tool Definition Layer"
        Prompts[prompts.ts<br/>Tool Descriptions]
        Types[toolsServiceTypes.ts<br/>Type Definitions]
    end

    subgraph "Tool Execution Layer"
        TS[ToolsService<br/>Orchestrator]

        subgraph "Builtin Tools"
            ReadFile[read_file]
            WriteFile[rewrite_file]
            EditFile[edit_file]
            Search[search_*]
            Terminal[run_command]
            PDF[read_pdf]
            Screenshot[read_screenshot]
        end

        subgraph "Tool Dependencies"
            VS[VoidModelService]
            FS[FileService]
            ECS[EditCodeService]
            TTS[TerminalToolService]
            SS[ScreenshotService]
            MainChannels[Main Process Channels]
        end
    end

    subgraph "MCP Tools"
        MCPService[MCPService]
        MCPServers[External MCP Servers]
    end

    Prompts --> TS
    Types --> TS

    TS --> ReadFile
    TS --> WriteFile
    TS --> EditFile
    TS --> Search
    TS --> Terminal
    TS --> PDF
    TS --> Screenshot

    ReadFile --> VS
    ReadFile --> FS
    WriteFile --> VS
    WriteFile --> ECS
    EditFile --> VS
    EditFile --> ECS
    Search --> FS
    Terminal --> TTS
    PDF --> MainChannels
    Screenshot --> SS
    Screenshot --> MainChannels

    TS --> MCPService
    MCPService --> MCPServers

    style TS fill:#fff4e1
    style Prompts fill:#e8f5e9
    style Types fill:#e8f5e9
```

## LLM Communication Architecture

```mermaid
graph TB
    subgraph "Browser Process"
        CTS[ChatThreadService]
        LLMS[LLMMessageService]
    end

    subgraph "IPC"
        Channel[void-channel-llmMessage]
    end

    subgraph "Main Process"
        LLMChannel[LLMMessageChannel]
        Router[sendLLMMessage.ts<br/>Router]

        subgraph "Provider Implementations"
            OpenAI[OpenAI Implementation]
            Anthropic[Anthropic Implementation]
            Ollama[Ollama Implementation]
            Gemini[Gemini Implementation]
            Groq[Groq Implementation]
            Mistral[Mistral Implementation]
        end
    end

    subgraph "External"
        APIs[LLM Provider APIs]
    end

    CTS -->|Messages| LLMS
    LLMS -->|IPC Call| Channel
    Channel -->|Route| LLMChannel
    LLMChannel -->|Delegate| Router

    Router -->|Select Provider| OpenAI
    Router -->|Select Provider| Anthropic
    Router -->|Select Provider| Ollama
    Router -->|Select Provider| Gemini
    Router -->|Select Provider| Groq
    Router -->|Select Provider| Mistral

    OpenAI -->|HTTP/WS| APIs
    Anthropic -->|HTTP/WS| APIs
    Ollama -->|HTTP/WS| APIs
    Gemini -->|HTTP/WS| APIs
    Groq -->|HTTP/WS| APIs
    Mistral -->|HTTP/WS| APIs

    APIs -->|Stream| OpenAI
    APIs -->|Stream| Anthropic
    APIs -->|Stream| Ollama
    APIs -->|Stream| Gemini
    APIs -->|Stream| Groq
    APIs -->|Stream| Mistral

    OpenAI -->|Events| LLMChannel
    Anthropic -->|Events| LLMChannel
    Ollama -->|Events| LLMChannel
    Gemini -->|Events| LLMChannel
    Groq -->|Events| LLMChannel
    Mistral -->|Events| LLMChannel

    LLMChannel -->|IPC Events| Channel
    Channel -->|Callbacks| LLMS
    LLMS -->|Update| CTS

    style Router fill:#e1f5ff
    style LLMChannel fill:#e1f5ff
    style Channel fill:#ffebee
```

## File System and Model Management

```mermaid
graph TB
    subgraph "Browser Process"
        TS[ToolsService]
        VS[VoidModelService]
        ECS[EditCodeService]
    end

    subgraph "VSCode Services"
        FS[FileService<br/>VSCode Core]
        MS[MarkerService<br/>Linting]
        WS[WorkspaceService<br/>Context]
    end

    subgraph "Editor"
        Model[ITextModel<br/>File Model]
        Editor[ICodeEditor<br/>Editor Instance]
    end

    subgraph "File System"
        Files[Physical Files]
    end

    TS -->|Read| VS
    TS -->|Edit| ECS
    VS -->|Get/Create| Model
    VS -->|Read| FS
    ECS -->|Modify| Model
    ECS -->|Check| MS

    FS -->|Read/Write| Files
    Model -->|Sync| Editor
    Editor -->|Display| Model

    VS -->|Workspace Context| WS
    TS -->|Workspace Context| WS

    style VS fill:#fff4e1
    style ECS fill:#fff4e1
    style Model fill:#e8f5e9
```

## Main Process IPC Channels

```mermaid
graph TB
    subgraph "Main Process - app.ts"
        App[CodeApplication]
        InitChannels[initChannels Method]
    end

    subgraph "Registered Channels"
        LLMChannel[void-channel-llmMessage<br/>LLMMessageChannel]
        PDFChannel[void-channel-pdfReader<br/>PDFReaderChannel]
        OCRChannel[void-channel-ocr<br/>OCRChannel]
        MCPChannel[void-channel-mcp<br/>MCPChannel]
        NativeHost[nativeHost<br/>NativeHostService]
        FileService[file<br/>FileService]
    end

    subgraph "Browser Process Access"
        BrowserServices[Services access via<br/>IMainProcessService]
    end

    App --> InitChannels
    InitChannels --> LLMChannel
    InitChannels --> PDFChannel
    InitChannels --> OCRChannel
    InitChannels --> MCPChannel
    InitChannels --> NativeHost
    InitChannels --> FileService

    BrowserServices -->|getChannel| LLMChannel
    BrowserServices -->|getChannel| PDFChannel
    BrowserServices -->|getChannel| OCRChannel
    BrowserServices -->|getChannel| MCPChannel

    style InitChannels fill:#e1f5ff
    style LLMChannel fill:#fff4e1
    style PDFChannel fill:#fff4e1
    style OCRChannel fill:#fff4e1
```

## Data Flow: Complete Request Cycle

```mermaid
flowchart TD
    Start([User Input]) --> BuildMsg[Build Message History<br/>with Context]
    BuildMsg --> SendIPC[Send via IPC Channel]
    SendIPC --> MainRoute[Main Process Routes]
    MainRoute --> SelectProvider[Select LLM Provider]
    SelectProvider --> CallAPI[Call Provider API]
    CallAPI --> Stream[Stream Response]
    Stream --> CheckTool{Tool Call?}

    CheckTool -->|Yes| Validate[Validate Tool Params]
    CheckTool -->|No| Final[Final Response]

    Validate --> Approval{Needs Approval?}
    Approval -->|Yes| WaitUser[Wait for User]
    Approval -->|No| Execute[Execute Tool]
    WaitUser -->|Approved| Execute
    WaitUser -->|Rejected| Cancel([Cancel])

    Execute --> ToolType{Tool Type?}
    ToolType -->|Builtin| RunBuiltin[Run in Browser]
    ToolType -->|MCP| RunMCP[Call MCP Server]
    ToolType -->|Main Process| RunMain[Call IPC Channel]

    RunBuiltin --> Format[Format Result]
    RunMCP --> Format
    RunMain --> Format

    Format --> AddHistory[Add to Message History]
    AddHistory --> SendIPC

    Final --> Checkpoint[Save Checkpoint]
    Checkpoint --> End([Complete])

    style Start fill:#e8f5e9
    style End fill:#e8f5e9
    style CheckTool fill:#fff4e1
    style Execute fill:#e1f5ff
```

## Service Dependency Graph

```mermaid
graph TD
    subgraph "Core Services"
        CTS[ChatThreadService]
        LLMS[LLMMessageService]
        TS[ToolsService]
    end

    subgraph "Supporting Services"
        VS[VoidModelService]
        ECS[EditCodeService]
        TTS[TerminalToolService]
        SS[ScreenshotService]
        MCPS[MCPService]
        VSS[VoidSettingsService]
        DDS[DirectoryStrService]
        CBS[VoidCommandBarService]
    end

    subgraph "VSCode Core Services"
        FS[FileService]
        MS[MarkerService]
        WS[WorkspaceService]
        SS2[SearchService]
        MPS[MainProcessService]
    end

    CTS --> LLMS
    CTS --> TS
    CTS --> VSS
    CTS --> DDS

    LLMS --> MPS
    LLMS --> VSS
    LLMS --> MCPS

    TS --> VS
    TS --> ECS
    TS --> TTS
    TS --> SS
    TS --> MCPS
    TS --> FS
    TS --> MS
    TS --> WS
    TS --> SS2
    TS --> MPS
    TS --> DDS
    TS --> CBS
    TS --> VSS

    VS --> FS
    ECS --> VS
    ECS --> MS

    style CTS fill:#fff4e1
    style LLMS fill:#fff4e1
    style TS fill:#fff4e1
```

