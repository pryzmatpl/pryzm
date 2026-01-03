/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

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
				logger: (m: any) => console.log(m) // Optional: log progress
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

