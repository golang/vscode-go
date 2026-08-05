/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as path from 'path';
import sinon from 'sinon';
import * as vscode from 'vscode';
import * as config from '../../src/config';
import { MockWorkspaceConfiguration } from '../integration/mocks/configuration';
import { Env } from './goplsTestEnv.utils';

suite('Gopls custom semantic token modifiers', function () {
	this.timeout(30000);
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata', 'semantictokens');
	let env: Env;
	let docUri: vscode.Uri;

	suiteSetup(async () => {
		env = new Env();
		const goplsConfig = new MockWorkspaceConfiguration(
			config.getGoplsConfig(),
			new Map<string, any>([['ui.semanticTokens', true]])
		);
		sinon.stub(config, 'getGoplsConfig').returns(goplsConfig);

		await env.startGopls(path.join(testdataDir, 'main.go'), undefined, testdataDir);

		const { uri, doc } = await env.openDoc(testdataDir, 'main.go');
		await vscode.window.showTextDocument(doc);
		docUri = uri;
	});

	suiteTeardown(async () => {
		sinon.restore();
		await env.teardown();
		env.flushTrace(false);
	});

	test('SemanticTokensProvider returns expected custom modifiers', async () => {
		const provider = env.languageClient?.initializeResult?.capabilities?.semanticTokensProvider;
		const legend = provider?.legend;
		assert.ok(legend && legend.tokenModifiers, 'expected semantic tokens legend from gopls');

		const tokens = (await vscode.commands.executeCommand(
			'vscode.provideDocumentSemanticTokens',
			docUri
		)) as vscode.SemanticTokens;
		assert.ok(tokens && tokens.data && tokens.data.length > 0, 'expected semantic tokens data from vscode');

		for (const want of ['struct', 'format', 'pointer']) {
			const modIndex = legend.tokenModifiers.indexOf(want);
			assert.ok(modIndex >= 0, `expected "${want}" modifier in gopls legend`);

			let found = false;
			for (let i = 4; i < tokens.data.length; i += 5) {
				if ((tokens.data[i] & (1 << modIndex)) !== 0) {
					found = true;
					break;
				}
			}
			assert.ok(found, `expected at least one token with the "${want}" modifier`);
		}
	});
});
