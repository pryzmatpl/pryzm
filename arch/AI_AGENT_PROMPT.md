# Void Codebase - AI Programming Agent Prompt

## Overview
Void is an Electron-based code editor (fork of VS Code) that integrates AI coding assistants. It supports multiple LLM providers (OpenAI, Anthropic, Ollama, etc.) and provides features like chat, autocomplete, inline editing (Cmd+K), and code application with diff visualization.

## Architecture

### Process Model
- **Main Process** (`electron-main/`): Node.js environment, handles LLM API calls, file system, IPC channels
- **Browser Process** (`browser/`): Web environment, UI components, React, cannot import node_modules directly
- **Common** (`common/`): Shared code usable by both processes

### Entry Points
- Main: `src/main.ts` → `src/vs/code/electron-main/app.ts`
- Browser: `src/vs/workbench/browser/web.main.ts` (web) or `src/vs/workbench/electron-sandbox/desktop.main.ts` (desktop)
- CLI: `cli/src/bin/code/main.rs` (Rust)

## Core Void Code Location
All Void-specific code lives in `src/vs/workbench/contrib/void/`:
- `browser/`: UI services, React components, actions, contributions
- `common/`: Shared services, types, utilities
- `electron-main/`: Main process implementations (LLM message handling, MCP)

## Key Services (Singleton Pattern)

### Settings & Configuration
- `IVoidSettingsService` (`common/voidSettingsService.ts`): Manages provider settings, model selections, feature configurations
- `IVoidModelService` (`common/voidModelService.ts`): File/model operations, URI handling

### LLM Communication
- `ILLMMessageService` (`common/sendLLMMessageService.ts`): Browser-side service, communicates via IPC channel to main process
- Main process: `electron-main/llmMessage/sendLLMMessage.impl.ts` - actual API calls to providers
- **Important**: Update `common/modelCapabilities.ts` when adding new models

### Code Editing
- `IEditCodeService` (`browser/editCodeService.ts`): Handles Fast Apply (search/replace) and Slow Apply (full file rewrite), manages DiffZones
- `IConvertToLLMMessageService` (`browser/convertToLLMMessageService.ts`): Converts editor context to LLM messages

### UI & Features
- `IChatThreadService` (`browser/chatThreadService.ts`): Chat history, thread management
- `IToolsService` (`browser/toolsService.ts`): Tool/function calling support
- `IAutocompleteService` (`browser/autocompleteService.ts`): Inline autocomplete

## React Components
Located in `browser/react/src/`:
- `sidebar-tsx/`: Main chat sidebar (Ctrl+L)
- `quick-edit-tsx/`: Inline edit UI (Cmd+K)
- `void-settings-tsx/`: Settings panel
- `diff/`: Diff visualization components
- Build: Run `node build.js` in `browser/react/` to compile TypeScript/React to `out/`

## Service Registration Pattern
```typescript
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IMyService = createDecorator<IMyService>('myService');
registerSingleton(IMyService, MyService, InstantiationType.Eager);
```

## Action/Command Registration
```typescript
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

registerAction2(class extends Action2 {
  static readonly ID = 'void.myAction';
  // ...
});
```

## Key Concepts

### DiffZones & DiffAreas
- **DiffZone**: `{startLine, endLine}` region showing red/green diffs, can stream changes
- **DiffArea**: Generalization tracking line numbers
- Created when applying changes to visualize edits

### Fast Apply vs Slow Apply
- **Fast Apply**: LLM outputs search/replace blocks (`<<<<<<< ORIGINAL ... ======= ... >>>>>>> UPDATED`)
- **Slow Apply**: Full file rewrite
- Both handled by `editCodeService`

### Model Selection
- `ModelSelection`: `{providerName, modelName}` pair
- `FeatureName`: `'Autocomplete' | 'Chat' | 'CtrlK' | 'Apply'`
- Each feature can have different model selections

### IPC Communication
- Browser → Main: Use `IMainProcessService.getChannel('channel-name')`
- Main process implements channel handlers in `electron-main/`
- Example: `void-channel-llmMessage` for LLM requests

## File Structure Patterns
- Services: `*Service.ts` (interface) + implementation class
- Types: `*Types.ts` for shared type definitions
- Contributions: `*Contrib.ts` or `*WorkbenchContrib.ts` for workbench lifecycle hooks
- Actions: `*Actions.ts` for command/action registrations

## Build System
- Gulp-based: `gulpfile.js`, `gulpfile.*.js` for various build tasks
- TypeScript: Multiple `tsconfig.json` files for different compilation targets
- React: Custom build in `browser/react/build.js` using tsup
- Watch: `npm run watch` for development

## Important Conventions
1. **Import paths**: Use `.js` extension for TypeScript imports (e.g., `'./myFile.js'`)
2. **Services**: Use dependency injection via constructor `@IServiceName`
3. **Disposables**: Extend `Disposable` and use `this._register()` for cleanup
4. **Events**: Use `Event` from `vs/base/common/event.js`
5. **Storage**: Use `IStorageService` for persistent state
6. **React**: Components must be shallow (1 folder deep) in `src/` for external detection

## Testing
- Unit tests: `test/unit/`
- Integration tests: `test/integration/`
- Smoke tests: `test/smoke/`
- Browser tests: `test/unit/browser/` (Playwright)

## Development Workflow
1. Make changes in `src/vs/workbench/contrib/void/`
2. For React changes: `npm run buildreact` or `npm run watchreact`
3. For TypeScript: `npm run watch` or `npm run compile`
4. Test: `npm run test-node` or `npm run test-browser`

## Key Files to Understand
- `void.contribution.ts`: Main registration file, imports all Void features
- `VOID_CODEBASE_GUIDE.md`: Detailed architecture guide
- `common/prompt/prompts.ts`: System prompts for LLM interactions
- `common/modelCapabilities.ts`: Model capabilities and provider configurations

