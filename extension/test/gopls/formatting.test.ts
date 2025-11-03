/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

/* eslint-disable node/no-unpublished-import */

// vscode.WorkspaceConfiguration.get() returns any type. So MockWorkspaceConfiguration
// need to take a input of a Map containing any type.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getGoConfig } from '../../src/config';
import { MockWorkspaceConfiguration } from '../integration/mocks/configuration';
import { Env } from './goplsTestEnv.utils';

suite('Go Extension Formatter Tests', function () {
	this.timeout(300000);
	const env = new Env();
	const sandbox = sinon.createSandbox();

	// The source of the test repo under testdata/formatTest.
	const repoSource: string = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'formatTest');

	// A fixed dir containing the formatter that will be used in this test.
	const toolPath: string = fs.mkdtempSync(path.join(os.tmpdir(), 'formatters'));

	this.afterEach(async () => {
		await env.teardown();
		sandbox.restore();
	});

	interface formatterTestCase {
		name: string;

		// go config setting values.
		config: Map<string, any>;

		formatter?: string; // format tool name
		formatterScript?: string | undefined; // format tool script

		want: string;
	}

	const testCases: formatterTestCase[] = [
		// Custom formatter.
		{
			name: 'run custom formatter',
			config: new Map<string, any>([
				['formatTool', 'custom'],
				[
					'alternateTools',
					{
						customFormatter: path.join(toolPath, 'custom')
					}
				]
			]),
			formatter: 'custom',
			formatterScript: '#!/bin/bash\necho "formatted by custom"',
			want: 'formatted by custom\n'
		},
		// Known formatters with path provided in setting "go.alternateTools".
		// If path is specified, vscode-go should use the binary specified in
		// the path. See golang/vscode-go#3861.
		{
			name: 'run gofmt formatter with provided path',
			config: new Map<string, any>([
				['formatTool', 'gofmt'],
				[
					'alternateTools',
					{
						gofmt: path.join(toolPath, 'gofmt')
					}
				]
			]),
			formatter: 'gofmt',
			formatterScript: '#!/bin/bash\necho "formatted by gofmt"',
			want: 'formatted by gofmt\n'
		},
		{
			name: 'run gofumpt formatter with provided path',
			config: new Map<string, any>([
				['formatTool', 'gofumpt'],
				[
					'alternateTools',
					{
						gofumpt: path.join(toolPath, 'gofumpt')
					}
				]
			]),
			formatter: 'gofumpt',
			formatterScript: '#!/bin/bash\necho "formatted by gofumpt"',
			want: 'formatted by gofumpt\n'
		},
		// Formatter unset. The gopls will handle format.
		{
			name: 'run gopls lsp method textDocument.formatting',
			config: new Map<string, any>(),
			want: `package main

import "fmt"

func main() {
	fmt.Println("hello")
}
`
		},
		// Non exisitent formatter.
		{
			name: 'non exisitent formatter',
			config: new Map<string, any>([['formatTool', 'nonexistent']]),
			// Formatter will throw error and file will be unchanged.
			want: `package main
import "fmt"

func  main ( ) {
fmt.Println("hello")
}
`
		},
		// Non exisitent custom formatter.
		{
			name: 'non exisitent custom formatter',
			config: new Map<string, any>([
				['formatTool', 'custom'],
				[
					'alternateTools',
					{
						customFormatter: 'coolCustomFormatter'
					}
				]
			]),
			// Formatter will throw error and file will be unchanged.
			want: `package main
import "fmt"

func  main ( ) {
fmt.Println("hello")
}
`
		}
		// TODO(hxjiang): add a test that actually put the mock formatter in
		// GOPATH/bin. e.g. testing settings {"go.formatTool": "gofmt"}.
	];

	testCases.forEach((tc) => {
		test(tc.name, async () => {
			const goConfig = new MockWorkspaceConfiguration(getGoConfig(), tc.config);

			const config = require('../../src/config');
			sandbox.stub(config, 'getGoConfig').returns(goConfig);

			// Disable path resolver's cache.
			const util = require('../../src/util');
			sandbox.stub(util, 'getBinPath').callsFake((...args: any[]) => {
				const [tool] = args;
				return util.getBinPathWithExplanation(tool, false).binPath;
			});

			// Create formatter script under tool dir and make it executable.
			if (tc.formatter && tc.formatterScript) {
				fs.writeFileSync(path.join(toolPath, tc.formatter), tc.formatterScript);
				fs.chmodSync(path.join(toolPath, tc.formatter), '755');
			}

			const goFilePath = path.join(repoSource, 'unformatted.go');

			await env.startGopls(goFilePath, goConfig, repoSource);
			const { doc } = await env.openDoc(goFilePath);
			await vscode.window.showTextDocument(doc);

			// Execute format document provider to generate the format edits.
			// Note: `executeCommand` for formatting traps errors from the
			// provider. If the provider fails, this command returns `undefined`
			// instead of re-throwing the error. We verify failure by checking
			// for end result, as no edits will be applied.
			const edits: vscode.TextEdit[] = await vscode.commands.executeCommand(
				'vscode.executeFormatDocumentProvider',
				doc.uri,
				{} // options
			);

			// Apply edits to the open file.
			const workspaceEdit = new vscode.WorkspaceEdit();
			workspaceEdit.set(doc.uri, edits);
			await vscode.workspace.applyEdit(workspaceEdit);

			// Read the edits from the open file. Once edits applied, the file
			// is not saved. We need to read the content through the vscode api.
			// filesystem read will not provide us the file with edits.
			const got = doc.getText();
			assert.strictEqual(
				got,
				tc.want,
				'The document content in the editor should match the output of the formatter'
			);
		});
	});
});
