# Screenshot OCR Feature - AI Agent Implementation Prompt

## Objective
Add a screenshot capture and OCR (Optical Character Recognition) feature that allows users to:
1. Take screenshots (specifically targeting the PDF reader extension view)
2. Automatically extract text from screenshots using OCR
3. Make the extracted text available to the AI for analysis and summarization

## Use Case Flow
```
<User> *takes screenshot using the tool over PDF reader extension*
<User> "Summarize this for me"
<Pryzm> *performs OCR on the screenshot image*
<Pryzm> *responds with summary based on OCR-extracted text*
```

## Architecture Overview

### Components Needed
1. **Screenshot Tool** (`read_screenshot` or `capture_screenshot`): Captures screenshot from clipboard or active window
2. **OCR Service**: Extracts text from images using OCR library
3. **IPC Channel**: Main process handles OCR (needs node_modules access)
4. **Tool Integration**: Add to `toolsService.ts` following existing patterns

## Implementation Steps

### Step 1: Add Tool Type Definitions

**File**: `src/vs/workbench/contrib/void/common/toolsServiceTypes.ts`

Add to `BuiltinToolCallParams`:
```typescript
'read_screenshot': { source: 'clipboard' | 'window', imageData?: string },
```

Add to `BuiltinToolResultType`:
```typescript
'read_screenshot': { text: string, confidence?: number },
```

**Note**: `source: 'clipboard'` reads from clipboard, `source: 'window'` captures active window. `imageData` is optional base64 string if image is passed directly.

### Step 2: Add Tool Definition to Prompts

**File**: `src/vs/workbench/contrib/void/common/prompt/prompts.ts`

Add after `read_pdf`:
```typescript
read_screenshot: {
    name: 'read_screenshot',
    description: `Captures a screenshot from the clipboard or active window and extracts text using OCR. Use this when the user wants to analyze content from a screenshot, PDF viewer, or any visual content. The screenshot is automatically processed to extract readable text.`,
    params: {
        source: { description: 'Optional. Either "clipboard" to read from clipboard (default) or "window" to capture the active window. Default is "clipboard".' },
    },
},
```

### Step 3: Create OCR IPC Channel (Main Process)

**File**: `src/vs/workbench/contrib/void/electron-main/ocrChannel.ts`

Create a new channel that:
- Accepts image data (ArrayBuffer, base64, or file path)
- Performs OCR using an OCR library (Tesseract.js recommended)
- Returns extracted text

**Implementation Pattern**:
```typescript
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';

export interface OCRParams {
    imageData: ArrayBuffer | string; // base64 string or ArrayBuffer
    source: 'clipboard' | 'window' | 'file';
}

export interface OCRResult {
    text: string;
    confidence?: number;
}

export class OCRChannel implements IServerChannel {
    listen(_: unknown, event: string): Event<any> {
        throw new Error(`OCRChannel: event "${event}" not found.`);
    }

    async call<T>(_: unknown, command: string, params?: OCRParams, _cancellationToken?: CancellationToken): Promise<T> {
        if (command === 'performOCR') {
            if (!params) {
                throw new Error('OCRChannel: performOCR requires params');
            }
            return this._performOCR(params) as Promise<T>;
        }
        throw new Error(`OCRChannel: command "${command}" not recognized.`);
    }

    private async _performOCR(params: OCRParams): Promise<OCRResult> {
        // Use Tesseract.js or similar OCR library
        // Dynamic import to avoid requiring at build time
        try {
            // @ts-ignore - optional dependency
            const Tesseract = await import('tesseract.js');

            // Convert image data to appropriate format
            let imageBuffer: Buffer;
            if (typeof params.imageData === 'string') {
                // Base64 string
                imageBuffer = Buffer.from(params.imageData, 'base64');
            } else {
                // ArrayBuffer
                imageBuffer = Buffer.from(params.imageData);
            }

            const { data: { text, confidence } } = await Tesseract.recognize(imageBuffer, 'eng', {
                logger: m => console.log(m) // Optional: log progress
            });

            return {
                text: text.trim(),
                confidence: confidence || undefined,
            };
        } catch (error) {
            throw new Error(`OCR failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
```

### Step 4: Register OCR Channel

**File**: `src/vs/code/electron-main/app.ts`

Add import:
```typescript
import { OCRChannel } from '../../workbench/contrib/void/electron-main/ocrChannel.js';
```

In `initChannels` method, after PDF reader channel:
```typescript
// Void OCR Service
const ocrChannel = new OCRChannel();
mainProcessElectronServer.registerChannel('void-channel-ocr', ocrChannel);
```

### Step 5: Implement Screenshot Capture Service (Browser)

**File**: `src/vs/workbench/contrib/void/browser/screenshotService.ts`

Create a service to handle screenshot capture:
```typescript
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IHostService } from '../../../../platform/host/browser/host.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export interface IScreenshotService {
    readonly _serviceBrand: undefined;
    captureFromClipboard(): Promise<ArrayBuffer | null>;
    captureFromWindow(): Promise<ArrayBuffer | null>;
}

export const IScreenshotService = createDecorator<IScreenshotService>('ScreenshotService');

class ScreenshotService implements IScreenshotService {
    readonly _serviceBrand: undefined;

    constructor(
        @IHostService private readonly hostService: IHostService,
    ) {}

    async captureFromClipboard(): Promise<ArrayBuffer | null> {
        try {
            // Read image from clipboard
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                    const blob = await item.getType('image/png') || await item.getType('image/jpeg');
                    return await blob.arrayBuffer();
                }
            }
            return null;
        } catch (error) {
            console.error('Failed to read from clipboard:', error);
            return null;
        }
    }

    async captureFromWindow(): Promise<ArrayBuffer | null> {
        try {
            // Use existing host service screenshot functionality
            return await this.hostService.getScreenshot();
        } catch (error) {
            console.error('Failed to capture window:', error);
            return null;
        }
    }
}

registerSingleton(IScreenshotService, ScreenshotService, InstantiationType.Eager);
```

### Step 6: Add Tool Implementation to ToolsService

**File**: `src/vs/workbench/contrib/void/browser/toolsService.ts`

Add import:
```typescript
import { IScreenshotService } from './screenshotService.js';
```

Add to constructor dependencies:
```typescript
@IScreenshotService private readonly screenshotService: IScreenshotService,
```

Add validation in `validateParams`:
```typescript
read_screenshot: (params: RawToolParamsObj) => {
    const { source: sourceUnknown } = params;
    const source = sourceUnknown === 'window' ? 'window' : 'clipboard';
    return { source };
},
```

Add implementation in `callTool`:
```typescript
read_screenshot: async ({ source }) => {
    let imageData: ArrayBuffer | null;

    if (source === 'clipboard') {
        imageData = await this.screenshotService.captureFromClipboard();
    } else {
        imageData = await this.screenshotService.captureFromWindow();
    }

    if (!imageData) {
        throw new Error(`Failed to capture screenshot from ${source}. Make sure an image is in the clipboard or the window is visible.`);
    }

    // Convert ArrayBuffer to base64 for IPC
    const base64Image = Buffer.from(imageData).toString('base64');

    // Call OCR channel
    const ocrChannel = this.mainProcessService.getChannel('void-channel-ocr');
    const result = await ocrChannel.call('performOCR', {
        imageData: base64Image,
        source,
    });

    return { result };
},
```

Add stringify in `stringOfResult`:
```typescript
read_screenshot: (params, result) => {
    const confidenceStr = result.confidence ? ` (confidence: ${result.confidence.toFixed(2)}%)` : '';
    return `Text extracted from screenshot${confidenceStr}:\n\`\`\`\n${result.text}\n\`\`\``;
},
```

### Step 7: Register Screenshot Service

**File**: `src/vs/workbench/contrib/void/browser/void.contribution.ts`

Add import:
```typescript
import './screenshotService.js';
```

### Step 8: Add Tool Alias

**File**: `src/vs/workbench/contrib/void/electron-main/llmMessage/extractGrammar.ts`

Add to `toolNameAliases`:
```typescript
// Screenshot/OCR variations
'screenshot': 'read_screenshot',
'ocr': 'read_screenshot',
'extract_text': 'read_screenshot',
'read_image': 'read_screenshot',
'image_to_text': 'read_screenshot',
```

## Dependencies

### Required NPM Package
Add to `package.json` (optional dependency):
```json
"tesseract.js": "^5.0.0"
```

Or use alternative OCR libraries:
- `tesseract.js` (recommended - pure JS, no native dependencies)
- `node-tesseract-ocr` (requires Tesseract binary)
- `@tesseract.js/tesseract.js` (newer version)

## Key Implementation Details

### Screenshot Capture
- **Clipboard**: Uses `navigator.clipboard.read()` to get image from clipboard
- **Window**: Uses `IHostService.getScreenshot()` which calls Electron's `webContents.capturePage()`
- Both return `ArrayBuffer` which is converted to base64 for IPC transmission

### OCR Processing
- Runs in **main process** (can use node_modules)
- Uses Tesseract.js for OCR (supports multiple languages)
- Returns extracted text with optional confidence score
- Handles errors gracefully with informative messages

### Integration Points
- Follows existing tool pattern (validation → call → stringify)
- Uses IPC channel pattern like PDF reader
- Registers as singleton service
- Adds to tool aliases for LLM recognition

## Testing Considerations

1. **Clipboard Test**: Copy an image to clipboard, call tool with `source: 'clipboard'`
2. **Window Test**: Have PDF reader open, call tool with `source: 'window'`
3. **Error Handling**: Test with no image in clipboard, test with invalid image
4. **OCR Accuracy**: Test with various image qualities and text sizes

## User Experience Flow

1. User opens PDF in PDF reader extension
2. User takes screenshot (using system screenshot tool or Void's tool)
3. Screenshot is in clipboard
4. User asks: "Summarize this for me"
5. AI calls `read_screenshot` tool with `source: 'clipboard'`
6. Tool captures image, sends to OCR service
7. OCR extracts text, returns to AI
8. AI processes text and provides summary

## Additional Enhancements (Optional)

1. **Image Selection UI**: Add UI to let users select specific region of window
2. **Multiple Language Support**: Allow language selection for OCR
3. **Image Preprocessing**: Add image enhancement (contrast, sharpening) before OCR
4. **Batch Processing**: Support multiple screenshots at once
5. **Caching**: Cache OCR results for same images

## Reference Files

- Screenshot functionality: `src/vs/workbench/services/host/browser/browserHostService.ts` (line 590)
- PDF reader tool: `src/vs/workbench/contrib/void/electron-main/pdfReaderChannel.ts`
- Tools service: `src/vs/workbench/contrib/void/browser/toolsService.ts`
- IPC channel pattern: `src/vs/workbench/contrib/void/electron-main/sendLLMMessageChannel.ts`

## Notes

- OCR libraries can be large - consider lazy loading or making it optional
- Tesseract.js requires downloading language data on first use
- For better accuracy, consider image preprocessing (grayscale, contrast enhancement)
- The tool should handle cases where no image is available gracefully

