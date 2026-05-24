/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path from 'path';
import { MockExtensionContext } from '../mocks/MockContext';
import { GoPackageOutlineProvider, PackageSymbol } from '../../src/goPackageOutline';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { window } from 'vscode';
import { Env } from '../gopls/goplsTestEnv.utils';
import { sleep, poll } from './testutils';
import { getGoConfig } from '../../src/config';

import vscode = require('vscode');

suite('GoPackageOutlineProvider', function () {
	this.timeout(20000);
	let provider: GoPackageOutlineProvider;
	const fixtureDir = path.join(__dirname, '../../../test/testdata/packageOutlineTest');
	const ctx = MockExtensionContext.new();
	const env = new Env();

	suiteSetup(async () => {
		await updateGoVarsFromConfig({});
		await env.startGopls(undefined, getGoConfig(), fixtureDir);
		provider = GoPackageOutlineProvider.setup(ctx);
	});

	setup(async () => {
		await vscode.commands.executeCommand('go.packageOutline.sortByPosition');
	});

	suiteTeardown(() => {
		ctx.teardown();
	});

	test('opening a document should trigger package outline response', async () => {
		await openDocInPkgOutline('symbols_1.go');
		const res = provider.result;
		assert.strictEqual(res?.PackageName, 'package_outline_test');
		assert.strictEqual(res?.Files.length, 2);
		assert.strictEqual(res?.Symbols.length, 3);
		assert.strictEqual(res?.Symbols[0].name, 'TestReceiver');
		assert.strictEqual(res?.Symbols[0].children.length, 6); // 3 fields and 3 receiver methods
	});

	test('clicking on symbol should navigate to definition', async () => {
		const document = await openDocInPkgOutline('symbols_1.go');
		await vscode.commands.executeCommand('setContext', 'go.showPackageOutline');
		const children = await provider.getChildren();
		const receiver = children?.find((symbol) => symbol.label === 'TestReceiver');
		assert.ok(receiver, 'receiver symbol not found');
		const method1 = receiver.children?.find((symbol) => symbol.label === 'method1');
		assert.ok(method1, 'method1 symbol not found');
		clickSymbol(method1);
		await sleep(500); // wait for editor to navigate to symbol
		assert.strictEqual(window.activeTextEditor?.document.uri.fsPath, document.uri.fsPath);
		assert.strictEqual(window.activeTextEditor?.selection.active.line, 19);
		assert.strictEqual(window.activeTextEditor?.selection.active.character, 0);
	});

	test('clicking on symbol in different file should open file', async () => {
		await openDocInPkgOutline('symbols_1.go');
		await vscode.commands.executeCommand('setContext', 'go.showPackageOutline');
		const children = await provider.getChildren();
		const receiver = children?.find((symbol) => symbol.label === 'TestReceiver');
		assert.ok(receiver, 'receiver symbol not found');
		const method2 = receiver.children?.find((symbol) => symbol.label === 'method2');
		assert.ok(method2, 'method2 symbol not found');
		clickSymbol(method2);
		await sleep(500); // wait for editor to navigate to symbol
		const symbols2 = vscode.workspace.textDocuments.find(
			(doc) => doc.uri.fsPath === path.join(fixtureDir, 'symbols_2.go')
		);
		assert.strictEqual(window.activeTextEditor?.document.uri.fsPath, symbols2?.uri.fsPath);
		assert.strictEqual(window.activeTextEditor?.selection.active.line, 2);
		assert.strictEqual(window.activeTextEditor?.selection.active.character, 0);
	});

	test('sort by name orders symbols alphabetically', async () => {
		await openDocInPkgOutline('symbols_1.go');
		await vscode.commands.executeCommand('go.packageOutline.sortByName');
		const children = await provider.getChildren();
		assert.deepStrictEqual(
			(children ?? []).slice(1).map((symbol) => symbol.label),
			['main', 'print', 'TestReceiver']
		);
		const receiver = children?.find((symbol) => symbol.label === 'TestReceiver');
		assert.ok(receiver, 'receiver symbol not found');
		const receiverChildren = await provider.getChildren(receiver);
		assert.deepStrictEqual(
			(receiverChildren ?? []).map((symbol) => symbol.label),
			['field1', 'field2', 'field3', 'method1', 'method2', 'method3']
		);
	});

	test('sort by position orders symbols by source location', async () => {
		await openDocInPkgOutline('symbols_1.go');
		const children = await provider.getChildren();
		assert.deepStrictEqual(
			(children ?? []).slice(1).map((symbol) => symbol.label),
			['print', 'main', 'TestReceiver']
		);
	});

	test('cursor changes reveal the active symbol', async () => {
		const document1 = await openDocInPkgOutline('symbols_1.go');
		await vscode.commands.executeCommand('go.package.outline.focus');
		await poll(() => assert.strictEqual(provider.view?.visible, true));

		await moveCursor(document1, 19);
		await poll(() => assert.strictEqual(provider.lastRevealed?.label, 'method1'));

		const document2 = await openDocInPkgOutline('symbols_2.go');
		await moveCursor(document2, 2);
		await poll(() => assert.strictEqual(provider.lastRevealed?.label, 'method2'));
	});

	test('does not reveal active symbol when sidebar is closed', async () => {
		const document = await openDocInPkgOutline('symbols_1.go');

		const view = provider.view;
		assert.ok(view, 'view is undefined');

		await vscode.commands.executeCommand('go.package.outline.focus');
		await sleep(500);
		assert.strictEqual(view.visible, true, 'view should be visible initially');

		await vscode.commands.executeCommand('workbench.action.closeSidebar');
		await sleep(500);
		assert.strictEqual(view.visible, false, 'view should be invisible after closing sidebar');

		// Reset to verify that no new symbol is revealed when the cursor moves.
		provider.lastRevealed = undefined;
		await moveCursor(document, 19);
		await sleep(500);

		assert.strictEqual(view.visible, false, 'view should remain invisible');
		assert.strictEqual(provider.lastRevealed, undefined, 'should not reveal active symbol');
	});

	test('does not reveal active symbol when focused on "Code Search" view', async () => {
		const document = await openDocInPkgOutline('symbols_1.go');

		const view = provider.view;
		assert.ok(view, 'view is undefined');

		await vscode.commands.executeCommand('go.package.outline.focus');
		await sleep(500);
		assert.strictEqual(view.visible, true, 'view should be visible initially');

		await vscode.commands.executeCommand('workbench.view.search');
		await sleep(500);
		assert.strictEqual(view.visible, false, 'view should be invisible after switching container');

		// Reset to verify that no new symbol is revealed when the cursor moves.
		provider.lastRevealed = undefined;

		// Move the cursor to the position of a package symbol.
		await moveCursor(document, 19);
		await sleep(500);

		assert.strictEqual(view.visible, false, 'view should remain invisible');
		assert.strictEqual(provider.lastRevealed, undefined, 'should not reveal active symbol');
	});

	test('non-go file does not trigger outline', async () => {
		const document = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixtureDir, 'symbols_3.ts'))
		);
		await window.showTextDocument(document);
		await sleep(500); // wait for gopls response
		assert.strictEqual(provider.result, undefined);
	});

	/**
	 * Helper to open a file, show it in the active window editor, and wait until
	 * the outline result is available for the package 'package_outline_test'.
	 *
	 * @param filename The name of the file to open, relative to the fixture directory.
	 */
	async function openDocInPkgOutline(filename: string): Promise<vscode.TextDocument> {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureDir, filename)));
		await window.showTextDocument(document);
		await waitForOutlineResult(provider, 'package_outline_test');
		return document;
	}
});

async function waitForOutlineResult(provider: GoPackageOutlineProvider, packageName: string) {
	await poll(() => {
		assert.strictEqual(provider.result?.PackageName, packageName, `expected package name to be ${packageName}`);
	}, 5000);
}

async function moveCursor(document: vscode.TextDocument, line: number, character = 0) {
	const editor = await window.showTextDocument(document);
	const position = new vscode.Position(line, character);
	editor.selection = new vscode.Selection(position, position);
}

function clickSymbol(symbol: PackageSymbol) {
	if (symbol.command) {
		vscode.commands.executeCommand(symbol.command.command, ...(symbol.command.arguments || []));
	} else {
		assert.fail(symbol.label + ' symbol has no command');
	}
}
