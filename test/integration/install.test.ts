/* eslint-disable no-async-promise-executor */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import AdmZip = require('adm-zip');
import * as assert from 'assert';
import * as config from '../../src/config';
import { toolInstallationEnvironment } from '../../src/goEnv';
import { installTools } from '../../src/goInstallTools';
import { allToolsInformation, getConfiguredTools, getTool, getToolAtVersion } from '../../src/goTools';
import { getBinPath, getGoVersion, GoVersion, rmdirRecursive } from '../../src/util';
import { correctBinname } from '../../src/utils/pathUtils';
import cp = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import url = require('url');
import util = require('util');
import vscode = require('vscode');
import { isInPreviewMode } from '../../src/goLanguageServer';

interface installationTestCase {
	name: string;
	versions?: string[];
	wantVersion?: string;
}

suite('Installation Tests', function () {
	// Disable timeout when we are running slow tests.
	let timeout = 60000;
	if (shouldRunSlowTests()) {
		timeout = 0;
	}
	this.timeout(timeout);

	let tmpToolsGopath: string;
	let tmpToolsGopath2: string;
	let sandbox: sinon.SinonSandbox;
	let toolsGopathStub: sinon.SinonStub;

	setup(() => {
		// Create a temporary directory in which to install tools.
		tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));

		// a temporary directory to be used as the second GOPATH element.
		tmpToolsGopath2 = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test2'));

		const toolsGopath = tmpToolsGopath + path.delimiter + tmpToolsGopath2;

		sandbox = sinon.createSandbox();
		const utils = require('../../src/util');
		toolsGopathStub = sandbox.stub(utils, 'getToolsGopath').returns(toolsGopath);
	});

	teardown(async () => {
		sandbox.restore();

		// Clean up the temporary GOPATH. To delete the module cache, run `go clean -modcache`.
		const goRuntimePath = getBinPath('go');
		const envForTest = Object.assign({}, process.env);

		for (const p of [tmpToolsGopath, tmpToolsGopath2]) {
			envForTest['GOPATH'] = p;
			const execFile = util.promisify(cp.execFile);
			await execFile(goRuntimePath, ['clean', '-modcache'], {
				env: envForTest
			});
			rmdirRecursive(p);
		}
	});

	// runTest actually executes the logic of the test.
	// If withLocalProxy is true, the test does not require internet.
	async function runTest(testCases: installationTestCase[], withLocalProxy?: boolean) {
		let proxyDir: string;
		let configStub: sinon.SinonStub;
		if (withLocalProxy) {
			proxyDir = buildFakeProxy(testCases);
			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: {
						GOPROXY: url.pathToFileURL(proxyDir),
						GOSUMDB: 'off'
					}
				}
			});
			configStub = sandbox.stub(config, 'getGoConfig').returns(goConfig);
		} else {
			const env = toolInstallationEnvironment();
			console.log(`Installing tools using GOPROXY=${env['GOPROXY']}`);
		}

		const missingTools = testCases.map((tc) => getToolAtVersion(tc.name));
		const goVersion = await getGoVersion();
		await installTools(missingTools, goVersion);

		// Confirm that each expected tool has been installed.
		const checks: Promise<void>[] = [];
		const exists = util.promisify(fs.exists);
		for (const tc of testCases) {
			checks.push(
				new Promise<void>(async (resolve) => {
					// Check that the expect tool has been installed to $GOPATH/bin.
					const bin = path.join(tmpToolsGopath, 'bin', correctBinname(tc.name));
					const ok = await exists(bin);
					if (!ok) {
						assert.fail(`expected ${bin}, not found`);
					}
					// If wantVersion is set, check if wanted version was installed.
					if (tc.wantVersion !== undefined) {
						const { moduleVersion } = await inspectGoToolVersion(bin);
						assert.strictEqual(
							moduleVersion,
							tc.wantVersion,
							`expected ${tc.name}@${tc.wantVersion}, got ${moduleVersion}`
						);
					}
					return resolve();
				})
			);
		}
		await Promise.all(checks);

		sandbox.assert.calledWith(toolsGopathStub);

		if (withLocalProxy) {
			sandbox.assert.calledWith(configStub);
			rmdirRecursive(proxyDir);
		}
	}

	test('Install one tool with a local proxy', async () => {
		await runTest(
			[
				{
					name: 'gopls',
					versions: ['v0.1.0', 'v1.0.0', 'v1.0.1-pre.2'],
					wantVersion: isInPreviewMode() ? 'v1.0.1-pre.2' : 'v1.0.0'
				}
			],
			true
		);
	});

	test('Install multiple tools with a local proxy', async () => {
		await runTest(
			[
				{ name: 'gopls', versions: ['v0.1.0', 'v1.0.0-pre.1', 'v1.0.0'], wantVersion: 'v1.0.0' },
				{ name: 'guru', versions: ['v1.0.0'], wantVersion: 'v1.0.0' }
			],
			true
		);
	});

	test('Install all tools via GOPROXY', async () => {
		// Only run this test if we are in CI before a Nightly release.
		if (!shouldRunSlowTests()) {
			return;
		}
		const tools = Object.keys(allToolsInformation).map((tool) => {
			return { name: tool };
		});
		await runTest(tools);
	});
});

// buildFakeProxy creates a fake file-based proxy used for testing. The code is
// mostly adapted from golang.org/x/tools/internal/proxydir/proxydir.go.
function buildFakeProxy(testCases: installationTestCase[]) {
	const proxyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxydir'));
	for (const tc of testCases) {
		const tool = getTool(tc.name);
		const module = tool.importPath;
		const versions = tc.versions ?? ['v1.0.0']; // hardcoded for now
		const dir = path.join(proxyDir, module, '@v');
		fs.mkdirSync(dir, { recursive: true });

		// Write the list file.
		fs.writeFileSync(path.join(dir, 'list'), `${versions.join('\n')}\n`);

		versions.map((version) => {
			// Write the go.mod file.
			fs.writeFileSync(path.join(dir, `${version}.mod`), `module ${module}\n`);
			// Write the info file.
			fs.writeFileSync(
				path.join(dir, `${version}.info`),
				`{ "Version": "${version}", "Time": "2020-04-07T14:45:07Z" } `
			);

			// Write the zip file.
			const zip = new AdmZip();
			const content = 'package main; func main() {};';
			zip.addFile(`${module}@${version}/main.go`, Buffer.alloc(content.length, content));
			zip.writeZip(path.join(dir, `${version}.zip`));
		});
	}
	return proxyDir;
}

// Check if VSCODEGO_BEFORE_RELEASE_TESTS is set to true. This environment
// variable is set by the CI system that releases the Nightly extension,
// allowing us to opt-in to more rigorous testing only before releases.
function shouldRunSlowTests(): boolean {
	return !!process.env['VSCODEGO_BEFORE_RELEASE_TESTS'];
}

suite('getConfiguredTools', () => {
	test('do not require legacy tools when using language server', async () => {
		const configured = getConfiguredTools(fakeGoVersion('1.15.6'), { useLanguageServer: true });
		const got = configured.map((tool) => tool.name) ?? [];
		assert(got.includes('gopls'), `omitted 'gopls': ${JSON.stringify(got)}`);
		assert(!got.includes('guru') && !got.includes('gocode'), `suggested legacy tools: ${JSON.stringify(got)}`);
	});

	test('do not require gopls when not using language server', async () => {
		const configured = getConfiguredTools(fakeGoVersion('1.15.6'), { useLanguageServer: false });
		const got = configured.map((tool) => tool.name) ?? [];
		assert(!got.includes('gopls'), `suggested 'gopls': ${JSON.stringify(got)}`);
		assert(got.includes('guru') && got.includes('gocode'), `omitted legacy tools: ${JSON.stringify(got)}`);
	});

	test('do not require gopls when the go version is old', async () => {
		const configured = getConfiguredTools(fakeGoVersion('1.9'), { useLanguageServer: true });
		const got = configured.map((tool) => tool.name) ?? [];
		assert(!got.includes('gopls'), `suggested 'gopls' for old go: ${JSON.stringify(got)}`);
		assert(got.includes('guru') && got.includes('gocode'), `omitted legacy tools: ${JSON.stringify(got)}`);
	});
});

function fakeGoVersion(version: string) {
	return new GoVersion('/path/to/go', `go version go${version} windows/amd64`);
}

// inspectGoToolVersion reads the go version and module version
// of the given go tool using `go version -m` command.
async function inspectGoToolVersion(binPath: string): Promise<{ goVersion?: string; moduleVersion?: string }> {
	const goCmd = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	try {
		const { stdout } = await execFile(goCmd, ['version', '-m', binPath]);
		/* The output format will look like this:
			/Users/hakim/go/bin/gopls: go1.16
			path    golang.org/x/tools/gopls
			mod     golang.org/x/tools/gopls        v0.6.6  h1:GmCsAKZMEb1BD1BTWnQrMyx4FmNThlEsmuFiJbLBXio=
			dep     github.com/BurntSushi/toml      v0.3.1  h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ=
		*/
		const lines = stdout.split('\n', 3);
		const goVersion = lines[0].split(/\s+/)[1];
		const moduleVersion = lines[2].split(/\s+/)[3];
		return { goVersion, moduleVersion };
	} catch (e) {
		return {};
	}
}
