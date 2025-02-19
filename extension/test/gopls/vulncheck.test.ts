/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { ActiveProgressTerminals, ProgressTerminal } from '../../src/progressTerminal';
import { ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { Env, FakeOutputChannel } from './goplsTestEnv.utils';
import { URI } from 'vscode-uri';
import { getGoConfig } from '../../src/config';
import { ProgressToken } from 'vscode-languageclient';

suite('writeVulns', function () {
	this.timeout(30000);
	const sandbox = sinon.createSandbox(); // for suite
	const env = new Env();

	// This test suite will start an editor that opens a go workspace in test/testdata/vuln
	// that includes mod1 (that has some vulnerabilities) and mod2 (that has 0 dependency).
	// By reusing the editor session, we reduce the test time by 1.5~2 seconds for each test.
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'vuln');

	// Tests will run govulncheck and see if expected output is accumulated in fakeChannel.
	const fakeChannel = new FakeOutputChannel();
	suiteSetup(async () => {
		const config = require('../../src/config');
		const goConfig = Object.create(getGoConfig(), {
			// User the GOVULNDB that contains two OSV entries on golang.org/x/text and stdlib modules.
			toolsEnvVars: { value: { GOVULNDB: URI.file(path.join(fixtureDir, 'vulndb')).toString() } }
		}) as vscode.WorkspaceConfiguration;

		sandbox.stub(config, 'getGoConfig').returns(goConfig);
		await env.startGopls(undefined, goConfig, fixtureDir);

		sandbox.stub(ProgressTerminal, 'Open').callsFake((_name?: string, token?: ProgressToken) => {
			const fakeTerminal = {
				appendLine: fakeChannel.appendLine,
				show: () => {},
				exit: () => {}
			} as ProgressTerminal;
			if (token) {
				// Add the fake terminal to ActiveProgressTerminals to stream
				// logs from executeCommand and workDoneProgress. Test assumes
				// terminal remains open, unlike production scenarios.
				ActiveProgressTerminals.set(token, fakeTerminal);
			}
			return fakeTerminal;
		});
	});

	this.afterEach(async function () {
		if (this.currentTest?.state === 'failed') {
			console.log('=== Gopls Trace ===');
			env.flushTrace(true);
			console.log('=== Vulncheck Terminal Output ===');
			console.log(fakeChannel.toString());
		}
		env.flushTrace(false);
		fakeChannel.clear();
	});

	suiteTeardown(async () => {
		await env.teardown();
		sandbox.restore();
	});

	test('gopls.run_govulncheck finds vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod1');
		const output = await testRunGovulncheck(workspaceDir, 'gopls.run_govulncheck');
		const result = output.toString();
		assert(result.includes('GO-1970-TEXT'));
		assert(result.includes('vulnerabilities found'));
	});

	test('gopls.run_govulncheck finds no vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod2');
		const output = await testRunGovulncheck(workspaceDir, 'gopls.run_govulncheck');
		assert(output.toString().includes('No vulnerabilities found'));
	});

	test('gopls.vulncheck finds vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod1');
		const output = await testRunGovulncheck(workspaceDir, 'gopls.vulncheck');
		const result = output.toString();
		assert(result.includes('GO-1970-TEXT'));
		assert(result.includes('vulnerabilities found'));
	});

	test('gopls.vulncheck finds no vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod2');
		const output = await testRunGovulncheck(workspaceDir, 'gopls.vulncheck');
		assert(output.toString().includes('No vulnerabilities found'));
	});

	async function testRunGovulncheck(workspaceDir: string, command: string) {
		const languageClient = env.languageClient!;
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspaceDir, 'go.mod')));
		const uri = languageClient.code2ProtocolConverter.asTextDocumentIdentifier(document).uri;

		languageClient.middleware!.executeCommand!(command, [{ URI: uri }], async (cmd, args) => {
			const params: ExecuteCommandParams = {
				command: cmd,
				arguments: args
			};
			return await languageClient?.sendRequest(ExecuteCommandRequest.type, params);
		});
		const msg = 'vulnerabilities found';
		const timeoutMS = 10000;
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(`Timed out while waiting for '${msg}'`);
			}, timeoutMS);
			fakeChannel.onPattern(msg, () => {
				clearTimeout(timeout);
				resolve();
			});
		});
		return fakeChannel;
	}
});
