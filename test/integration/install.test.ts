/* eslint-disable no-async-promise-executor */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import AdmZip = require('adm-zip');
import assert from 'assert';
import * as config from '../../src/config';
import { inspectGoToolVersion, installTools } from '../../src/goInstallTools';
import { getConfiguredTools, getTool, getToolAtVersion } from '../../src/goTools';
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
import { allToolsInformation } from '../../src/goToolsInformation';
import * as goInstallTools from '../../src/goInstallTools';
import * as utilModule from '../../src/util';

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
	let toolsGopath: string;

	setup(() => {
		// Create a temporary directory in which to install tools.
		tmpToolsGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test'));

		// a temporary directory to be used as the second GOPATH element.
		tmpToolsGopath2 = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test2'));

		toolsGopath = tmpToolsGopath + path.delimiter + tmpToolsGopath2;

		sandbox = sinon.createSandbox();
	});

	teardown(async () => {
		sandbox.restore();

		// Clean up the temporary GOPATH. To delete the module cache, run `go clean -modcache`.
		const goRuntimePath = getBinPath('go');
		for (const p of [tmpToolsGopath, tmpToolsGopath2]) {
			const envForTest = Object.assign({}, process.env);
			envForTest['GOPATH'] = p;
			envForTest['GOMODCACHE'] = path.join(p, 'pkg', 'mod');
			const execFile = util.promisify(cp.execFile);
			try {
				await execFile(goRuntimePath, ['clean', '-x', '-modcache'], {
					env: envForTest
				});
				rmdirRecursive(p);
			} catch (e) {
				console.log(`failed to clean module cache directory: ${e}`);
			}
		}
	});

	// runTest actually executes the logic of the test.
	// If withLocalProxy is true, the test does not require internet.
	// If withGOBIN is true, the test will set GOBIN env var.
	async function runTest(
		testCases: installationTestCase[],
		withLocalProxy?: boolean,
		withGOBIN?: boolean,
		withGoVersion?: string
	) {
		const gobin = withLocalProxy && withGOBIN ? path.join(tmpToolsGopath, 'gobin') : undefined;

		let proxyDir: string | undefined;
		let configStub: sinon.SinonStub;
		if (withLocalProxy) {
			proxyDir = buildFakeProxy(testCases);
			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: {
						GOPROXY: url.pathToFileURL(proxyDir),
						GOSUMDB: 'off',
						GOBIN: gobin,
						// Build environment may have GOMODCACHE set. Avoid writing
						// fake data to it.
						GOMODCACHE: path.join(tmpToolsGopath, 'pkg', 'mod')
					}
				},
				gopath: { value: toolsGopath }
			});
			configStub = sandbox.stub(config, 'getGoConfig').returns(goConfig);
		} else {
			const goConfig = Object.create(vscode.workspace.getConfiguration('go'), {
				toolsEnvVars: {
					value: { GOBIN: gobin }
				},
				gopath: { value: toolsGopath }
			});
			configStub = sandbox.stub(config, 'getGoConfig').returns(goConfig);
		}

		const missingTools = testCases.map((tc) => getToolAtVersion(tc.name));
		const goVersion = withGoVersion
			? /* we want a fake go version, but need the real 'go' binary to run `go install` */
			  new GoVersion(getBinPath('go'), `go version ${withGoVersion} amd64/linux`)
			: await getGoVersion();

		sandbox.stub(vscode.commands, 'executeCommand').withArgs('go.languageserver.restart');

		const failures = await installTools(missingTools, goVersion);
		assert(!failures || failures.length === 0, `installTools failed: ${JSON.stringify(failures)}`);

		// Confirm that each expected tool has been installed.
		const checks: Promise<void>[] = [];
		const exists = util.promisify(fs.exists);
		for (const tc of testCases) {
			checks.push(
				new Promise<void>(async (resolve) => {
					// Check that the expect tool has been installed to $GOPATH/bin.
					const bin = gobin
						? path.join(gobin, correctBinname(tc.name))
						: path.join(tmpToolsGopath, 'bin', correctBinname(tc.name));
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

		if (withLocalProxy) {
			sandbox.assert.calledWith(configStub);
			// proxyDir should be set when withLocalProxy = true
			assert(proxyDir);
			rmdirRecursive(proxyDir);
		}
	}

	test('Install one tool with a local proxy', async () => {
		await runTest(
			[
				{
					name: 'gopls',
					versions: ['v0.1.0', 'v1.0.0', 'v1.0.1-pre.2'],
					wantVersion: config.extensionInfo.isPreview ? 'v1.0.1-pre.2' : 'v1.0.0'
				}
			],
			true
		);
	});

	test('Install multiple tools with a local proxy', async () => {
		await runTest(
			[
				{ name: 'gopls', versions: ['v0.1.0', 'v1.0.0-pre.1', 'v1.0.0'], wantVersion: 'v1.0.0' },
				{ name: 'dlv', versions: ['v1.0.0', 'v1.8.0'], wantVersion: 'v1.8.0' }
			],
			true
		);
	});

	test('Install multiple tools with a local proxy & GOBIN', async () => {
		await runTest(
			[
				{ name: 'gopls', versions: ['v0.1.0', 'v1.0.0-pre.1', 'v1.0.0'], wantVersion: 'v1.0.0' },
				{ name: 'dlv', versions: ['v1.0.0', 'v1.8.0'], wantVersion: 'v1.8.0' }
			],
			true, // LOCAL PROXY
			true // GOBIN
		);
	});

	const gofumptDefault = allToolsInformation['gofumpt'].defaultVersion!;
	test('Install gofumpt with old go', async () => {
		await runTest(
			[{ name: 'gofumpt', versions: ['v0.2.1', gofumptDefault], wantVersion: 'v0.2.1' }],
			true, // LOCAL PROXY
			true, // GOBIN
			'go1.17' // Go Version
		);
	});

	test('Install gofumpt with new go', async () => {
		await runTest(
			[{ name: 'gofumpt', versions: ['v0.2.1', gofumptDefault], wantVersion: gofumptDefault }],
			true, // LOCAL PROXY
			true, // GOBIN
			'go1.18' // Go Version
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
		const module = tool.modulePath;
		const pathInModule =
			tool.modulePath === tool.importPath ? '' : tool.importPath.slice(tool.modulePath.length + 1) + '/';
		const versions = tc.versions ?? ['v1.0.0']; // hardcoded for now
		const dir = path.join(proxyDir, module, '@v');
		fs.mkdirSync(dir, { recursive: true });

		// Write the list file.
		fs.writeFileSync(path.join(dir, 'list'), `${versions.join('\n')}\n`);

		versions.map((version) => {
			if (!version.match(/^v\d+\.\d+\.\d+/)) {
				// for tools that retrieve the versions from a revision (commit hash)
				const resolvedVersion = tool.latestVersion?.toString() || '1.0.0';
				const infoPath = path.join(dir, `${version}.info`);
				version = `v${resolvedVersion}`;
				fs.writeFileSync(infoPath, `{ "Version": "${version}", "Time": "2020-04-07T14:45:07Z" } `);
			}

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
			zip.addFile(`${module}@${version}/${pathInModule}main.go`, Buffer.alloc(content.length, content));
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
		const configured = getConfiguredTools(
			fakeGoVersion('go version go1.15.6 linux/amd64'),
			{ useLanguageServer: true },
			{}
		);
		const got = configured.map((tool) => tool.name) ?? [];
		assert(got.includes('gopls'), `omitted 'gopls': ${JSON.stringify(got)}`);
		assert(!got.includes('guru') && !got.includes('gocode'), `suggested legacy tools: ${JSON.stringify(got)}`);
	});

	test('do not require gopls when not using language server', async () => {
		const configured = getConfiguredTools(
			fakeGoVersion('go version go1.15.6 linux/amd64'),
			{ useLanguageServer: false },
			{}
		);
		const got = configured.map((tool) => tool.name) ?? [];
		assert(!got.includes('gopls'), `suggested 'gopls': ${JSON.stringify(got)}`);
		assert(got.includes('guru') && got.includes('gocode'), `omitted legacy tools: ${JSON.stringify(got)}`);
	});

	test('do not require gopls when the go version is old', async () => {
		const configured = getConfiguredTools(
			fakeGoVersion('go version go1.9 linux/amd64'),
			{ useLanguageServer: true },
			{}
		);
		const got = configured.map((tool) => tool.name) ?? [];
		assert(!got.includes('gopls'), `suggested 'gopls' for old go: ${JSON.stringify(got)}`);
		assert(got.includes('guru') && got.includes('gocode'), `omitted legacy tools: ${JSON.stringify(got)}`);
	});
});

function fakeGoVersion(versionStr: string) {
	return new GoVersion('/path/to/go', versionStr);
}

suite('listOutdatedTools', () => {
	let sandbox: sinon.SinonSandbox;
	setup(() => {
		sandbox = sinon.createSandbox();
	});
	teardown(() => sandbox.restore());

	async function runTest(goVersion: string | undefined, tools: { [key: string]: string | undefined }) {
		const binPathStub = sandbox.stub(utilModule, 'getBinPath');
		const versionStub = sandbox.stub(goInstallTools, 'inspectGoToolVersion');
		for (const tool in tools) {
			binPathStub.withArgs(tool).returns(`/bin/${tool}`);
			versionStub.withArgs(`/bin/${tool}`).returns(Promise.resolve({ goVersion: tools[tool] }));
		}

		const toolsToCheck = Object.keys(tools).map((tool) => getToolAtVersion(tool));

		const configuredGoVersion = goVersion ? fakeGoVersion(goVersion) : undefined;
		const toolsToUpdate = await goInstallTools.listOutdatedTools(configuredGoVersion, toolsToCheck);
		return toolsToUpdate.map((tool) => tool.name).filter((tool) => !!tool);
	}

	test('minor version difference requires updates', async () => {
		const x = await runTest('go version go1.18 linux/amd64', {
			gopls: 'go1.16', // 1.16 < 1.18
			dlv: 'go1.17', // 1.17 < 1.18
			staticcheck: 'go1.18', // 1.18 == 1.18
			gotests: 'go1.19' // 1.19 > 1.18
		});
		assert.deepStrictEqual(x, ['gopls', 'dlv']);
	});
	test('patch version difference does not require updates', async () => {
		const x = await runTest('go version go1.16.1 linux/amd64', {
			gopls: 'go1.16', // 1.16 < 1.16.1
			dlv: 'go1.16.1', // 1.16.1 == 1.16.1
			staticcheck: 'go1.16.2', // 1.16.2 > 1.16.1
			gotests: 'go1.16rc1' // 1.16rc1 != 1.16.1
		});
		assert.deepStrictEqual(x, ['gotests']);
	});
	test('go is beta version', async () => {
		const x = await runTest('go version go1.18beta2 linux/amd64', {
			gopls: 'go1.17.1', // 1.17.1 < 1.18beta2
			dlv: 'go1.18beta1', // 1.18beta1 != 1.18beta2
			staticcheck: 'go1.18beta2', // 1.18beta2 == 1.18beta2
			gotests: 'go1.18' // 1.18 > 1.18beta2
		});
		assert.deepStrictEqual(x, ['gopls', 'dlv']);
	});
	test('go is dev version', async () => {
		const x = await runTest('go version devel go1.18-41f485b9a7 linux/amd64', {
			gopls: 'go1.17.1',
			dlv: 'go1.18beta1',
			staticcheck: 'go1.18',
			gotests: 'go1.19'
		});
		assert.deepStrictEqual(x, []);
	});
	test('go is unknown version', async () => {
		const x = await runTest('', {
			gopls: 'go1.17.1'
		});
		assert.deepStrictEqual(x, []);
	});
	test('tools are unknown versions', async () => {
		const x = await runTest('go version go1.17 linux/amd64', {
			gopls: undefined, // this can be because gopls was compiled with go1.18 or it's too old.
			dlv: 'go1.16.1'
		});
		assert.deepStrictEqual(x, ['dlv']);
	});
});
