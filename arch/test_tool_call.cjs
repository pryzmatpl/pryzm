const { exec } = require('child_process');

// Regex from extractGrammar.ts
const jsonPattern = /\{[\s\n]*"name"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"arguments"[\s\n]*:[\s\n]*(\{[^}]*\})[\s\n]*\}/g;
const jsonPattern2 = /\{[\s\n]*"name"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"parameters"[\s\n]*:[\s\n]*(\{[^}]*\})[\s\n]*\}/g;

const tryParseJSONToolCall = (text, toolNames) => {
    let match;
    jsonPattern.lastIndex = 0;
    while ((match = jsonPattern.exec(text)) !== null) {
        const toolName = match[1];
        const argsStr = match[2];
        if (toolNames.includes(toolName)) {
            try {
                const args = JSON.parse(argsStr);
                return { name: toolName, arguments: args, type: 'json_arguments' };
            } catch (e) {}
        }
    }

    jsonPattern2.lastIndex = 0;
    while ((match = jsonPattern2.exec(text)) !== null) {
        const toolName = match[1];
        const argsStr = match[2];
        if (toolNames.includes(toolName)) {
            try {
                const args = JSON.parse(argsStr);
                return { name: toolName, arguments: args, type: 'json_parameters' };
            } catch (e) {}
        }
    }
    return null;
};

const toolNames = ['read_file', 'ls_dir', 'search_pathnames_only'];

const testPrompt = `Analyze the PKGBUILD file in this project.`;

console.log('--- Sending request to Ollama with simulated PRYZM system message ---');

const systemMessage = `
You are PRYZM, an expert coding agent.
WORKSPACE ROOT: /run/media/piotro/CACHE/void
All file operations should use this as the base directory.

<files_overview>
Directory of /run/media/piotro/CACHE/void:
├── PKGBUILD
├── src/
└── package.json
</files_overview>

Available tools:
1. read_file
   Description: Returns full contents of a given file.
   Format: <read_file>\n<uri>The FULL path to the file.</uri>\n</read_file>

Tool calling details:
- You are only allowed to output ONE tool call, and it must be at the END of your response.
- FALLBACK: If your environment supports JSON tool calling but it fails, you may output the JSON object directly at the end of your message: {"name": "tool_name", "arguments": {"param": "value"}}
`;

const data = JSON.stringify({
    model: 'qwen2.5-coder:32b',
    prompt: testPrompt,
    stream: false,
    system: systemMessage
});

const curlCommand = `curl -s -X POST http://localhost:11434/api/generate -d '${data.replace(/'/g, "'\\''")}'`;

exec(curlCommand, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);
        return;
    }
    try {
        const response = JSON.parse(stdout);
        const text = response.response;
        console.log('Ollama Response Text:');
        console.log('---------------------');
        console.log(text);
        console.log('---------------------');

        const toolCall = tryParseJSONToolCall(text, toolNames);
        if (toolCall) {
            console.log('✅ SUCCESS: Tool call detected and parsed!');
            console.log(JSON.stringify(toolCall, null, 2));
        } else {
            // Also try to check if it output XML instead
            if (text.includes('<read_file>')) {
                console.log('✅ SUCCESS: Tool call detected in XML format!');
            } else {
                console.log('❌ FAILURE: No tool call detected in the response.');
            }
        }
    } catch (e) {
        console.error('Error parsing Ollama response:', e);
        console.log('Raw output:', stdout);
    }
});
