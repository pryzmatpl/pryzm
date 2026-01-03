# Fix Tool Use in Void

## Context

Void is a local Cursor equivalent - an IDE supercharged with local LLMs. You are working on fixing critical issues with tool calling functionality that prevent the AI agent from properly executing tools and interacting with the file system.

## Critical Issues to Fix

### Issue 1: Tool Calls Return JSON Instead of Executing

**Problem**: When a user prompts the AI to read a file (e.g., "read the PKGBUILD in this project"), the AI agent returns a JSON object with the tool call instead of actually executing it:

```json
{"name":"read_file", "arguments":{"uri":"/path/to/PKGBUILD"}}
```

**Expected Behavior**: The tool should be executed immediately, and the file contents should be returned to the user.

**Root Cause Analysis Needed**:
- Check how tool calls are parsed from LLM responses in `src/vs/workbench/contrib/void/electron-main/llmMessage/extractGrammar.ts`
- Verify that `extractXMLToolsWrapper` properly extracts and triggers tool execution
- Ensure that when a tool call is detected, it flows through `chatThreadService._runToolCall` in `src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- Verify that the tool execution loop in `_runChatAgent` properly handles tool calls

### Issue 2: Workspace Directory Not Used as Anchor

**Problem**: Void does not use the currently opened directory as the default anchor/search directory. When a user asks to read a file, the system should:
1. First list the contents of the opened workspace folder
2. Use that folder as the base for relative paths
3. Search within that directory structure by default

**Expected Behavior**:
- When a workspace folder is open, it should be the default search anchor
- File paths should be resolved relative to the workspace root
- The system message should clearly indicate the workspace root to the AI
- Directory listings should start from the workspace root

**Files to Review**:
- `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts` - Check how `workspaceFolders` and `directoryStr` are generated
- `src/vs/workbench/contrib/void/common/directoryStrService.ts` - Verify directory tree generation starts from workspace root
- `src/vs/workbench/contrib/void/common/prompt/prompts.ts` - Ensure system message includes workspace root prominently
- `src/vs/workbench/contrib/void/browser/toolsService.ts` - Check path resolution in tool implementations

### Issue 3: Incorrect File Paths

**Problem**: The path to files (e.g., PKGBUILD) is wrong. This suggests:
- Path resolution is not working correctly
- Relative paths are not being resolved against workspace root
- File search is not finding files in the expected locations

**Expected Behavior**:
- When a user asks for "PKGBUILD", the system should search within the workspace
- Paths should be absolute and correct
- File search tools should work correctly

**Files to Review**:
- `src/vs/workbench/contrib/void/browser/toolsService.ts` - Check `search_pathnames_only`, `search_for_files`, and path resolution
- Verify URI construction and resolution in `read_file` tool
- Check how workspace context is used in path operations

### Issue 4: Tools Not Being Called

**Problem**: Tools are not being executed at all. This is the most critical issue - the entire tool calling infrastructure may be broken.

**Expected Behavior**:
- When the AI decides to use a tool, it should be executed immediately
- Tool results should be returned to the LLM
- The conversation should continue with tool results included

**Root Cause Analysis Needed**:
1. **Tool Call Detection**: Verify that XML tool calls are properly parsed from LLM responses
   - Check `extractXMLToolsWrapper` in `extractGrammar.ts`
   - Verify regex/parsing logic for XML tool tags
   - Ensure tool calls are extracted even when mixed with text

2. **Tool Execution Flow**: Trace the execution path:
   - LLM response → tool call extraction → `_runToolCall` → tool execution → result back to LLM
   - Check `chatThreadService.ts` `_runChatAgent` method
   - Verify the tool execution loop continues properly

3. **System Prompt**: Ensure the system prompt clearly instructs the AI on:
   - How to call tools (XML format)
   - When to call tools
   - That tools will be executed automatically
   - The workspace root directory

4. **Tool Definitions**: Verify tool definitions are properly included in the system message
   - Check `systemToolsXMLPrompt` in `prompts.ts`
   - Ensure `includeXMLToolDefinitions` is set correctly
   - Verify tool schemas are complete and correct

## Implementation Tasks

### Task 1: Fix Tool Call Execution

1. **Review Tool Call Parsing** (`extractGrammar.ts`):
   - Ensure `extractXMLToolsWrapper` correctly extracts tool calls from streaming text
   - Verify that partial XML tags are handled correctly
   - Check that tool calls are detected even when preceded by text
   - Ensure the tool call object is properly constructed

2. **Review Tool Execution** (`chatThreadService.ts`):
   - Verify `_runToolCall` is being called when a tool call is detected
   - Check that tool results are properly added to the conversation
   - Ensure the agent loop continues after tool execution
   - Verify error handling doesn't silently fail

3. **Add Debugging**:
   - Add console logs to track tool call detection
   - Log when tools are executed
   - Log tool results
   - Log any errors in the tool execution flow

### Task 2: Fix Workspace Directory Handling

1. **System Message Enhancement** (`prompts.ts`):
   - Make the workspace root directory more prominent in the system message
   - Add explicit instructions: "The workspace root is: [path]. All file operations should use this as the base directory."
   - Include instructions to list the workspace directory first when exploring

2. **Directory Service** (`directoryStrService.ts`):
   - Ensure `getAllDirectoriesStr` starts from workspace root
   - Verify directory tree includes the root prominently
   - Check that the directory string is comprehensive enough

3. **Tool Path Resolution** (`toolsService.ts`):
   - Ensure all file operations resolve paths relative to workspace root
   - Add path resolution helper that uses workspace context
   - Verify `read_file`, `search_for_files`, etc. use workspace root correctly

### Task 3: Fix File Path Resolution

1. **Path Resolution Logic**:
   - Create a helper function to resolve file paths relative to workspace root
   - Use `IWorkspaceContextService` to get workspace folders
   - Handle both absolute and relative paths correctly

2. **File Search**:
   - Ensure `search_pathnames_only` and `search_for_files` search within workspace
   - Verify search patterns work correctly
   - Check that results include correct absolute paths

3. **URI Construction**:
   - Verify URIs are constructed correctly using `URI` class
   - Ensure file:// scheme is used correctly
   - Check path normalization

### Task 4: Ensure All Tools Work

Verify these fundamental tools are working:
- `read_file` - Read file contents
- `ls_dir` - List directory contents
- `get_dir_tree` - Get directory tree structure
- `search_pathnames_only` - Search for files by name
- `search_for_files` - Search for files by content
- `search_in_file` - Search within a file
- `edit_file` - Edit files
- `rewrite_file` - Rewrite entire files
- `run_command` - Run terminal commands
- Web search (if available)

## Testing Checklist

After implementing fixes, test these scenarios:

1. **Basic File Read**:
   - User: "Read the PKGBUILD file"
   - Expected: System lists workspace directory, finds PKGBUILD, reads it, returns contents

2. **File Search**:
   - User: "Find all .ts files in the project"
   - Expected: System searches workspace, returns list of .ts files

3. **Directory Exploration**:
   - User: "What files are in the src directory?"
   - Expected: System lists src directory contents

4. **Relative Path Resolution**:
   - User: "Read src/main.ts"
   - Expected: System resolves path relative to workspace root, reads file

5. **Tool Execution Verification**:
   - Verify tools are actually executed (check logs)
   - Verify tool results are returned to the LLM
   - Verify conversation continues after tool execution

## Code Locations Reference

- **Tool Definitions**: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`
- **Tool Execution**: `src/vs/workbench/contrib/void/browser/chatThreadService.ts`
- **Tool Implementation**: `src/vs/workbench/contrib/void/browser/toolsService.ts`
- **Tool Call Parsing**: `src/vs/workbench/contrib/void/electron-main/llmMessage/extractGrammar.ts`
- **LLM Message Conversion**: `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts`
- **Directory Service**: `src/vs/workbench/contrib/void/common/directoryStrService.ts`
- **Workspace Context**: Use `IWorkspaceContextService` to get workspace folders

## Key Principles

1. **Tools Must Execute**: When the AI calls a tool, it MUST be executed, not just returned as JSON
2. **Workspace is Anchor**: The opened workspace folder is the default anchor for all file operations
3. **Paths Must Be Correct**: All file paths must be resolved correctly relative to workspace root
4. **Comprehensive Tool Support**: All fundamental IDE operations (read, search, edit, terminal) must work
5. **Clear Instructions**: The system prompt must clearly guide the AI on workspace structure and tool usage

## Success Criteria

The fix is successful when:
1. ✅ Tool calls are executed immediately, not returned as JSON
2. ✅ Workspace directory is used as the default anchor for file operations
3. ✅ File paths are resolved correctly (e.g., PKGBUILD is found in the workspace)
4. ✅ All fundamental tools (read, search, edit, terminal) work correctly
5. ✅ The AI can explore the codebase by listing directories and reading files
6. ✅ Tool results are properly returned to the LLM and conversation continues

## Notes

- The codebase uses TypeScript and follows VSCode's architecture patterns
- Services are registered as singletons using `registerSingleton`
- URIs are used for file paths (not plain strings)
- The workspace can have multiple folders, but typically uses the first one
- Tool calls use XML format when `specialToolFormat` is not set
- The system supports both OpenAI-style and XML-style tool calling

