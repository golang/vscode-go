/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import fs = require('fs-extra');
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import vscode = require('vscode');
import { computeTestCommand, getTestFlags, goTest } from '../../src/testUtils';
import { getGoConfig, rmdirRecursive } from '../../src/util';

suite('Test Go Test Args', () => {
	function runTest(param: {
		expectedArgs: string,
		expectedOutArgs: string,
		flags?: string[],
		functions?: string[],
		isBenchmark?: boolean
		}) {

		const {args, outArgs} = computeTestCommand({
			dir: '',
			goConfig: getGoConfig(),
			flags: param.flags || [],
			functions: param.functions || [],
			isBenchmark: param.isBenchmark || false,
			applyCodeCoverage: false,
		}, ['./...']);

		assert.strictEqual(args.join(' '), param.expectedArgs, 'actual command');
		assert.strictEqual(outArgs.join(' '), param.expectedOutArgs, 'displayed command');
	}

	test('default config', () => {
		runTest({
			expectedArgs: 'test -timeout 30s ./...',
			expectedOutArgs: 'test -timeout 30s ./...'
		});
	});
	test('user flag [-v] enables -json flag', () => {
		runTest({
			expectedArgs: 'test -timeout 30s -json ./... -v',
			expectedOutArgs: 'test -timeout 30s ./... -v',
			flags: ['-v']
		});
	});
	test('user flag [-json -v] prevents -json flag addition', () => {
		runTest({
			expectedArgs: 'test -timeout 30s ./... -json -v',
			expectedOutArgs: 'test -timeout 30s ./... -json -v',
			flags: ['-json', '-v']
		});
	});
	test('user flag [-args] does not crash', () => {
		runTest({
			expectedArgs: 'test -timeout 30s ./... -args',
			expectedOutArgs: 'test -timeout 30s ./... -args',
			flags: ['-args']
		});
	});
	test('user flag [-args -v] does not enable -json flag', () => {
		runTest({
			expectedArgs: 'test -timeout 30s ./... -args -v',
			expectedOutArgs: 'test -timeout 30s ./... -args -v',
			flags: ['-args', '-v']
		});
	});
	test('specifying functions adds -run flags', () => {
		runTest({
			expectedArgs: 'test -timeout 30s -run ^(TestA|TestB)$ ./...',
			expectedOutArgs: 'test -timeout 30s -run ^(TestA|TestB)$ ./...',
			functions: ['TestA', 'TestB']
		});
	});
	test('functions & benchmark adds -bench flags and skips timeout', () => {
		runTest({
			expectedArgs: 'test -benchmem -run=^$ -bench ^(TestA|TestB)$ ./...',
			expectedOutArgs: 'test -benchmem -run=^$ -bench ^(TestA|TestB)$ ./...',
			functions: ['TestA', 'TestB'],
			isBenchmark: true,
		});
	});
	test('user -run flag is ignored when functions are provided', () => {
		runTest({
			expectedArgs: 'test -timeout 30s -run ^(TestA|TestB)$ ./...',
			expectedOutArgs: 'test -timeout 30s -run ^(TestA|TestB)$ ./...',
			functions: ['TestA', 'TestB'],
			flags: ['-run', 'TestC']
		});
	});
});

suite('Test Go Test', function () {
	this.timeout(10000);

	const sourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata', 'goTestTest');

	let tmpGopath: string;
	let repoPath: string;

	let previousEnv: any;

	setup(() => {
		previousEnv = Object.assign({}, process.env);
	});

	teardown(async () => {
		process.env = previousEnv;
		rmdirRecursive(tmpGopath);
	});

	function setupRepo(modulesMode: boolean) {
		tmpGopath = fs.mkdtempSync(path.join(os.tmpdir(), 'go-test-test'));
		fs.mkdirSync(path.join(tmpGopath, 'src'));
		repoPath = path.join(tmpGopath, 'src', 'goTestTest');
		fs.copySync(sourcePath, repoPath, {
			recursive: true,
			filter: (src: string): boolean => {
				if (modulesMode) {
					return true;
				}
				return path.basename(src) !== 'go.mod';  // skip go.mod file.
			},
		});
		process.env.GOPATH = tmpGopath;
	}

	async function runTest(
		input: { isMod: boolean, includeSubDirectories: boolean, testFlags?: string[], applyCodeCoverage?: boolean },
		wantFiles: string[]) {

		fs.copySync(sourcePath, repoPath, { recursive: true });

		const config = Object.create(vscode.workspace.getConfiguration('go'));
		const outputChannel = new FakeOutputChannel();

		const testConfig = {
			goConfig: config,
			outputChannel,
			dir: repoPath,
			flags: input.testFlags ? input.testFlags : getTestFlags(config),
			isMod: input.isMod,
			includeSubDirectories: input.includeSubDirectories,
			applyCodeCoverage: input.applyCodeCoverage
		};
		try {
			// TODO: instead of calling goTest, consider to test
			// testCurrentPackage, testCurrentWorkspace, testCurrentFile
			// which are closer to the features exposed to users.
			const result = await goTest(testConfig);
			assert.equal(result, false);  // we expect tests to fail.
		} catch (e) {
			console.log('exception: ${e}');
		}

		const testOutput = outputChannel.toString();
		for (const want of wantFiles) {
			assert.ok(testOutput.includes(want), `\nFully resolved file path "${want}" not found in \n${testOutput}`);
		}
	}

	test('resolves file names in logs (modules)', async () => {
		setupRepo(true);
		await runTest(
			{ isMod: true, includeSubDirectories: true },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: false },
			[path.join(repoPath, 'a_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: true, testFlags: ['-v'] },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: true, testFlags: ['-race'], applyCodeCoverage: true },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: false, testFlags: ['-v'] },
			[path.join(repoPath, 'a_test.go')]);
	});

	test('resolves file names in logs (GOPATH)', async () => {
		setupRepo(true);
		await runTest(
			{ isMod: true, includeSubDirectories: true },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: false },
			[path.join(repoPath, 'a_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: true, testFlags: ['-v'] },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: true, testFlags: ['-race'], applyCodeCoverage: true },
			[path.join(repoPath, 'a_test.go'), path.join(repoPath, 'b', 'b_test.go')]);
		await runTest(
			{ isMod: true, includeSubDirectories: false, testFlags: ['-v'] },
			[path.join(repoPath, 'a_test.go')]);
	});
});

// FakeOutputChannel is a fake output channel used to buffer
// the output of the tested language client in an in-memory
// string array until cleared.
class FakeOutputChannel implements vscode.OutputChannel {
	public name = 'FakeOutputChannel';
	public show = sinon.fake(); // no-empty
	public hide = sinon.fake(); // no-empty
	public dispose = sinon.fake();  // no-empty

	private buf = [] as string[];

	public append = (v: string) => this.enqueue(v);
	public appendLine = (v: string) => this.enqueue(v);
	public clear = () => { this.buf = []; };
	public toString = () => {
		return this.buf.join('\n');
	}

	private enqueue = (v: string) => {
		if (this.buf.length > 1024) { this.buf.shift(); }
		this.buf.push(v.trim());
	}
}
