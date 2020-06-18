/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import fs = require('fs-extra');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { GoRunTestCodeLensProvider } from '../../src/goRunTestCodelens';
import { subTestAtCursor } from '../../src/goTest';
import { getCurrentGoPath } from '../../src/util';

suite('Code lenses for testing and benchmarking', function () {
	this.timeout(20000);

	let gopath: string;
	let repoPath: string;
	let fixturePath: string;
	let fixtureSourcePath: string;

	let goConfig: vscode.WorkspaceConfiguration;
	let document: vscode.TextDocument;

	const cancellationTokenSource = new vscode.CancellationTokenSource();
	const codeLensProvider = new GoRunTestCodeLensProvider();

	suiteSetup(async () => {
		await updateGoVarsFromConfig();

		gopath = getCurrentGoPath();
		if (!gopath) {
			assert.fail('Cannot run tests without a configured GOPATH');
		}
		console.log(`Using GOPATH: ${gopath}`);

		// Set up the test fixtures.
		repoPath = path.join(gopath, 'src', 'test');
		fixturePath = path.join(repoPath, 'testfixture');
		fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'codelens');

		fs.removeSync(repoPath);
		fs.copySync(fixtureSourcePath, fixturePath, {
			recursive: true,
			// All of the tests run in GOPATH mode for now.
			// TODO(rstambler): Run tests in GOPATH and module mode.
			filter: (src: string): boolean => {
				if (path.basename(src) === 'go.mod') {
					return false;
				}
				return true;
			},
		});
		goConfig = vscode.workspace.getConfiguration('go');
		const uri = vscode.Uri.file(path.join(fixturePath, 'codelens_test.go'));
		document = await vscode.workspace.openTextDocument(uri);
	});

	suiteTeardown(() => {
		fs.removeSync(repoPath);
	});

	teardown(() => {
		sinon.restore();
	});

	test('Subtests - runs a test with cursor on t.Run line', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(7, 4, 7, 4);
		const result = await subTestAtCursor(goConfig, []);
		assert.equal(result, true);
	});

	test('Subtests - runs a test with cursor within t.Run function', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(8, 4, 8, 4);
		const result = await subTestAtCursor(goConfig, []);
		assert.equal(result, true);
	});

	test('Subtests - returns false for a failing test', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(11, 4, 11, 4);
		const result = await subTestAtCursor(goConfig, []);
		assert.equal(result, false);
	});

	test('Subtests - does nothing for a dynamically defined subtest', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(17, 4, 17, 4);
		const result = await subTestAtCursor(goConfig, []);
		assert.equal(result, undefined);
	});

	test('Subtests - does nothing when cursor outside of a test function', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(5, 0, 5, 0);
		const result = await subTestAtCursor(goConfig, []);
		assert.equal(result, undefined);
	});

	test('Subtests - does nothing when no test function covers the cursor and a function name is passed in', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(5, 0, 5, 0);
		const result = await subTestAtCursor(goConfig, { functionName: 'TestMyFunction' });
		assert.equal(result, undefined);
	});

	test('Test codelenses', async () => {
		const codeLenses = await codeLensProvider.provideCodeLenses(document, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 4);
		const wantCommands = ['go.test.package', 'go.test.file', 'go.test.cursor', 'go.debug.cursor'];
		for (let i = 0; i < codeLenses.length; i++) {
			assert.equal(codeLenses[i].command.command, wantCommands[i]);
		}
	});

	test('Benchmark codelenses', async () => {
		const uri = vscode.Uri.file(path.join(fixturePath, 'codelens_benchmark_test.go'));
		const benchmarkDocument = await vscode.workspace.openTextDocument(uri);
		const codeLenses = await codeLensProvider.provideCodeLenses(benchmarkDocument, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 6);
		const wantCommands = ['go.test.package', 'go.test.file', 'go.benchmark.package',
			'go.benchmark.file', 'go.benchmark.cursor', 'go.debug.cursor'];
		for (let i = 0; i < codeLenses.length; i++) {
			assert.equal(codeLenses[i].command.command, wantCommands[i]);
		}
	});
});
