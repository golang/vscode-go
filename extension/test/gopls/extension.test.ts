/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGoConfig } from '../../src/config';
import sinon = require('sinon');
import { getGoVersion, GoVersion } from '../../src/util';
import { GOPLS_MAYBE_PROMPT_FOR_TELEMETRY, recordTelemetryStartTime, TelemetryService } from '../../src/goTelemetry';
import { MockMemento } from '../mocks/MockMemento';
import { Env } from './goplsTestEnv.utils';

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('Go Extension Tests With Gopls', function () {
	this.timeout(300000);
	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata');
	const env = new Env();
	const sandbox = sinon.createSandbox();
	let goVersion: GoVersion;

	suiteSetup(async () => {
		goVersion = await getGoVersion();
	});

	this.afterEach(async function () {
		await env.teardown();
		// Note: this shouldn't use () => {...}. Arrow functions do not have 'this'.
		// I don't know why but this.currentTest.state does not have the expected value when
		// used with teardown.
		env.flushTrace(this.currentTest?.state === 'failed');
		sandbox.restore();
	});

	test('HoverProvider', async () => {
		const workspaceDir = path.resolve(testdataDir, 'gogetdocTestData');
		await env.startGopls(path.join(workspaceDir, 'test.go'), undefined, workspaceDir);
		const { uri } = await env.openDoc(testdataDir, 'gogetdocTestData', 'test.go');
		const testCases: [string, vscode.Position, string | null, string | null][] = [
			// [new vscode.Position(3,3), '/usr/local/go/src/fmt'],
			['keyword', new vscode.Position(0, 3), null, null], // keyword
			['inside a string', new vscode.Position(23, 14), null, null], // inside a string
			['just a }', new vscode.Position(20, 0), null, null], // just a }
			['inside a number', new vscode.Position(28, 16), null, null], // inside a number
			['func main()', new vscode.Position(22, 5), 'func main()', null],
			['import "math"', new vscode.Position(40, 23), 'package math', '`math` on'],
			[
				'func Println()',
				new vscode.Position(19, 6),
				goVersion.lt('1.18')
					? 'func fmt.Println(a ...interface{}) (n int, err error)'
					: 'func fmt.Println(a ...any) (n int, err error)',
				'Println formats '
			],
			['func print()', new vscode.Position(23, 4), 'func print(txt string)', 'This is an unexported function ']
		];

		const promises = testCases.map(async ([name, position, expectedSignature, expectedDoc]) => {
			const hovers = (await vscode.commands.executeCommand(
				'vscode.executeHoverProvider',
				uri,
				position
			)) as vscode.Hover[];

			if (expectedSignature === null && expectedDoc === null) {
				assert.equal(hovers.length, 0, `check hovers over ${name} failed: unexpected non-empty hover message.`);
				return;
			}

			const hover = hovers[0];
			assert.equal(
				hover.contents.length,
				1,
				`check hovers over ${name} failed: unexpected number of hover messages.`
			);
			const gotMessage = (<vscode.MarkdownString>hover.contents[0]).value;
			assert.ok(
				gotMessage.includes('```go\n' + expectedSignature + '\n```') &&
					(!expectedDoc || gotMessage.includes(expectedDoc)),
				`check hovers over ${name} failed: got ${gotMessage}`
			);
		});
		return Promise.all(promises);
	});

	test('Completion middleware', async () => {
		const workspaceDir = path.resolve(testdataDir, 'gogetdocTestData');
		await env.startGopls(path.join(workspaceDir, 'test.go'), undefined, workspaceDir);
		const { uri } = await env.openDoc(testdataDir, 'gogetdocTestData', 'test.go');
		const testCases: [string, vscode.Position, string, vscode.CompletionItemKind][] = [
			['fmt.P<>', new vscode.Position(19, 6), 'Print', vscode.CompletionItemKind.Function],
			['xyz.H<>', new vscode.Position(41, 13), 'Hello', vscode.CompletionItemKind.Method]
		];

		for (const [name, position, wantFilterText, wantItemKind] of testCases) {
			let list: vscode.CompletionList<vscode.CompletionItem> | undefined;
			// Query completion items. We expect the hard coded filter text hack
			// has been applied and gopls returns an incomplete list by default
			// to avoid reordering by vscode. But, if the query is made before
			// gopls is ready, we observed that gopls returns an empty result
			// as a complete result, and vscode returns a general completion list instead.
			// Retry a couple of times if we see a complete result as a workaround.
			// (github.com/golang/vscode-go/issues/363)
			for (let i = 0; i < 3; i++) {
				list = (await vscode.commands.executeCommand(
					'vscode.executeCompletionItemProvider',
					uri,
					position
				)) as vscode.CompletionList;
				if (list.isIncomplete) {
					break;
				}
				await sleep(100);
				console.log(`${new Date()}: retrying...`);
			}
			// Confirm that the hardcoded filter text hack has been applied.
			if (!list || !list.isIncomplete) {
				assert.fail('gopls should provide an incomplete list by default');
			}

			// vscode.executeCompletionItemProvider will return results from all
			// registered completion item providers, not only gopls but also snippets.
			// Alternative is to directly query the language client, but that will
			// prevent us from detecting problems caused by issues between the language
			// client library and the vscode.
			let itemKindFound = false;
			for (const item of list.items) {
				if (item.kind === vscode.CompletionItemKind.Snippet) {
					continue;
				} // gopls does not supply Snippet yet.
				assert.strictEqual(
					item.filterText ?? item.label,
					wantFilterText,
					`${uri}:${name} failed, unexpected filter text ` +
						`(got ${item.filterText ?? item.label}, want ${wantFilterText})\n` +
						`${JSON.stringify(item, null, 2)}`
				);
				if (item.kind === wantItemKind) {
					itemKindFound = true;
				}
				if (
					item.kind === vscode.CompletionItemKind.Method ||
					item.kind === vscode.CompletionItemKind.Function
				) {
					assert.ok(
						item.command,
						`${uri}:${name}: expected command associated with ${item.label}, found none`
					);
				}
			}
			assert(itemKindFound, `failed to find expected item kind ${wantItemKind}: got ${JSON.stringify(list)}`);
		}
	});

	async function testCustomFormatter(goConfig: vscode.WorkspaceConfiguration, customFormatter: string) {
		const config = require('../../src/config');
		sandbox.stub(config, 'getGoConfig').returns(goConfig);
		const workspaceDir = path.resolve(testdataDir, 'gogetdocTestData');
		await env.startGopls(path.join(workspaceDir, 'test.go'), goConfig, workspaceDir);
		const { doc } = await env.openDoc(testdataDir, 'gogetdocTestData', 'format.go');
		await vscode.window.showTextDocument(doc);

		const formatFeature = env.languageClient?.getFeature('textDocument/formatting');
		const formatter = formatFeature?.getProvider(doc);
		const tokensrc = new vscode.CancellationTokenSource();
		try {
			const result = await formatter?.provideDocumentFormattingEdits(
				doc,
				{} as vscode.FormattingOptions,
				tokensrc.token
			);
			assert.fail(`formatter unexpectedly succeeded and returned a result: ${JSON.stringify(result)}`);
		} catch (e) {
			assert(`${e}`.includes(`errors when formatting with ${customFormatter}`), `${e}`);
		}
	}

	test('Nonexistent formatter', async () => {
		const customFormatter = 'nonexistent';
		const goConfig = Object.create(getGoConfig(), {
			formatTool: { value: customFormatter } // this should make the formatter fail.
		}) as vscode.WorkspaceConfiguration;

		await testCustomFormatter(goConfig, customFormatter);
	});

	test('Custom formatter', async () => {
		const customFormatter = 'coolCustomFormatter';
		const goConfig = Object.create(getGoConfig(), {
			formatTool: { value: 'custom' }, // this should make the formatter fail.
			alternateTools: { value: { customFormatter: customFormatter } } // this should make the formatter fail.
		}) as vscode.WorkspaceConfiguration;

		await testCustomFormatter(goConfig, customFormatter);
	});

	test('Prompt For telemetry', async () => {
		const workspaceDir = path.resolve(testdataDir, 'gogetdocTestData');
		await env.startGopls(path.join(workspaceDir, 'test.go'), undefined, workspaceDir);
		const memento = new MockMemento();
		recordTelemetryStartTime(memento, new Date('2000-01-01'));
		const sut = new TelemetryService(env.languageClient, memento, [GOPLS_MAYBE_PROMPT_FOR_TELEMETRY]);
		try {
			await Promise.all([
				// we want to see the prompt command flowing.
				env.onMessageInTrace(GOPLS_MAYBE_PROMPT_FOR_TELEMETRY, 60_000),
				sut.promptForTelemetry(true /* vscode telemetry not disabled */)
			]);
		} catch (e) {
			assert(false, `unexpected failure: ${e}`);
		}
	});
});
