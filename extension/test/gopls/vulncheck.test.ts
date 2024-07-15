/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { VulncheckTerminal } from '../../src/goVulncheck';
import { ExecuteCommandParams, ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { Env, FakeOutputChannel } from './goplsTestEnv.utils';
import { URI } from 'vscode-uri';
import { getGoConfig } from '../../src/config';

suite('writeVulns', function () {
	this.timeout(30000);
	const sandbox = sinon.createSandbox(); // for suite
	const env = new Env();

	// This test suite will start an editor that opens a go workspace in test/testdata/vuln
	// that includes mod1 (that has some vulnerabilities) and mod2 (that has 0 dependency).
	// By reusing the editor session, we reduce the test time by 1.5~2 seconds for each test.
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'vuln');

	// Tests will run govulncheck and see if expected output is accumulated in fakeTerminal.
	const fakeTerminal = new FakeOutputChannel();
	suiteSetup(async () => {
		const config = require('../../src/config');
		const goConfig = Object.create(getGoConfig(), {
			// User the GOVULNDB that contains two OSV entries on golang.org/x/text and stdlib modules.
			toolsEnvVars: { value: { GOVULNDB: URI.file(path.join(fixtureDir, 'vulndb')).toString() } }
		}) as vscode.WorkspaceConfiguration;

		sandbox.stub(config, 'getGoConfig').returns(goConfig);
		await env.startGopls(undefined, goConfig, fixtureDir);

		sandbox.stub(VulncheckTerminal, 'Open').returns({
			appendLine: fakeTerminal.appendLine,
			show: () => {},
			exit: () => {}
		});
	});

	this.afterEach(async function () {
		if (this.currentTest?.state === 'failed') {
			console.log('=== Gopls Trace ===');
			env.flushTrace(true);
			console.log('=== Vulncheck Terminal Output ===');
			console.log(fakeTerminal.toString());
		}
		env.flushTrace(false);
		fakeTerminal.clear();
	});

	suiteTeardown(async () => {
		await env.teardown();
		sandbox.restore();
	});

	test('govulncheck finds vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod1');
		const output = await testRunGovulncheck(workspaceDir);
		const result = output.toString();
		assert(result.includes('GO-1970-TEXT'));
		assert(result.includes('vulnerabilities found'));
	});

	test('govulncheck finds no vulnerabilities', async () => {
		const workspaceDir = path.join(fixtureDir, 'mod2');
		const output = await testRunGovulncheck(workspaceDir);
		assert(output.toString().includes('No vulnerabilities found'));
	});

	async function testRunGovulncheck(workspaceDir: string) {
		const languageClient = env.languageClient!;
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(workspaceDir, 'go.mod')));
		const uri = languageClient.code2ProtocolConverter.asTextDocumentIdentifier(document).uri;

		languageClient.middleware!.executeCommand!('gopls.run_govulncheck', [{ URI: uri }], async (cmd, args) => {
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
			fakeTerminal.onPattern(msg, () => {
				clearTimeout(timeout);
				resolve();
			});
		});
		return fakeTerminal;
	}
});
