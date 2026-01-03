/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IHostService } from '../../../services/host/browser/host.js';
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
			const result = await this.hostService.getScreenshot();
			return result || null;
		} catch (error) {
			console.error('Failed to capture window:', error);
			return null;
		}
	}
}

registerSingleton(IScreenshotService, ScreenshotService, InstantiationType.Eager);

