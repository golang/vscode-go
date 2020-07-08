/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import AdmZip = require('adm-zip');
import * as assert from 'assert';
import cp = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import util = require('util');
import vscode = require('vscode');
import { toolInstallationEnvironment } from '../../src/goEnv';
import { installTools } from '../../src/goInstallTools';
import { allToolsInformation, getTool, getToolAtVersion } from '../../src/goTools';
import { getBinPath, getGoVersion, rmdirRecursive } from '../../src/util';

suite('Installation Tests', function () {
	// Disable timeout when we are running slow tests.
	let timeout = 10000;
	if (shouldRunSlowTests()) {
		timeout = 0;
	}
	this.timeout(timeout);

	let tmpToolsGopath: string;
	let sandbox: sinon.SinonSandbox;
	let toolsGopathStub: sinon.SinonStub;

	setup(() => {
		// Create a temporary directory in which to install tools.
		tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));
		fs.mkdirSync(path.join(tmpToolsGopath, 'bin'));
		fs.mkdirSync(path.join(tmpToolsGopath, 'src'));

		sandbox = sinon.createSandbox();
		const utils = require('../../src/util');
		toolsGopathStub = sandbox.stub(utils, 'getToolsGopath').returns(tmpToolsGopath);
	});

	teardown(async () => {
		sandbox.restore();

		// Clean up the temporary GOPATH. To delete the module cache, run `go clean -modcache`.
		const goRuntimePath = getBinPath('go');
		const envForTest = Object.assign({}, process.env);
		envForTest['GOPATH'] = tmpToolsGopath;
		const execFile = util.promisify(cp.execFile);
		await execFile(goRuntimePath, ['clean', '-modcache'], {
			env: envForTest,
		});
		rmdirRecursive(tmpToolsGopath);
	});

	// runTest actually executes the logic of the test.
	// If withLocalProxy is true, the test does not require internet.
	async function runTest(testCases: string[], withLocalProxy?: boolean) {
		let proxyDir: string;
		let configStub: sinon.SinonStub;
		if (withLocalProxy) {
			proxyDir = buildFakeProxy([].concat(...testCases));
			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: {
						GOPROXY: `file://${proxyDir}`,
						GOSUMDB: 'off',
					}
				},
			});
			configStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns(goConfig);
		} else {
			const env = toolInstallationEnvironment();
			console.log(`Installing tools using GOPROXY=${env['GOPROXY']}`);
		}

		// TODO(rstambler): Test with versions as well.
		const missingTools = testCases.map((tool) => getToolAtVersion(tool));
		const goVersion = await getGoVersion();
		await installTools(missingTools, goVersion);

		// Confirm that each expected tool has been installed.
		const checks: Promise<void>[] = [];
		const exists = util.promisify(fs.exists);
		for (const tool of testCases) {
			checks.push(new Promise<void>(async (resolve) => {
				// Check that the expect tool has been installed to $GOPATH/bin.
				const ok = await exists(path.join(tmpToolsGopath, 'bin', tool));
				if (!ok) {
					assert.fail(`expected ${tmpToolsGopath}/bin/${tool}, not found`);
				}
				return resolve();
			}));
		}
		await Promise.all(checks);

		sandbox.assert.calledWith(toolsGopathStub);

		if (withLocalProxy) {
			sandbox.assert.calledWith(configStub);
			rmdirRecursive(proxyDir);
		}
	}

	test('Install one tool with a local proxy', async () => {
		await runTest(['gopls'], true);
	});

	test('Install multiple tools with a local proxy', async () => {
		await runTest(['gopls', 'guru'], true);
	});

	test('Install all tools via GOPROXY', async () => {
		// Only run this test if we are in CI before a Nightly release.
		if (!shouldRunSlowTests()) {
			return;
		}
		const tools = Object.keys(allToolsInformation);
		await runTest(tools);
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

// Check if VSCODEGO_BEFORE_RELEASE_TESTS is set to true. This environment
// variable is set by the CI system that releases the Nightly extension,
// allowing us to opt-in to more rigorous testing only before releases.
function shouldRunSlowTests(): boolean {
	return !!process.env['VSCODEGO_BEFORE_RELEASE_TESTS'];
}
