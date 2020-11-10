/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import * as assert from 'assert';
import cp = require('child_process');
import { EventEmitter } from 'events';
import * as path from 'path';
import sinon = require('sinon');
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { buildLanguageClient, BuildLanguageClientOption, buildLanguageServerConfig } from '../../src/goLanguageServer';
import { getGoConfig } from '../../src/util';

// FakeOutputChannel is a fake output channel used to buffer
// the output of the tested language client in an in-memory
// string array until cleared.
class FakeOutputChannel implements vscode.OutputChannel {
	public name = 'FakeOutputChannel';
	public show = sinon.fake(); // no-empty
	public hide = sinon.fake(); // no-empty
	public dispose = sinon.fake();  // no-empty

	private buf = [] as string[];

	private eventEmitter = new EventEmitter();
	private registeredPatterns = new Set<string>();
	public onPattern(msg: string, listener: () => void) {
		this.registeredPatterns.add(msg);
		this.eventEmitter.once(msg, () => {
			this.registeredPatterns.delete(msg);
			listener();
		});
	}

	public append = (v: string) => this.enqueue(v);
	public appendLine = (v: string) => this.enqueue(v);
	public clear = () => { this.buf = []; };
	public toString = () => {
		return this.buf.join('\n');
	}

	private enqueue = (v: string) => {
		this.registeredPatterns?.forEach((p) => {
			if (v.includes(p)) {
				this.eventEmitter.emit(p);
			}
		});

		if (this.buf.length > 1024) { this.buf.shift(); }
		this.buf.push(v.trim());
	}
}

// Env is a collection of test-related variables and lsp client.
// Currently, this works only in module-aware mode.
class Env {
	public languageClient?: LanguageClient;
	private fakeOutputChannel: FakeOutputChannel;
	private disposables = [] as { dispose(): any }[];

	public flushTrace(print: boolean) {
		if (print) {
			console.log(this.fakeOutputChannel.toString());
		}
		this.fakeOutputChannel.clear();
	}

	// This is a hack to check the progress of package loading.
	// TODO(hyangah): use progress message middleware hook instead
	// once it becomes available.
	public onMessageInTrace(msg: string, timeoutMS: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.flushTrace(true);
				reject(`Timed out while waiting for '${msg}'`);
			}, timeoutMS);
			this.fakeOutputChannel.onPattern(msg, () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}

	public async setup(filePath: string) {  // file path to open.
		this.fakeOutputChannel = new FakeOutputChannel();
		const pkgLoadingDone = this.onMessageInTrace('Finished loading packages.', 60_000);

		// Start the language server with the fakeOutputChannel.
		const goConfig = Object.create(getGoConfig(), {
			useLanguageServer: { value: true },
			languageServerFlags: { value: ['-rpc.trace'] },  // enable rpc tracing to monitor progress reports
		});
		const cfg: BuildLanguageClientOption = buildLanguageServerConfig(goConfig);
		cfg.outputChannel = this.fakeOutputChannel;  // inject our fake output channel.
		this.languageClient = await buildLanguageClient(cfg);
		this.disposables.push(this.languageClient.start());

		await this.languageClient.onReady();
		await this.openDoc(filePath);
		await pkgLoadingDone;
	}

	public async teardown() {
		await this.languageClient?.stop();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.languageClient = undefined;
	}

	public async openDoc(...paths: string[]) {
		const uri = vscode.Uri.file(path.resolve(...paths));
		const doc = await vscode.workspace.openTextDocument(uri);
		return { uri, doc };
	}
}

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('Go Extension Tests With Gopls', function () {
	this.timeout(300000);
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata');
	const env = new Env();

	suiteSetup(async () => await env.setup(path.resolve(testdataDir, 'gogetdocTestData', 'test.go')));
	suiteTeardown(() => env.teardown());

	this.afterEach(function () {
		// Note: this shouldn't use () => {...}. Arrow functions do not have 'this'.
		// I don't know why but this.currentTest.state does not have the expected value when
		// used with teardown.
		env.flushTrace(this.currentTest.state === 'failed');
	});

	test('HoverProvider', async () => {
		const { uri } = await env.openDoc(testdataDir, 'gogetdocTestData', 'test.go');
		const testCases: [string, vscode.Position, string | null, string | null][] = [
			// [new vscode.Position(3,3), '/usr/local/go/src/fmt'],
			['keyword', new vscode.Position(0, 3), null, null], // keyword
			['inside a string', new vscode.Position(23, 14), null, null], // inside a string
			['just a }', new vscode.Position(20, 0), null, null], // just a }
			['inside a number', new vscode.Position(28, 16), null, null], // inside a number
			['func main()', new vscode.Position(22, 5), 'func main()', null],
			['import "math"', new vscode.Position(40, 23), 'package math', '`math` on'],
			['func Println()', new vscode.Position(19, 6), 'func fmt.Println(a ...interface{}) (n int, err error)', 'Println formats '],
			['func print()', new vscode.Position(23, 4), 'func print(txt string)', 'This is an unexported function ']
		];

		const promises = testCases.map(async ([name, position, expectedSignature, expectedDoc]) => {
			const hovers = await vscode.commands.executeCommand(
				'vscode.executeHoverProvider', uri, position) as vscode.Hover[];

			if (expectedSignature === null && expectedDoc === null) {
				assert.equal(hovers.length, 0, `check hovers over ${name} failed: unexpected non-empty hover message.`);
				return;
			}

			const hover = hovers[0];
			assert.equal(hover.contents.length, 1, `check hovers over ${name} failed: unexpected number of hover messages.`);
			const gotMessage = (<vscode.MarkdownString>hover.contents[0]).value;
			assert.ok(
				gotMessage.includes('```go\n' + expectedSignature + '\n```')
				&& (!expectedDoc || gotMessage.includes(expectedDoc)),
				`check hovers over ${name} failed: got ${gotMessage}`);
		});
		return Promise.all(promises);
	});

	test('Completion middleware', async () => {
		const { uri } = await env.openDoc(testdataDir, 'gogetdocTestData', 'test.go');
		const testCases: [string, vscode.Position, string][] = [
			['fmt.P<>', new vscode.Position(19, 6), 'Print'],
		];
		for (const [name, position, wantFilterText] of testCases) {
			let list: vscode.CompletionList<vscode.CompletionItem>;
			// Query completion items. We expect the hard coded filter text hack
			// has been applied and gopls returns an incomplete list by default
			// to avoid reordering by vscode. But, if the query is made before
			// gopls is ready, we observed that gopls returns an empty result
			// as a complete result, and vscode returns a general completion list instead.
			// Retry a couple of times if we see a complete result as a workaround.
			// (github.com/golang/vscode-go/issues/363)
			for (let i = 0; i < 3; i++) {
				list = await vscode.commands.executeCommand(
					'vscode.executeCompletionItemProvider', uri, position) as vscode.CompletionList;
				if (list.isIncomplete) {
					break;
				}
				await sleep(100);
				console.log(`${new Date()}: retrying...`);
			}
			// Confirm that the hardcoded filter text hack has been applied.
			if (!list.isIncomplete) {
				assert.fail(`gopls should provide an incomplete list by default`);
			}

			// vscode.executeCompletionItemProvider will return results from all
			// registered completion item providers, not only gopls but also snippets.
			// Alternative is to directly query the language client, but that will
			// prevent us from detecting problems caused by issues between the language
			// client library and the vscode.
			for (const item of list.items) {
				if (item.kind === vscode.CompletionItemKind.Snippet) { continue; }  // gopls does not supply Snippet yet.
				assert.strictEqual(item.filterText ?? item.label, wantFilterText,
					`${uri}:${name} failed, unexpected filter text ` +
					`(got ${item.filterText ?? item.label}, want ${wantFilterText})\n` +
					`${JSON.stringify(item, null, 2)}`);
				if (item.kind === vscode.CompletionItemKind.Method || item.kind === vscode.CompletionItemKind.Function) {
					assert.ok(item.command, `${uri}:${name}: expected command associated with ${item.label}, found none`);
				}
			}
		}
	});
});
