/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import util = require('util');
import vscode = require('vscode');
import { installTools } from '../../src/goInstallTools';
import { getToolAtVersion } from '../../src/goTools';
import { getGoVersion } from '../../src/util';

suite('Installation Tests', () => {
	test('install tools', async () => {
		// Assume that the 'go' command is installed.
		const goVersion = await getGoVersion();
		const testCases: string[][] = [
			['gopls'],
			['gopls', 'guru'],
		];
		for (const missing of testCases) {
			// Create a temporary directory in which to install tools.
			const tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));
			fs.mkdirSync(path.join(tmpToolsGopath, 'bin'));
			fs.mkdirSync(path.join(tmpToolsGopath, 'src'));
			const utils = require('../../src/util');
			sinon.stub(utils, 'getToolsGopath').returns(tmpToolsGopath);

			const missingTools = missing.map((tool) => getToolAtVersion(tool));
			await installTools(missingTools, goVersion);
			sinon.restore();

			// Read the $GOPATH/bin to confirm that the expect tools were installed.
			const readdir = util.promisify(fs.readdir);
			const files = await readdir(path.join(tmpToolsGopath, 'bin'));
			assert.deepEqual(files, missing, `tool installation failed for ${missing}`);

			// A module cache gets created in $GOPATH/pkg with different
			// permissions, and fs.chown doesn't seem to work on it.
			// Not sure how to remove the files so that the temporary directory
			// can be deleted.
		}
	});
});
