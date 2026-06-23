/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { Env } from './goplsTestEnv.utils';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';

suite('Interactive Refactoring', function () {
	this.timeout(30000);

	let document: vscode.TextDocument;
	const sandbox = sinon.createSandbox();
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata', 'interactive');
	const env = new Env();

	this.afterEach(function () {
		env.flushTrace(this.currentTest?.state === 'failed');
		sandbox.restore();
	});

	suiteSetup(async () => {
		await updateGoVarsFromConfig({});
		const uri = vscode.Uri.file(path.join(testdataDir, 'interactive.go'));
		await env.startGopls(uri.fsPath, undefined, testdataDir);
		document = await vscode.workspace.openTextDocument(uri);
	});

	suiteTeardown(async () => {
		await env.teardown();
	});

	test('Add struct tags', async () => {
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
			'vscode.executeCodeActionProvider',
			document.uri,
			editor.selection
		);

		const action = codeActions.find((a) => a.kind?.value === 'refactor.rewrite.addTags');

		assert.ok(action, 'Add struct tags code action not found');
		assert.ok(action.command, 'Code action has no command');

		const inputBoxStub = sandbox.stub(vscode.window, 'showInputBox');
		const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

		// First attempt fails because of invalid tags.
		inputBoxStub.onFirstCall().resolves('json,x x,html'); // invalid, space not allowed in a tag "x x"
		quickPickStub.onFirstCall().resolves({ value: 'camelcase', label: 'camelCase' } as any);

		// Second attempt succeeds. vscode-go will skip the second question because it was already answered and has no errors.
		inputBoxStub.onSecondCall().resolves('json,xml');
		quickPickStub
			.onSecondCall()
			.throws(new Error('Unexpected showQuickPick call. The second question should be skipped.'));

		// Trigger the command. The middleware handles the interactive handshake
		// with gopls, collects answers via our stubs, and executes the refactoring.
		await vscode.commands.executeCommand(action.command.command, ...action.command.arguments!);

		const docText = document.getText();
		assert.match(docText, /Foo string `json:"foo" xml:"foo"`/);
	});

	test('Stub methods', async () => {
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
			'vscode.executeCodeActionProvider',
			document.uri,
			editor.selection
		);

		const action = codeActions.find((a) => a.kind?.value === 'refactor.rewrite.implementInterface');
		assert.ok(action, 'Stub methods code action not found');
		assert.ok(action.command, 'Stub methods code action has no command');

		sandbox.stub(vscode.window, 'createQuickPick').returns({
			// In production, `onDidAccept` registers a callback that waits for a
			// user's click.
			// In this test, we simulate an immediate user selection by invoking the
			// callback instantly and mocking the chosen value via `selectedItems`.
			onDidAccept: (cb: () => void) => cb(),
			selectedItems: [{ label: 'net.Error', value: 'net.Error' }],
			// The following are fake properties, place holders for
			// production code to overwrite.
			title: '',
			placeholder: '',
			matchOnDescription: true,
			onDidChangeValue: sinon.fake(),
			onDidHide: sinon.fake(),
			show: sinon.fake(),
			hide: sinon.fake(),
			dispose: sinon.fake()
		} as any);

		// Trigger the command. The middleware handles the interactive handshake
		// with gopls, collects answers via our stubs, and executes the refactoring.
		await vscode.commands.executeCommand(action.command.command, ...action.command.arguments!);

		const docText = document.getText();

		assert.match(docText, /func \(f \*Foo\) Error\(\) string/);
		assert.match(docText, /func \(f \*Foo\) Temporary\(\) bool/);
		assert.match(docText, /func \(f \*Foo\) Timeout\(\) bool/);
	});
});
