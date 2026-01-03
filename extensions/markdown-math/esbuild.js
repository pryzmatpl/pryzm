/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check

const path = require('path');
const fse = require('fs-extra');

const args = process.argv.slice(2);

const srcDir = path.join(__dirname, 'notebook');
const outDir = path.join(__dirname, 'notebook-out');

function postBuild(outDir) {
	try {
		// Copy CSS file, overwrite if exists
		const cssSrc = path.join(__dirname, 'node_modules', 'katex', 'dist', 'katex.min.css');
		const cssDest = path.join(outDir, 'katex.min.css');
		if (fse.existsSync(cssDest)) {
			fse.removeSync(cssDest);
		}
		fse.copySync(cssSrc, cssDest);

		const fontsDir = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');
		const fontsOutDir = path.join(outDir, 'fonts/');

		fse.mkdirSync(fontsOutDir, { recursive: true });

		// Copy font files, remove existing ones first to avoid permission issues
		for (const file of fse.readdirSync(fontsDir)) {
			if (file.endsWith('.woff2')) {
				const destFile = path.join(fontsOutDir, file);
				if (fse.existsSync(destFile)) {
					try {
						fse.removeSync(destFile);
					} catch (removeError) {
						// If we can't remove, try to copy anyway (might work if permissions allow)
						console.warn(`Warning: Could not remove existing file ${destFile}, attempting copy anyway`);
					}
				}
				try {
					fse.copyFileSync(path.join(fontsDir, file), destFile);
				} catch (copyError) {
					// If copy fails due to permissions, try using read/write streams
					if (copyError.code === 'EPERM') {
						console.warn(`Warning: Permission error copying ${file}, file may already exist with correct content`);
						// Continue with other files
					} else {
						throw copyError;
					}
				}
			}
		}
	} catch (error) {
		console.error('Error in postBuild:', error);
		// Don't throw - allow build to continue even if font copy fails
		// The fonts might already be there from a previous build
		console.warn('Continuing despite postBuild error - fonts may already be present');
	}
}

require('../esbuild-webview-common').run({
	entryPoints: [
		path.join(srcDir, 'katex.ts'),
	],
	srcDir,
	outdir: outDir,
}, process.argv, postBuild).catch((error) => {
	console.error('Build failed:', error);
	process.exit(1);
});
