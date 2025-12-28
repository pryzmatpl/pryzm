const { exec } = require('child_process');

// Regex from extractGrammar.ts
const jsonPattern = /\{[\s\n]*"name"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"arguments"[\s\n]*:[\s\n]*(\{[^}]*\})[\s\n]*\}/g;
const jsonPattern2 = /\{[\s\n]*"name"[\s\n]*:[\s\n]*"([^"]+)"[\s\n]*,[\s\n]*"parameters"[\s\n]*:[\s\n]*(\{[^}]*\})[\s\n]*\}/g;

const tryParseJSONToolCall = (text, toolNames) => {
    let match;
    // Reset regex state
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

console.log('--- Sending request to Ollama ---');

const data = JSON.stringify({
    model: 'qwen2.5-coder:32b',
    prompt: testPrompt,
    stream: false,
    system: 'You are PRYZM, an expert coding agent. You have tools available: read_file, ls_dir, search_pathnames_only. To read a file, output: {"name":"read_file", "arguments":{"uri":"/path/to/file"}}'
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
            console.log('❌ FAILURE: No tool call detected in the response.');
        }
    } catch (e) {
        console.error('Error parsing Ollama response:', e);
        console.log('Raw output:', stdout);
    }
});

