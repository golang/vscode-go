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

	suiteTeardown(() => {
		ctx.teardown();
	});

	test('opening a document should trigger package outline response', async () => {
		const document = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixtureDir, 'symbols_1.go'))
		);
		await window.showTextDocument(document);
		await sleep(500); // wait for gopls response
		const res = provider.result;
		assert.strictEqual(res?.PackageName, 'package_outline_test');
		assert.strictEqual(res?.Files.length, 2);
		assert.strictEqual(res?.Symbols.length, 3);
		assert.strictEqual(res?.Symbols[0].name, 'TestReceiver');
		assert.strictEqual(res?.Symbols[0].children.length, 6); // 3 fields and 3 receiver methods
	});

	test('clicking on symbol should navigate to definition', async () => {
		const document = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixtureDir, 'symbols_1.go'))
		);
		await window.showTextDocument(document);
		await sleep(500); // wait for gopls response
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
		const document = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixtureDir, 'symbols_1.go'))
		);
		await window.showTextDocument(document);
		await sleep(500); // wait for gopls response
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

	test('non-go file does not trigger outline', async () => {
		const document = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixtureDir, 'symbols_3.ts'))
		);
		await window.showTextDocument(document);
		await sleep(500); // wait for gopls response
		assert.strictEqual(provider.result, undefined);
	});
});

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function clickSymbol(symbol: PackageSymbol) {
	if (symbol.command) {
		vscode.commands.executeCommand(symbol.command.command, ...(symbol.command.arguments || []));
	} else {
		assert.fail(symbol.label + ' symbol has no command');
	}
}
