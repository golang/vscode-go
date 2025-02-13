/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import assert from 'assert';
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { GoRunTestCodeLensProvider } from '../../src/goRunTestCodelens';
import { subTestAtCursor, testAtCursor } from '../../src/goTest';
import { MockExtensionContext } from '../mocks/MockContext';
import { Env } from './goplsTestEnv.utils';
import * as testUtils from '../../src/testUtils';

suite('Code lenses for testing and benchmarking', function () {
	this.timeout(20000);

	let document: vscode.TextDocument;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const ctx = new MockExtensionContext() as any;
	const cancellationTokenSource = new vscode.CancellationTokenSource();

	const projectDir = path.join(__dirname, '..', '..', '..');
	const testdataDir = path.join(projectDir, 'test', 'testdata', 'codelens');
	const env = new Env();

	this.afterEach(function () {
		// Note: this shouldn't use () => {...}. Arrow functions do not have 'this'.
		// I don't know why but this.currentTest.state does not have the expected value when
		// used with teardown.
		env.flushTrace(this.currentTest?.state === 'failed');
		sinon.restore();
	});

	// updaetGoVarsFromConfig mutates env vars. Cache the value
	// so we can restore it in suiteTeardown.
	const prevEnv = Object.assign({}, process.env);

	suiteSetup(async () => {
		await updateGoVarsFromConfig({});

		const uri = vscode.Uri.file(path.join(testdataDir, 'codelens_test.go'));
		await env.startGopls(uri.fsPath);
		document = await vscode.workspace.openTextDocument(uri);
	});

	suiteTeardown(async () => {
		await env.teardown();
		process.env = prevEnv;
	});

	test('Subtests - runs a test with cursor on t.Run line', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(7, 4, 7, 4);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, true);
	});

	test('Subtests - runs a test with cursor within t.Run function', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(8, 4, 8, 4);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, true);
	});

	test('Subtests - returns false for a failing test', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(11, 4, 11, 4);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, false);
	});

	test('Subtests - does nothing for a dynamically defined subtest', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(17, 4, 17, 4);
		sinon.stub(vscode.window, 'showInputBox').onFirstCall().resolves(undefined);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, undefined);
	});

	test('Subtests - runs a test with curson on t.Run line and dynamic test name is passed in input box', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(17, 4, 17, 4);
		sinon.stub(vscode.window, 'showInputBox').onFirstCall().resolves('dynamic test name');
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, false);
	});

	test('Subtests - does nothing when cursor outside of a test function', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(5, 0, 5, 0);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)([]);
		assert.equal(result, undefined);
	});

	test('Subtests - does nothing when no test function covers the cursor and a function name is passed in', async () => {
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(5, 0, 5, 0);
		const result = await subTestAtCursor('test')(ctx, env.goCtx)({ functionName: 'TestMyFunction' });
		assert.equal(result, undefined);
	});

	test('Test codelenses', async () => {
		const codeLensProvider = new GoRunTestCodeLensProvider(env.goCtx);
		const codeLenses = await codeLensProvider.provideCodeLenses(document, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 8);
		const wantCommands = [
			'go.test.package',
			'go.test.file',
			'go.test.cursor',
			'go.debug.cursor',
			'go.subtest.cursor',
			'go.debug.subtest.cursor',
			'go.subtest.cursor',
			'go.debug.subtest.cursor'
		];
		for (let i = 0; i < codeLenses.length; i++) {
			assert.equal(codeLenses[i].command?.command, wantCommands[i]);
		}
	});

	test('Benchmark codelenses', async () => {
		const codeLensProvider = new GoRunTestCodeLensProvider(env.goCtx);
		const uri = vscode.Uri.file(path.join(testdataDir, 'codelens_benchmark_test.go'));
		const benchmarkDocument = await vscode.workspace.openTextDocument(uri);
		const codeLenses = await codeLensProvider.provideCodeLenses(benchmarkDocument, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 6);
		const wantCommands = [
			'go.test.package',
			'go.test.file',
			'go.benchmark.package',
			'go.benchmark.file',
			'go.benchmark.cursor',
			'go.debug.cursor'
		];
		for (let i = 0; i < codeLenses.length; i++) {
			assert.equal(codeLenses[i].command?.command, wantCommands[i]);
		}
	});

	test('Test codelenses include only valid test function names', async () => {
		const codeLensProvider = new GoRunTestCodeLensProvider(env.goCtx);
		const uri = vscode.Uri.file(path.join(testdataDir, 'testnames', 'testnames_test.go'));
		const benchmarkDocument = await vscode.workspace.openTextDocument(uri);
		const codeLenses = await codeLensProvider.provideCodeLenses(benchmarkDocument, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 20, JSON.stringify(codeLenses, null, 2));
		const found = [] as string[];
		for (let i = 0; i < codeLenses.length; i++) {
			const lens = codeLenses[i];
			if (lens.command?.command === 'go.test.cursor') {
				found.push(lens.command.arguments?.[0].functionName);
			}
		}
		found.sort();
		// Results should match `go test -list`.
		assert.deepStrictEqual(found, [
			'Example',
			'ExampleFunction',
			'Test',
			'Test1Function',
			'TestFunction',
			'TestMain',
			'Test_foobar',
			'TestΣυνάρτηση',
			'Test함수'
		]);
	});

	test('Test codelenses include valid fuzz function names', async () => {
		const codeLensProvider = new GoRunTestCodeLensProvider(env.goCtx);
		const uri = vscode.Uri.file(path.join(testdataDir, 'codelens_go118_test.go'));
		const testDocument = await vscode.workspace.openTextDocument(uri);
		const codeLenses = await codeLensProvider.provideCodeLenses(testDocument, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 8, JSON.stringify(codeLenses, null, 2));
		const found = [] as string[];
		for (let i = 0; i < codeLenses.length; i++) {
			const lens = codeLenses[i];
			if (lens.command?.command === 'go.test.cursor') {
				found.push(lens.command.arguments?.[0].functionName);
			}
		}
		found.sort();
		// Results should match `go test -list`.
		assert.deepStrictEqual(found, ['Fuzz', 'FuzzFunc', 'TestGo118']);
	});

	test('Test codelenses skip TestMain', async () => {
		const codeLensProvider = new GoRunTestCodeLensProvider(env.goCtx);
		const uri = vscode.Uri.file(path.join(testdataDir, 'testmain/testmain_test.go'));
		const testDocument = await vscode.workspace.openTextDocument(uri);
		const codeLenses = await codeLensProvider.provideCodeLenses(testDocument, cancellationTokenSource.token);
		assert.equal(codeLenses.length, 4, JSON.stringify(codeLenses, null, 2));
		const found = [] as string[];
		for (let i = 0; i < codeLenses.length; i++) {
			const lens = codeLenses[i];
			if (lens.command?.command === 'go.test.cursor') {
				found.push(lens.command.arguments?.[0].functionName);
			}
		}
		found.sort();
		// Results should match `go test -list`.
		assert.deepStrictEqual(found, ['TestNotMain']);
	});

	test('Debug - debugs a test with cursor on t.Run line', async () => {
		const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').returns(Promise.resolve(true));

		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(7, 4, 7, 4);
		const result = await subTestAtCursor('debug')(ctx, env.goCtx)([]);
		assert.strictEqual(result, true);

		assert.strictEqual(startDebuggingStub.callCount, 1, 'expected one call to startDebugging');
		const gotConfig = startDebuggingStub.getCall(0).args[1] as vscode.DebugConfiguration;
		gotConfig.program = '';
		assert.deepStrictEqual<vscode.DebugConfiguration>(gotConfig, {
			name: 'Debug Test',
			type: 'go',
			request: 'launch',
			args: ['-test.run', '^TestSample$/^sample_test_passing$'],
			buildFlags: '',
			env: {},
			sessionID: undefined,
			mode: 'test',
			envFile: null,
			program: ''
		});
	});
});

suite('Code lenses with stretchr/testify/suite', function () {
	this.timeout(20000); // Gopls needs to load modules from the internet for this test.

	const ctx = MockExtensionContext.new();

	const testdataDir = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'stretchrTestSuite');
	const env = new Env();

	this.afterEach(function () {
		// Note: this shouldn't use () => {...}. Arrow functions do not have 'this'.
		// I don't know why but this.currentTest.state does not have the expected value when
		// used with teardown.
		env.flushTrace(this.currentTest?.state === 'failed');
		ctx.teardown();
		sinon.restore();
	});

	suiteSetup(async () => {
		await updateGoVarsFromConfig({});
		await env.startGopls(undefined, undefined, testdataDir);
	});

	suiteTeardown(async () => {
		await env.teardown();
	});

	test('Run test at cursor', async () => {
		const goTestStub = sinon.stub(testUtils, 'goTest').returns(Promise.resolve(true));

		const editor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(testdataDir, 'suite_test.go')));
		editor.selection = new vscode.Selection(25, 4, 25, 4);

		const result = await testAtCursor('test')(ctx, env.goCtx)([]);
		assert.strictEqual(result, true);

		assert.strictEqual(goTestStub.callCount, 1, 'expected one call to goTest');
		const gotConfig = goTestStub.getCall(0).args[0];
		assert.deepStrictEqual(gotConfig.functions, ['(*ExampleTestSuite).TestExample', 'TestExampleTestSuite']);
	});

	test('Run test at cursor in different file than test suite definition', async () => {
		const goTestStub = sinon.stub(testUtils, 'goTest').returns(Promise.resolve(true));

		const editor = await vscode.window.showTextDocument(
			vscode.Uri.file(path.join(testdataDir, 'another_suite_test.go'))
		);
		editor.selection = new vscode.Selection(3, 4, 3, 4);

		const result = await testAtCursor('test')(ctx, env.goCtx)([]);
		assert.strictEqual(result, true);

		assert.strictEqual(goTestStub.callCount, 1, 'expected one call to goTest');
		const gotConfig = goTestStub.getCall(0).args[0];
		assert.deepStrictEqual(gotConfig.functions, [
			'(*ExampleTestSuite).TestExampleInAnotherFile',
			'TestExampleTestSuite'
		]);
	});

	test('Debug test at cursor', async () => {
		const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').returns(Promise.resolve(true));

		const editor = await vscode.window.showTextDocument(vscode.Uri.file(path.join(testdataDir, 'suite_test.go')));
		editor.selection = new vscode.Selection(25, 4, 25, 4);

		const result = await testAtCursor('debug')(ctx, env.goCtx)([]);
		assert.strictEqual(result, true);

		assert.strictEqual(startDebuggingStub.callCount, 1, 'expected one call to startDebugging');
		const gotConfig = startDebuggingStub.getCall(0).args[1] as vscode.DebugConfiguration;
		gotConfig.program = '';
		assert.deepStrictEqual<vscode.DebugConfiguration>(gotConfig, {
			name: 'Debug Test',
			type: 'go',
			request: 'launch',
			args: ['-test.run', '^TestExampleTestSuite$/^TestExample$'],
			buildFlags: '',
			env: {},
			sessionID: undefined,
			mode: 'test',
			envFile: null,
			program: ''
		});
	});

	test('Debug test at cursor in different file than test suite definition', async () => {
		const startDebuggingStub = sinon.stub(vscode.debug, 'startDebugging').returns(Promise.resolve(true));

		const editor = await vscode.window.showTextDocument(
			vscode.Uri.file(path.join(testdataDir, 'another_suite_test.go'))
		);
		editor.selection = new vscode.Selection(3, 4, 3, 4);

		const result = await testAtCursor('debug')(ctx, env.goCtx)([]);
		assert.strictEqual(result, true);

		assert.strictEqual(startDebuggingStub.callCount, 1, 'expected one call to startDebugging');
		const gotConfig = startDebuggingStub.getCall(0).args[1] as vscode.DebugConfiguration;
		gotConfig.program = '';
		assert.deepStrictEqual<vscode.DebugConfiguration>(gotConfig, {
			name: 'Debug Test',
			type: 'go',
			request: 'launch',
			args: ['-test.run', '^TestExampleTestSuite$/^TestExampleInAnotherFile$'],
			buildFlags: '',
			env: {},
			sessionID: undefined,
			mode: 'test',
			envFile: null,
			program: ''
		});
	});
});
