/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js'
import { endsWithAnyPrefixOf, SurroundingsRemover } from '../../common/helpers/extractCodeFromResult.js'
import { availableTools, InternalToolInfo } from '../../common/prompt/prompts.js'
import { OnFinalMessage, OnText, RawToolCallObj, RawToolParamsObj } from '../../common/sendLLMMessageTypes.js'
import { ToolName, ToolParamName } from '../../common/toolsServiceTypes.js'
import { ChatMode } from '../../common/voidSettingsTypes.js'


// =============== reasoning ===============

// could simplify this - this assumes we can never add a tag without committing it to the user's screen, but that's not true
export const extractReasoningWrapper = (
	onText: OnText, onFinalMessage: OnFinalMessage, thinkTags: [string, string]
): { newOnText: OnText, newOnFinalMessage: OnFinalMessage } => {
	let latestAddIdx = 0 // exclusive index in fullText_
	let foundTag1 = false
	let foundTag2 = false

	let fullTextSoFar = ''
	let fullReasoningSoFar = ''


	if (!thinkTags[0] || !thinkTags[1]) throw new Error(`thinkTags must not be empty if provided. Got ${JSON.stringify(thinkTags)}.`)

	let onText_ = onText
	onText = (params) => {
		onText_(params)
	}

	const newOnText: OnText = ({ fullText: fullText_, ...p }) => {

		// until found the first think tag, keep adding to fullText
		if (!foundTag1) {
			const endsWithTag1 = endsWithAnyPrefixOf(fullText_, thinkTags[0])
			if (endsWithTag1) {
				// console.log('endswith1', { fullTextSoFar, fullReasoningSoFar, fullText_ })
				// wait until we get the full tag or know more
				return
			}
			// if found the first tag
			const tag1Index = fullText_.indexOf(thinkTags[0])
			if (tag1Index !== -1) {
				// console.log('tag1Index !==1', { tag1Index, fullTextSoFar, fullReasoningSoFar, thinkTags, fullText_ })
				foundTag1 = true
				// Add text before the tag to fullTextSoFar
				fullTextSoFar += fullText_.substring(0, tag1Index)
				// Update latestAddIdx to after the first tag
				latestAddIdx = tag1Index + thinkTags[0].length
				onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar })
				return
			}

			// console.log('adding to text A', { fullTextSoFar, fullReasoningSoFar })
			// add the text to fullText
			fullTextSoFar = fullText_
			latestAddIdx = fullText_.length
			onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar })
			return
		}

		// at this point, we found <tag1>

		// until found the second think tag, keep adding to fullReasoning
		if (!foundTag2) {
			const endsWithTag2 = endsWithAnyPrefixOf(fullText_, thinkTags[1])
			if (endsWithTag2 && endsWithTag2 !== thinkTags[1]) { // if ends with any partial part (full is fine)
				// console.log('endsWith2', { fullTextSoFar, fullReasoningSoFar })
				// wait until we get the full tag or know more
				return
			}

			// if found the second tag
			const tag2Index = fullText_.indexOf(thinkTags[1], latestAddIdx)
			if (tag2Index !== -1) {
				// console.log('tag2Index !== -1', { fullTextSoFar, fullReasoningSoFar })
				foundTag2 = true
				// Add everything between first and second tag to reasoning
				fullReasoningSoFar += fullText_.substring(latestAddIdx, tag2Index)
				// Update latestAddIdx to after the second tag
				latestAddIdx = tag2Index + thinkTags[1].length
				onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar })
				return
			}

			// add the text to fullReasoning (content after first tag but before second tag)
			// console.log('adding to text B', { fullTextSoFar, fullReasoningSoFar })

			// If we have more text than we've processed, add it to reasoning
			if (fullText_.length > latestAddIdx) {
				fullReasoningSoFar += fullText_.substring(latestAddIdx)
				latestAddIdx = fullText_.length
			}

			onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar })
			return
		}

		// at this point, we found <tag2> - content after the second tag is normal text
		// console.log('adding to text C', { fullTextSoFar, fullReasoningSoFar })

		// Add any new text after the closing tag to fullTextSoFar
		if (fullText_.length > latestAddIdx) {
			fullTextSoFar += fullText_.substring(latestAddIdx)
			latestAddIdx = fullText_.length
		}

		onText({ ...p, fullText: fullTextSoFar, fullReasoning: fullReasoningSoFar })
	}


	const getOnFinalMessageParams = () => {
		const fullText_ = fullTextSoFar
		const tag1Idx = fullText_.indexOf(thinkTags[0])
		const tag2Idx = fullText_.indexOf(thinkTags[1])
		if (tag1Idx === -1) return { fullText: fullText_, fullReasoning: '' } // never started reasoning
		if (tag2Idx === -1) return { fullText: '', fullReasoning: fullText_ } // never stopped reasoning

		const fullReasoning = fullText_.substring(tag1Idx + thinkTags[0].length, tag2Idx)
		const fullText = fullText_.substring(0, tag1Idx) + fullText_.substring(tag2Idx + thinkTags[1].length, Infinity)

		return { fullText, fullReasoning }
	}

	const newOnFinalMessage: OnFinalMessage = (params) => {

		// treat like just got text before calling onFinalMessage (or else we sometimes miss the final chunk that's new to finalMessage)
		newOnText({ ...params })

		const { fullText, fullReasoning } = getOnFinalMessageParams()
		onFinalMessage({ ...params, fullText, fullReasoning })
	}

	return { newOnText, newOnFinalMessage }
}


// =============== tools (JSON fallback) ===============

// Extract balanced JSON object starting at a given position (handles nested braces)
const extractBalancedJSON = (text: string, startIdx: number): string | null => {
	if (text[startIdx] !== '{') return null

	let depth = 0
	let inString = false
	let escapeNext = false

	for (let i = startIdx; i < text.length; i++) {
		const char = text[i]

		if (escapeNext) {
			escapeNext = false
			continue
		}

		if (char === '\\' && inString) {
			escapeNext = true
			continue
		}

		if (char === '"') {
			inString = !inString
			continue
		}

		if (inString) continue

		if (char === '{') depth++
		else if (char === '}') {
			depth--
			if (depth === 0) {
				return text.substring(startIdx, i + 1)
			}
		}
	}
	return null
}

// Try to detect and parse JSON tool calls that some models output as text
// Handles multiple formats: {"name":"tool", "arguments":{...}}, {"name":"tool", "parameters":{...}}
// Also handles tool calls wrapped in markdown code blocks
// Also converts invented tool names (like "cargo fix") to run_command calls
const tryParseJSONToolCall = (text: string, toolNames: string[]): RawToolCallObj | null => {
	// Strip markdown code blocks that might wrap the JSON
	let cleanText = text
	// Match ```json ... ``` or ``` ... ```
	const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
	if (codeBlockMatch) {
		cleanText = codeBlockMatch[1].trim()
	}

	// Try multiple search strategies
	const searchTexts = [cleanText, text]

	for (const searchText of searchTexts) {
		// Find potential JSON objects containing tool names
		for (const toolName of toolNames) {
			// Search for "name": "toolName" pattern
			const namePatterns = [
				`"name"\\s*:\\s*"${toolName}"`,
				`'name'\\s*:\\s*'${toolName}'`,
			]

			for (const pattern of namePatterns) {
				const regex = new RegExp(pattern, 'g')
				let match: RegExpExecArray | null

				while ((match = regex.exec(searchText)) !== null) {
					// Find the start of this JSON object by scanning backwards for '{'
					let braceDepth = 0
					let startIdx = -1

					for (let i = match.index; i >= 0; i--) {
						const char = searchText[i]
						if (char === '}') braceDepth++
						else if (char === '{') {
							if (braceDepth === 0) {
								startIdx = i
								break
							}
							braceDepth--
						}
					}

					if (startIdx === -1) continue

					// Extract the balanced JSON
					const jsonStr = extractBalancedJSON(searchText, startIdx)
					if (!jsonStr) continue

					try {
						const parsed = JSON.parse(jsonStr)

						// Validate it has the expected structure
						if (parsed.name !== toolName) continue

						const argsObj = parsed.arguments || parsed.parameters || {}
						const rawParams: RawToolParamsObj = {}

						for (const key in argsObj) {
							const val = argsObj[key]
							rawParams[key] = typeof val === 'string' ? val : JSON.stringify(val)
						}

						console.log('[Tool Detection] Successfully parsed JSON tool call:', { toolName, rawParams })

						return {
							name: toolName as ToolName,
							rawParams,
							doneParams: Object.keys(rawParams) as any[],
							isDone: true,
							id: generateUuid(),
						}
					} catch (e) {
						// JSON parse failed, continue searching
						console.log('[Tool Detection] JSON parse failed:', e)
					}
				}
			}
		}
	}

	// Fallback: Try to find function-call style output (Qwen sometimes uses this)
	// Format: tool_name(param1="value1", param2="value2")
	for (const toolName of toolNames) {
		const funcCallRegex = new RegExp(`${toolName}\\s*\\(([^)]+)\\)`, 'g')
		let match: RegExpExecArray | null

		while ((match = funcCallRegex.exec(text)) !== null) {
			const argsStr = match[1]
			const rawParams: RawToolParamsObj = {}

			// Parse key="value" or key='value' pairs
			const paramRegex = /(\w+)\s*=\s*["']([^"']+)["']/g
			let paramMatch: RegExpExecArray | null

			while ((paramMatch = paramRegex.exec(argsStr)) !== null) {
				rawParams[paramMatch[1]] = paramMatch[2]
			}

			if (Object.keys(rawParams).length > 0) {
				console.log('[Tool Detection] Parsed function-call style:', { toolName, rawParams })
				return {
					name: toolName as ToolName,
					rawParams,
					doneParams: Object.keys(rawParams) as any[],
					isDone: true,
					id: generateUuid(),
				}
			}
		}
	}

	// FALLBACK: Detect invented tool names that look like commands and convert to run_command
	// e.g., {"name": "cargo fix", "arguments": ["--lib", "-p", "pdfscan"]}
	// or {"name": "npm install", "arguments": {"package": "lodash"}}
	if (toolNames.includes('run_command')) {
		const inventedToolPattern = /"name"\s*:\s*"([^"]+)"/g
		let match: RegExpExecArray | null

		while ((match = inventedToolPattern.exec(cleanText)) !== null) {
			const inventedName = match[1]

			// Skip if it's a known tool
			if (toolNames.includes(inventedName)) continue

			// Check if it looks like a command (contains common command patterns)
			const commandPatterns = [
				/^(cargo|npm|yarn|pnpm|git|make|cmake|python|pip|node|deno|bun|rustc|gcc|clang|go|java|mvn|gradle|docker|kubectl|terraform|ansible)\b/i,
				/\s+(install|build|run|test|fix|lint|format|clean|deploy|init|start|stop)\b/i,
				/^[a-z]+\s+[a-z-]+/i, // generic "command subcommand" pattern
			]

			const looksLikeCommand = commandPatterns.some(p => p.test(inventedName))
			if (!looksLikeCommand) continue

			// Find the start of this JSON object
			let braceDepth = 0
			let startIdx = -1

			for (let i = match.index; i >= 0; i--) {
				const char = cleanText[i]
				if (char === '}') braceDepth++
				else if (char === '{') {
					if (braceDepth === 0) {
						startIdx = i
						break
					}
					braceDepth--
				}
			}

			if (startIdx === -1) continue

			const jsonStr = extractBalancedJSON(cleanText, startIdx)
			if (!jsonStr) continue

			try {
				const parsed = JSON.parse(jsonStr)
				if (parsed.name !== inventedName) continue

				// Build the command string
				let commandStr = inventedName
				const args = parsed.arguments || parsed.parameters

				if (Array.isArray(args)) {
					// Arguments as array: ["--lib", "-p", "pdfscan"]
					commandStr += ' ' + args.join(' ')
				} else if (typeof args === 'object' && args !== null) {
					// Arguments as object: {"flag": "--lib", "package": "pdfscan"}
					// Try to construct a reasonable command
					const argParts: string[] = []
					for (const key in args) {
						const val = args[key]
						if (typeof val === 'string') {
							// If key looks like a flag name, use it
							if (key.startsWith('-') || key === 'flag' || key === 'option') {
								argParts.push(val)
							} else {
								argParts.push(val)
							}
						}
					}
					if (argParts.length > 0) {
						commandStr += ' ' + argParts.join(' ')
					}
				} else if (typeof args === 'string') {
					commandStr += ' ' + args
				}

				console.log('[Tool Detection] Converted invented tool to run_command:', { inventedName, commandStr })

				return {
					name: 'run_command' as ToolName,
					rawParams: { command: commandStr },
					doneParams: ['command'] as any[],
					isDone: true,
					id: generateUuid(),
				}
			} catch (e) {
				// JSON parse failed
			}
		}
	}

	return null
}

// =============== tools (XML) ===============



const findPartiallyWrittenToolTagAtEnd = (fullText: string, toolTags: string[]) => {
	for (const toolTag of toolTags) {
		const foundPrefix = endsWithAnyPrefixOf(fullText, toolTag)
		if (foundPrefix) {
			return [foundPrefix, toolTag] as const
		}
	}
	return false
}

const findIndexOfAny = (fullText: string, matches: string[]) => {
	for (const str of matches) {
		const idx = fullText.indexOf(str);
		if (idx !== -1) {
			return [idx, str] as const
		}
	}
	return null
}


type ToolOfToolName = { [toolName: string]: InternalToolInfo | undefined }
const parseXMLPrefixToToolCall = <T extends ToolName,>(toolName: T, toolId: string, str: string, toolOfToolName: ToolOfToolName): RawToolCallObj => {
	const paramsObj: RawToolParamsObj = {}
	const doneParams: ToolParamName<T>[] = []
	let isDone = false

	const getAnswer = (): RawToolCallObj => {
		// trim off all whitespace at and before first \n and after last \n for each param
		for (const p in paramsObj) {
			const paramName = p as ToolParamName<T>
			const orig = paramsObj[paramName]
			if (orig === undefined) continue
			paramsObj[paramName] = trimBeforeAndAfterNewLines(orig)
		}

		// return tool call
		const ans: RawToolCallObj = {
			name: toolName,
			rawParams: paramsObj,
			doneParams: doneParams,
			isDone: isDone,
			id: toolId,
		}
		return ans
	}

	// find first toolName tag
	const openToolTag = `<${toolName}>`
	let i = str.indexOf(openToolTag)
	if (i === -1) return getAnswer()
	let j = str.lastIndexOf(`</${toolName}>`)
	if (j === -1) j = Infinity
	else isDone = true


	str = str.substring(i + openToolTag.length, j)

	const pm = new SurroundingsRemover(str)

	const allowedParams = Object.keys(toolOfToolName[toolName]?.params ?? {}) as ToolParamName<T>[]
	if (allowedParams.length === 0) return getAnswer()
	let latestMatchedOpenParam: null | ToolParamName<T> = null
	let n = 0
	while (true) {
		n += 1
		if (n > 10) return getAnswer() // just for good measure as this code is early

		// find the param name opening tag
		let matchedOpenParam: null | ToolParamName<T> = null
		for (const paramName of allowedParams) {
			const removed = pm.removeFromStartUntilFullMatch(`<${paramName}>`, true)
			if (removed) {
				matchedOpenParam = paramName
				break
			}
		}
		// if did not find a new param, stop
		if (matchedOpenParam === null) {
			if (latestMatchedOpenParam !== null) {
				paramsObj[latestMatchedOpenParam] += pm.value()
			}
			return getAnswer()
		}
		else {
			latestMatchedOpenParam = matchedOpenParam
		}

		paramsObj[latestMatchedOpenParam] = ''

		// find the param name closing tag
		let matchedCloseParam: boolean = false
		let paramContents = ''
		for (const paramName of allowedParams) {
			const i = pm.i
			const closeTag = `</${paramName}>`
			const removed = pm.removeFromStartUntilFullMatch(closeTag, true)
			if (removed) {
				const i2 = pm.i
				paramContents = pm.originalS.substring(i, i2 - closeTag.length)
				matchedCloseParam = true
				break
			}
		}
		// if did not find a new close tag, stop
		if (!matchedCloseParam) {
			paramsObj[latestMatchedOpenParam] += pm.value()
			return getAnswer()
		}
		else {
			doneParams.push(latestMatchedOpenParam)
		}

		paramsObj[latestMatchedOpenParam] += paramContents
	}
}

// Try to find XML tool calls with flexible whitespace/newline handling
// Handles: <tool_name>\n<param>value</param>\n</tool_name>
const tryParseFlexibleXMLToolCall = (text: string, toolNames: string[], toolOfToolName: ToolOfToolName): RawToolCallObj | null => {
	for (const toolName of toolNames) {
		// Match opening tag with flexible whitespace
		const openTagRegex = new RegExp(`<\\s*${toolName}\\s*>`, 'i')
		const openMatch = openTagRegex.exec(text)
		if (!openMatch) continue

		const startIdx = openMatch.index

		// Find matching close tag
		const closeTagRegex = new RegExp(`</\\s*${toolName}\\s*>`, 'i')
		const closeMatch = closeTagRegex.exec(text.substring(startIdx + openMatch[0].length))

		const innerContent = closeMatch
			? text.substring(startIdx + openMatch[0].length, startIdx + openMatch[0].length + closeMatch.index)
			: text.substring(startIdx + openMatch[0].length)

		const isDone = !!closeMatch
		const rawParams: RawToolParamsObj = {}
		const doneParams: string[] = []

		// Extract parameters from inner content
		const toolInfo = toolOfToolName[toolName]
		if (toolInfo) {
			for (const paramName of Object.keys(toolInfo.params)) {
				// Flexible param tag matching
				const paramOpenRegex = new RegExp(`<\\s*${paramName}\\s*>`, 'i')
				const paramCloseRegex = new RegExp(`</\\s*${paramName}\\s*>`, 'i')

				const paramOpenMatch = paramOpenRegex.exec(innerContent)
				if (!paramOpenMatch) continue

				const afterOpen = innerContent.substring(paramOpenMatch.index + paramOpenMatch[0].length)
				const paramCloseMatch = paramCloseRegex.exec(afterOpen)

				if (paramCloseMatch) {
					rawParams[paramName] = trimBeforeAndAfterNewLines(afterOpen.substring(0, paramCloseMatch.index))
					doneParams.push(paramName)
				} else {
					// Param opened but not closed - take rest as value
					rawParams[paramName] = trimBeforeAndAfterNewLines(afterOpen)
				}
			}
		}

		if (Object.keys(rawParams).length > 0 || isDone) {
			console.log('[Tool Detection] Parsed flexible XML tool call:', { toolName, rawParams, isDone })
			return {
				name: toolName as ToolName,
				rawParams,
				doneParams: doneParams as any[],
				isDone,
				id: generateUuid(),
			}
		}
	}
	return null
}

// Remove tool call text from displayed content
const removeToolCallFromText = (text: string, toolNames: string[]): string => {
	let result = text

	// Remove XML tool calls
	for (const toolName of toolNames) {
		const xmlPattern = new RegExp(`<\\s*${toolName}[\\s\\S]*?(?:</\\s*${toolName}\\s*>|$)`, 'gi')
		result = result.replace(xmlPattern, '')
	}

	// Remove JSON tool calls (including those in code blocks)
	result = result.replace(/```(?:json)?\s*\{[\s\S]*?"name"\s*:\s*"[^"]+?"[\s\S]*?\}\s*```/gi, '')

	// Remove standalone JSON tool calls at end
	for (const toolName of toolNames) {
		const jsonPattern = new RegExp(`\\{[\\s\\S]*?"name"\\s*:\\s*"${toolName}"[\\s\\S]*?\\}\\s*$`, 'i')
		result = result.replace(jsonPattern, '')
	}

	// Remove function-call style
	for (const toolName of toolNames) {
		const funcPattern = new RegExp(`${toolName}\\s*\\([^)]*\\)\\s*$`, 'i')
		result = result.replace(funcPattern, '')
	}

	return result.trimEnd()
}

export const extractXMLToolsWrapper = (
	onText: OnText,
	onFinalMessage: OnFinalMessage,
	chatMode: ChatMode | null,
	mcpTools: InternalToolInfo[] | undefined,
): { newOnText: OnText, newOnFinalMessage: OnFinalMessage } => {

	if (!chatMode) return { newOnText: onText, newOnFinalMessage: onFinalMessage }
	const tools = availableTools(chatMode, mcpTools)
	if (!tools) return { newOnText: onText, newOnFinalMessage: onFinalMessage }

	const toolOfToolName: ToolOfToolName = {}
	const toolOpenTags = tools.map(t => `<${t.name}>`)
	const toolNames = tools.map(t => t.name)
	for (const t of tools) { toolOfToolName[t.name] = t }

	const toolId = generateUuid()

	// detect <availableTools[0]></availableTools[0]>, etc
	let fullText = '';
	let trueFullText = ''
	let latestToolCall: RawToolCallObj | undefined = undefined

	let foundOpenTag: { idx: number, toolName: ToolName } | null = null
	let openToolTagBuffer = '' // the characters we've seen so far that come after a < with no space afterwards, not yet added to fullText

	let prevFullTextLen = 0
	const newOnText: OnText = (params) => {
		const newText = params.fullText.substring(prevFullTextLen)
		prevFullTextLen = params.fullText.length
		trueFullText = params.fullText

		if (foundOpenTag === null) {
			const newFullText = openToolTagBuffer + newText
			// ensure the code below doesn't run if only half a tag has been written
			const isPartial = findPartiallyWrittenToolTagAtEnd(newFullText, toolOpenTags)
			if (isPartial) {
				openToolTagBuffer += newText
			}
			// if no tooltag is partially written at the end, attempt to get the index
			else {
				// we will instantly retroactively remove this if it's a tag match
				fullText += openToolTagBuffer
				openToolTagBuffer = ''
				fullText += newText

				const i = findIndexOfAny(fullText, toolOpenTags)
				if (i !== null) {
					const [idx, toolTag] = i
					const toolName = toolTag.substring(1, toolTag.length - 1) as ToolName
					foundOpenTag = { idx, toolName }

					// do not count anything at or after i in fullText
					fullText = fullText.substring(0, idx)
				}
			}
		}

		// toolTagIdx is not null, so parse the XML
		if (foundOpenTag !== null) {
			latestToolCall = parseXMLPrefixToToolCall(
				foundOpenTag.toolName,
				toolId,
				trueFullText.substring(foundOpenTag.idx, Infinity),
				toolOfToolName,
			)
		}
		// Fallback: Try to detect JSON or flexible XML tool call during streaming
		else if (!latestToolCall) {
			// Try JSON first (Qwen's common output)
			const jsonToolCall = tryParseJSONToolCall(trueFullText, toolNames)
			if (jsonToolCall) {
				latestToolCall = jsonToolCall
				fullText = removeToolCallFromText(trueFullText, toolNames)
			} else {
				// Try flexible XML parsing
				const flexibleXmlCall = tryParseFlexibleXMLToolCall(trueFullText, toolNames, toolOfToolName)
				if (flexibleXmlCall) {
					latestToolCall = flexibleXmlCall
					fullText = removeToolCallFromText(trueFullText, toolNames)
				}
			}
		}

		onText({
			...params,
			fullText,
			toolCall: latestToolCall,
		});
	};


	const newOnFinalMessage: OnFinalMessage = (params) => {
		// treat like just got text before calling onFinalMessage (or else we sometimes miss the final chunk that's new to finalMessage)
		newOnText({ ...params })

		fullText = fullText.trimEnd()
		let toolCall = latestToolCall

		// If no tool call found yet, try all detection methods
		if (!toolCall) {
			// 1. Try JSON parsing (most common for Qwen/Ollama)
			const jsonToolCall = tryParseJSONToolCall(trueFullText, toolNames)
			if (jsonToolCall) {
				toolCall = jsonToolCall
				fullText = removeToolCallFromText(trueFullText, toolNames)
				console.log('[Tool Detection] Final: Found JSON tool call')
			}
		}

		if (!toolCall) {
			// 2. Try flexible XML parsing
			const flexibleXmlCall = tryParseFlexibleXMLToolCall(trueFullText, toolNames, toolOfToolName)
			if (flexibleXmlCall) {
				toolCall = flexibleXmlCall
				fullText = removeToolCallFromText(trueFullText, toolNames)
				console.log('[Tool Detection] Final: Found flexible XML tool call')
			}
		}

		// Clean up displayed text if we found a tool
		if (toolCall && fullText === trueFullText) {
			fullText = removeToolCallFromText(trueFullText, toolNames)
		}

		console.log('[Tool Detection] Final message:', {
			hasToolCall: !!toolCall,
			toolName: toolCall?.name,
			toolIsDone: toolCall?.isDone,
			rawParams: toolCall?.rawParams,
			foundOpenTag: foundOpenTag,
		})

		onFinalMessage({ ...params, fullText, toolCall: toolCall })
	}
	return { newOnText, newOnFinalMessage };
}



// trim all whitespace up until the first newline, and all whitespace up until the last newline
const trimBeforeAndAfterNewLines = (s: string) => {
	if (!s) return s;

	const firstNewLineIndex = s.indexOf('\n');

	if (firstNewLineIndex !== -1 && s.substring(0, firstNewLineIndex).trim() === '') {
		s = s.substring(firstNewLineIndex + 1, Infinity)
	}

	const lastNewLineIndex = s.lastIndexOf('\n');
	if (lastNewLineIndex !== -1 && s.substring(lastNewLineIndex + 1, Infinity).trim() === '') {
		s = s.substring(0, lastNewLineIndex)
	}

	return s
}

