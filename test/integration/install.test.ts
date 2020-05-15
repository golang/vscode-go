/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import AdmZip = require('adm-zip');
import * as assert from 'assert';
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import util = require('util');
import vscode = require('vscode');
import { installTools } from '../../src/goInstallTools';
import { getTool, getToolAtVersion } from '../../src/goTools';
import { getGoVersion, rmdirRecursive } from '../../src/util';

suite('Installation Tests', () => {
	test('install tools', async () => {
		const goVersion = await getGoVersion();
		const testCases: string[][] = [
			['gopls'],
			['gopls', 'guru'],
		];

		const proxyDir = buildFakeProxy([].concat(...testCases));

		for (const missing of testCases) {
			// Create a temporary directory in which to install tools.
			const tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));
			fs.mkdirSync(path.join(tmpToolsGopath, 'bin'));
			fs.mkdirSync(path.join(tmpToolsGopath, 'src'));

			const sandbox = sinon.createSandbox();
			const utils = require('../../src/util');
			const toolsGopathStub = sandbox.stub(utils, 'getToolsGopath').returns(tmpToolsGopath);
			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: {
						GOPROXY: `file://${proxyDir}`,
						GOSUMDB: 'off',
					}
				},
			});
			const configStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns(goConfig);
			// TODO(rstambler): Test with versions as well.
			const missingTools = missing.map((tool) => getToolAtVersion(tool));
			await installTools(missingTools, goVersion);

			sinon.assert.calledWith(toolsGopathStub);
			sinon.assert.calledWith(configStub);
			sandbox.restore();

			// Read the $GOPATH/bin to confirm that the expected tools were
			// installed.
			const readdir = util.promisify(fs.readdir);
			const files = await readdir(path.join(tmpToolsGopath, 'bin'));
			assert.deepEqual(files, missing, `tool installation failed for ${missing}`);

			// TODO(rstambler): A module cache gets created in $GOPATH/pkg with
			// different permissions, and fs.chown doesn't seem to work on it.
			// Not sure how to remove the files so that the temporary directory
			// can be deleted.
		}

		rmdirRecursive(proxyDir);
	});
});

// buildFakeProxy creates a fake file-based proxy used for testing. The code is
// mostly adapted from golang.org/x/tools/internal/proxydir/proxydir.go.
function buildFakeProxy(tools: string[]) {
	const proxyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxydir'));
	for (const toolName of tools) {
		const tool = getTool(toolName);
		const module = tool.importPath;
		const version = `v1.0.0`; // hardcoded for now
		const dir = path.join(proxyDir, module, '@v');
		fs.mkdirSync(dir, { recursive: true });

		// Write the list file.
		fs.writeFileSync(path.join(dir, 'list'), `${version}\n`);

		// Write the go.mod file.
		fs.writeFileSync(path.join(dir, `${version}.mod`), `module ${module}\n`);

		// Write the info file.
		fs.writeFileSync(path.join(dir, `${version}.info`), `{ "Version": "${version}", "Time": "2020-04-07T14:45:07Z" } `);

		// Write the zip file.
		const zip = new AdmZip();
		const content = `package main; func main() {};`;
		zip.addFile(path.join(`${module}@${version}`, 'main.go'), Buffer.alloc(content.length, content));
		zip.writeZip(path.join(dir, `${version}.zip`));
	}
	return proxyDir;
}
