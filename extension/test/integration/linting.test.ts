/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getGoConfig } from '../../src/config';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { goLint } from '../../src/goLint';
import { handleDiagnosticErrors } from '../../src/util';
import os = require('os');
import { MockWorkspaceConfiguration } from './mocks/configuration';

suite('Linting', function () {
	this.timeout(20000);

	// suiteSetup will initialize the following vars.
	let repoPath: string;
	let fixturePath: string;
	let fixtureSourcePath: string;

	suiteSetup(async () => {
		await updateGoVarsFromConfig({});

		repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'lintertest'));
		fixturePath = path.join(repoPath, 'testfixture');
		fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata');

		fs.removeSync(repoPath);
		fs.copySync(fixtureSourcePath, fixturePath, {
			recursive: true
		});
	});

	suiteTeardown(() => {
		fs.removeSync(repoPath);
	});

	test('Linting - concurrent process cancelation', async () => {
		const util = require('../../src/util');
		const processutil = require('../../src/utils/processUtils');
		const runToolSpy = sinon.spy(util, 'runTool');
		const killProcessTreeSpy = sinon.spy(processutil, 'killProcessTree');

		try {
			const config = new MockWorkspaceConfiguration(
				getGoConfig(),
				new Map<string, any>([
					['vetOnSave', 'package'],
					['vetFlags', ['-all']],
					['buildOnSave', 'package'],
					['lintOnSave', 'package'],
					// simulate a long running lint process by sleeping for a couple seconds
					['lintTool', process.platform !== 'win32' ? 'sleep' : 'timeout'],
					['lintFlags', process.platform !== 'win32' ? ['2'] : ['/t', '2']]
				])
			);

			await Promise.all([
				goLint(vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go')), config),
				goLint(vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_2.go')), config)
			]);

			assert.strictEqual(runToolSpy.callCount, 2, 'should have launched 2 lint jobs');
			assert.strictEqual(
				killProcessTreeSpy.callCount,
				1,
				'should have killed 1 lint job before launching the next'
			);
		} finally {
			runToolSpy.restore();
			killProcessTreeSpy.restore();
		}
	});

	test('Linting - lint errors with multiple open files', async () => {
		try {
			// handleDiagnosticErrors may adjust the lint errors' ranges to make the error more visible.
			// This adjustment applies only to the text documents known to vscode. This test checks
			// the adjustment is made consistently across multiple open text documents.
			const file1 = await vscode.workspace.openTextDocument(
				vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go'))
			);
			const file2 = await vscode.workspace.openTextDocument(
				vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_2.go'))
			);
			console.log('start linting');

			const config = new MockWorkspaceConfiguration(
				getGoConfig(),
				new Map<string, any>([
					['lintTool', 'staticcheck'],
					['lintFlags', ['-checks', 'all,-ST1000,-ST1016']]
					// staticcheck skips debatable checks such as ST1003 by default,
					// but this test depends on ST1003 (MixedCaps package name)
					// presented in both files in the same package. So, enable that.
				])
			);
			const warnings = await goLint(file2.uri, config, 'package');

			const diagnosticCollection = vscode.languages.createDiagnosticCollection('linttest');
			handleDiagnosticErrors({}, file2, warnings, diagnosticCollection);

			// The first diagnostic message for each file should be about the use of MixedCaps in package name.
			// Both files belong to the same package name, and we want them to be identical.
			const file1Diagnostics = diagnosticCollection.get(file1.uri);
			const file2Diagnostics = diagnosticCollection.get(file2.uri);
			assert(file1Diagnostics);
			assert(file2Diagnostics);
			assert(file1Diagnostics.length > 0);
			assert(file2Diagnostics.length > 0);
			assert.deepStrictEqual(file1Diagnostics[0], file2Diagnostics[0]);
		} catch (e) {
			assert.fail(`failed to lint: ${e}`);
		}
	});

	test('Linting - skip linting if lintTool is unset', async () => {
		const file = await vscode.workspace.openTextDocument(
			vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go'))
		);
		const warnings = await goLint(
			file.uri,
			new MockWorkspaceConfiguration(
				getGoConfig(),
				new Map<string, any>([['useLanguageServer', true]])
			)
		);

		assert(warnings.length === 0);
	});
});
