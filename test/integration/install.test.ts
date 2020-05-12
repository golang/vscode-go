/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { installTools } from '../../src/goInstallTools';
import { getTool, getToolAtVersion, Tool, ToolAtVersion } from '../../src/goTools';
import { getGoVersion } from '../../src/util';

suite('Installation Tests', () => {
	test('install tools', async () => {
		// Assume that the 'go' command is installed.
		// Create a temporary directory in which to install tools.
		const tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));
		fs.mkdirSync(path.join(tmpToolsGopath, 'bin'));
		fs.mkdirSync(path.join(tmpToolsGopath, 'src'));
		const goVersion = await getGoVersion();
		const config = vscode.workspace.getConfiguration('');
		const httpConfig = vscode.workspace.getConfiguration('http');
		const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
			toolsGopath: { value: tmpToolsGopath },
		});
		console.log(`tmp: ${tmpToolsGopath}`);
		sinon.replace(vscode.workspace, 'getConfiguration', (section?: string): vscode.WorkspaceConfiguration => {
			if (section === 'go') {
				return goConfig;
			}
			if (section === 'http') {
				return httpConfig;
			}
			return config.get(section);
		});
		const testCases: ToolAtVersion[][] = [
			[
				getToolAtVersion('gopls'),
			],
		];
		testCases.map(async (missing, i) => {
			await installTools(missing, goVersion);
		});
		sinon.restore();
	});
});
