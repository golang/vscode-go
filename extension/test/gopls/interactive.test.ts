/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path = require('path');
import semver = require('semver');
import sinon = require('sinon');
import vscode = require('vscode');
import { Env } from './goplsTestEnv.utils';
import * as config from '../../src/config';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { addTags, removeTags } from '../../src/goModifytags';
import { goplsImpl, legacyImpl } from '../../src/goImpl';
import { MockExtensionContext } from '../mocks/MockContext';

suite('Interactive Refactoring', function () {
	this.timeout(30000);

	let document: vscode.TextDocument;
	const sandbox = sinon.createSandbox();
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata', 'interactive');
	const env = new Env();

	this.afterEach(async function () {
		// Revert any unsaved document changes made during refactoring tests.
		await vscode.commands.executeCommand('workbench.action.files.revert');
		env.flushTrace(this.currentTest?.state === 'failed');
		sandbox.restore();
	});

	// stubTagsSetting overrides the "go.<section>" setting with the given value.
	// Other settings are read as usual.
	function stubTagsSetting(section: 'addTags' | 'removeTags', value: object) {
		const getGoConfig = config.getGoConfig;
		sandbox.stub(config, 'getGoConfig').callsFake((uri?: vscode.Uri) => {
			const goConfig = getGoConfig(uri);
			return Object.create(goConfig, {
				get: {
					value: (key: string, defaultValue?: unknown) =>
						key === section ? value : goConfig.get(key, defaultValue)
				}
			});
		});
	}

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

	// Regression test for golang/vscode-go#4070.
	//
	// Without custom settings, gopls prompts for the tags and the transform.
	test('Add struct tags via addTags', async () => {
		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		sandbox.stub(vscode.window, 'showInputBox').resolves('json,xml');
		sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: 'camelcase', label: 'camelCase' } as any);

		await addTags(ctx, env.goCtx)(editor.document.uri);

		const docText = document.getText();
		assert.match(docText, /Foo string `json:"foo" xml:"foo"`/);
		ctx.teardown();
	});

	// With custom "go.addTags" settings, the settings are used without prompting.
	test('Add struct tags via addTags with settings', async function () {
		// gopls before v0.24.0 prompts even if the arguments specify the tags.
		const goplsVersion = semver.coerce(env.goCtx.serverInfo?.Version);
		if (!goplsVersion || semver.lt(goplsVersion, '0.24.0')) {
			this.skip();
		}

		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		stubTagsSetting('addTags', {
			tags: 'yaml',
			options: 'yaml=omitempty',
			promptForTags: false,
			transform: 'snakecase',
			template: ''
		});
		sandbox.stub(vscode.window, 'showInputBox').rejects(new Error('unexpected showInputBox call'));
		sandbox.stub(vscode.window, 'showQuickPick').rejects(new Error('unexpected showQuickPick call'));

		await addTags(ctx, env.goCtx)(editor.document.uri);

		const docText = document.getText();
		assert.match(docText, /Foo string `yaml:"foo,omitempty"`/);
		ctx.teardown();
	});

	// With promptForTags, gopls prompts even if tags are configured.
	test('Add struct tags via addTags with promptForTags', async () => {
		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		stubTagsSetting('addTags', {
			tags: 'yaml',
			options: 'yaml=omitempty',
			promptForTags: true,
			transform: 'snakecase',
			template: ''
		});
		sandbox.stub(vscode.window, 'showInputBox').resolves('json,xml');
		sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: 'camelcase', label: 'camelCase' } as any);

		await addTags(ctx, env.goCtx)(editor.document.uri);

		const docText = document.getText();
		assert.match(docText, /Foo string `json:"foo" xml:"foo"`/);
		ctx.teardown();
	});

	// Without custom settings, gopls prompts for the tags to remove instead of
	// removing all tags.
	test('Remove struct tags via removeTags', async () => {
		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string `json:"foo" xml:"foo"`
		// }
		const edit = new vscode.WorkspaceEdit();
		edit.insert(document.uri, new vscode.Position(3, 11), ' `json:"foo" xml:"foo"`');
		assert.ok(await vscode.workspace.applyEdit(edit), 'failed to add struct tags');
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		sandbox.stub(vscode.window, 'showInputBox').resolves('xml');

		await removeTags(ctx, env.goCtx)(editor.document.uri);

		const docText = document.getText();
		assert.match(docText, /Foo string `json:"foo"`/);
		ctx.teardown();
	});

	test('Implement interface via gopls', async () => {
		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string //@loc(editor.selection, "Foo string")
		// }
		editor.selection = new vscode.Selection(3, 1, 3, 11);

		sandbox.stub(vscode.window, 'createQuickPick').returns({
			onDidAccept: (cb: () => void) => cb(),
			selectedItems: [{ label: 'net.Error', value: 'net.Error' }],
			title: '',
			placeholder: '',
			matchOnDescription: true,
			onDidChangeValue: sinon.fake(),
			onDidHide: sinon.fake(),
			show: sinon.fake(),
			hide: sinon.fake(),
			dispose: sinon.fake()
		} as any);

		await goplsImpl(ctx, env.goCtx)();

		const docText = document.getText();
		assert.match(docText, /func \(f \*Foo\) Error\(\) string/);
		assert.match(docText, /func \(f \*Foo\) Temporary\(\) bool/);
		assert.match(docText, /func \(f \*Foo\) Timeout\(\) bool/);
		ctx.teardown();
	});

	test('Implement interface via impl', async () => {
		const ctx = MockExtensionContext.new();
		const editor = await vscode.window.showTextDocument(document);

		// type Foo struct {
		//	Foo string
		// }
		// //@loc(editor.selection, "")
		editor.selection = new vscode.Selection(5, 0, 5, 0);

		sandbox.stub(vscode.window, 'showInputBox').resolves('f *Foo net.Error');

		await legacyImpl(ctx, env.goCtx)();

		const docText = document.getText();
		assert.match(docText, /func \(f \*Foo\) Error\(\) string/);
		assert.match(docText, /func \(f \*Foo\) Temporary\(\) bool/);
		assert.match(docText, /func \(f \*Foo\) Timeout\(\) bool/);
		ctx.teardown();
	});
});
