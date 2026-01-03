/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { URI } from '../../../../base/common/uri.js';
import * as fs from 'fs';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';

export interface ReadPDFParams {
	uri: string;
	pageNumber: number;
}

export interface ReadPDFResult {
	text: string;
	totalPages: number;
	currentPage: number;
	hasNextPage: boolean;
}

export class PDFReaderChannel implements IServerChannel {

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`PDFReaderChannel: event "${event}" not found.`);
	}

	async call<T>(_: unknown, command: string, params?: ReadPDFParams, _cancellationToken?: CancellationToken): Promise<T> {
		if (command === 'readPDF') {
			if (!params) {
				throw new Error('PDFReaderChannel: readPDF requires params');
			}
			return this._readPDF(params) as Promise<T>;
		}
		throw new Error(`PDFReaderChannel: command "${command}" not recognized.`);
	}

	private async _readPDF(params: ReadPDFParams): Promise<ReadPDFResult> {
		const { uri, pageNumber } = params;
		const filePath = URI.parse(uri).fsPath;

		if (!fs.existsSync(filePath)) {
			throw new Error(`PDF file does not exist: ${filePath}`);
		}

		try {
			// Try to use pdf-parse if available, otherwise fall back to basic extraction
			let pdfText: string;
			let totalPages: number;

			try {
				// Dynamic import to avoid requiring pdf-parse at build time
				// @ts-ignore - optional dependency
				const pdfParse = await import('pdf-parse');
				const dataBuffer = fs.readFileSync(filePath);
				const pdfData = await pdfParse.default(dataBuffer);

				totalPages = pdfData.numpages;
				pdfText = pdfData.text;
			} catch (importError) {
				// Fallback: try pdfjs-dist if pdf-parse is not available
				try {
					// @ts-ignore - optional dependency
					const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
					const dataBuffer = fs.readFileSync(filePath);
					const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
					const pdfDocument = await loadingTask.promise;

					totalPages = pdfDocument.numPages;

					// Extract text from all pages
					const allPagesText: string[] = [];
					for (let i = 1; i <= totalPages; i++) {
						const page = await pdfDocument.getPage(i);
						const textContent = await page.getTextContent();
						allPagesText.push(
							textContent.items.map((item: any) => item.str).join(' ')
						);
					}
					pdfText = allPagesText.join('\n\n--- Page Break ---\n\n');
				} catch (pdfjsError) {
					// Final fallback: return error message
					throw new Error(
						`PDF parsing failed. Please install pdf-parse or pdfjs-dist: ${importError instanceof Error ? importError.message : String(importError)}`
					);
				}
			}

			// Paginate the text if needed
			const MAX_CHARS_PER_PAGE = 500_000;
			const fromIdx = MAX_CHARS_PER_PAGE * (pageNumber - 1);
			const toIdx = MAX_CHARS_PER_PAGE * pageNumber;
			const paginatedText = pdfText.slice(fromIdx, toIdx);
			const hasNextPage = pdfText.length > toIdx;

			return {
				text: paginatedText,
				totalPages,
				currentPage: pageNumber,
				hasNextPage,
			};
		} catch (error) {
			throw new Error(`Failed to read PDF: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

