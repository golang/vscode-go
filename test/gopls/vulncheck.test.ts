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
		provider = new goVulncheck.VulncheckResultViewProvider(extensionUri, {});
	});

	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		vscode.Disposable.from(...disposables).dispose();
	});

	test('populates webview', async () => {
		const doTest = async (tag: string) => {
			const webviewPanel = _register(
				vscode.window.createWebviewPanel(webviewId, 'title', { viewColumn: vscode.ViewColumn.One }, {})
			);
			const source = path.join(fixtureDir, 'test.vulncheck.json');
			const doc = await vscode.workspace.openTextDocument(source);
			console.timeLog(tag, 'opened document');
			const canceller = new vscode.CancellationTokenSource();
			_register(canceller);

			const watcher = getMessage<{ type: string; target?: string }>(webviewPanel);

			await provider.resolveCustomTextEditor(doc, webviewPanel, canceller.token);
			console.timeLog(tag, 'resolved custom text editor');

			webviewPanel.reveal();

			// Trigger snapshotContent that sends `snapshot-result` as a result.
			webviewPanel.webview.postMessage({ type: 'snapshot-request' });
			console.timeLog(tag, 'posted snapshot-request');

			const res = await watcher;
			console.timeLog(tag, 'received message');

			assert.deepStrictEqual(res.type, 'snapshot-result', `want snapshot-result, got ${JSON.stringify(res)}`);
			// res.target type is defined in vulncheckView.js.
			const { log = '', vulns = '', unaffecting = '' } = JSON.parse(res.target ?? '{}');

			assert(
				log.includes('1 known vulnerabilities'),
				`expected "1 known vulnerabilities", got ${JSON.stringify(res.target)}`
			);
			assert(
				vulns.includes('GO-2021-0113') &&
					vulns.includes('<td>Affecting</td><td>github.com/golang/vscode-go/test/testdata/vuln</td>'),
				`expected "Affecting" section, got ${JSON.stringify(res.target)}`
			);
			// Unaffecting vulnerability's ID is reported.
			assert(
				unaffecting.includes('GO-2021-0000') && unaffecting.includes('golang.org/x/text'),
				`expected reports about unaffecting vulns, got ${JSON.stringify(res.target)}`
			);
		};
		try {
			console.time('populates-webview');
			await doTest('populates-webview');
		} catch (e) {
			console.timeLog('populates-webview', `error thrown: ${e}`);
			throw e;
		} finally {
			console.timeEnd('populates-webview');
		}
	}).timeout(5_000);

	test('handles empty input', async () => {
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
		const { log = '', vulns = '', unaffecting = '' } = JSON.parse(res.target ?? '{}');
		assert(!log && !vulns && !unaffecting, res.target);
	});

	// TODO: test corrupted/incomplete json file handling.
});

function getMessage<R = { type: string; target?: string }>(webview: vscode.WebviewPanel): Promise<R> {
	return new Promise<R>((resolve) => {
		const sub = webview.webview.onDidReceiveMessage((message) => {
			sub.dispose();
			resolve(message);
		});
	});
}
suite('fillAffectedPkgs', () => {
	test('compute from the first call stack entry', async () => {
		const data = JSON.parse(`{
		"Vuln": [{
			"CallStacks": [
				[
				  {
					"Name": "github.com/golang/vscode-go/test/testdata/vuln.main",
					"URI": "file:///vuln/test.go",
					"Pos": { "line": 9, "character": 0 }
				  },
				  {
					"Name": "golang.org/x/text/language.Parse",
					"URI": "file:///foo/bar.go",
					"Pos": { "line": 227, "character": 0 }
				  }
				]
			]}]}`);
		goVulncheck.fillAffectedPkgs(data.Vuln);
		assert.deepStrictEqual(data.Vuln[0].AffectedPkgs, ['github.com/golang/vscode-go/test/testdata/vuln']);
	});

	test('callstacks missing', async () => {
		const data = JSON.parse('{ "Vuln": [{}] }');
		goVulncheck.fillAffectedPkgs(data.Vuln);
		assert.deepStrictEqual(data.Vuln[0].AffectedPkgs, []);
	});

	test('callstacks empty', async () => {
		const data = JSON.parse('{ "Vuln": [{"CallStacks": []}] }');
		goVulncheck.fillAffectedPkgs(data.Vuln);
		assert.deepStrictEqual(data.Vuln[0].AffectedPkgs, []);
	});

	test('first call stack entry is missing Name', async () => {
		const data = JSON.parse(`{
		"Vuln": [{ "CallStacks": [ [ { "URI": "file:///vuln/test.go" } ] ]}]}`);
		goVulncheck.fillAffectedPkgs(data.Vuln);
		assert.deepStrictEqual(data.Vuln[0].AffectedPkgs, []);
	});
});
