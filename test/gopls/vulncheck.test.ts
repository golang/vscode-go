/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import path = require('path');
import vscode = require('vscode');
import { extensionId } from '../../src/const';
import goVulncheck = require('../../src/goVulncheck');

suite('vulncheck result viewer tests', () => {
	const webviewId = 'vulncheck';
	const extensionUri = vscode.extensions.getExtension(extensionId)!.extensionUri;
	const fixtureDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'vuln');

	const disposables: vscode.Disposable[] = [];
	function _register<T extends vscode.Disposable>(disposable: T) {
		disposables.push(disposable);
		return disposable;
	}
	let provider: goVulncheck.VulncheckResultViewProvider;

	setup(() => {
		provider = new goVulncheck.VulncheckResultViewProvider(extensionUri);
	});

	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		vscode.Disposable.from(...disposables).dispose();
	});

	test('populates webview', async () => {
		const webviewPanel = _register(
			vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, {})
		);
		const source = path.join(fixtureDir, 'test.vulncheck.json');
		const doc = await vscode.workspace.openTextDocument(source);
		const canceller = new vscode.CancellationTokenSource();
		_register(canceller);

		const watcher = getMessage<{ type: string; target?: string }>(webviewPanel);

		await provider.resolveCustomTextEditor(doc, webviewPanel, canceller.token);
		webviewPanel.reveal();

		// Trigger snapshotContent that sends `snapshot-result` as a result.
		webviewPanel.webview.postMessage({ type: 'snapshot-request' });
		const res = await watcher;

		assert.deepStrictEqual(res.type, 'snapshot-result', `want snapshot-result, got ${JSON.stringify(res)}`);
		assert(res.target && res.target.includes('GO-2021-0113'), res.target);
	});

	test('handles invalid input', async () => {
		const webviewPanel = _register(
			vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, {})
		);
		// Empty doc.
		const doc = await vscode.workspace.openTextDocument(
			vscode.Uri.file('bogus.vulncheck.json').with({ scheme: 'untitled' })
		);
		const canceller = new vscode.CancellationTokenSource();
		_register(canceller);

		const watcher = getMessage<{ type: string; target?: string }>(webviewPanel);

		await provider.resolveCustomTextEditor(doc, webviewPanel, canceller.token);
		webviewPanel.reveal();

		// Trigger snapshotContent that sends `snapshot-result` as a result.
		webviewPanel.webview.postMessage({ type: 'snapshot-request' });
		const res = await watcher;
		assert.deepStrictEqual(res.type, 'snapshot-result', `want snapshot-result, got ${JSON.stringify(res)}`);
		assert(!res.target, res.target);
	});
});

function getMessage<R = { type: string; target?: string }>(webview: vscode.WebviewPanel): Promise<R> {
	return new Promise<R>((resolve) => {
		const sub = webview.webview.onDidReceiveMessage((message) => {
			sub.dispose();
			resolve(message);
		});
	});
}
