/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { GoVersion, guessPackageNameFromFile, removeDuplicateDiagnostics, substituteEnv } from '../../src/util';
import path = require('path');

suite('utils Tests', () => {
	test('substituteEnv: default', () => {
		// prepare test
		const env = Object.assign({}, process.env);
		process.env['test1'] = 'abcd';
		process.env['test2'] = 'defg';

		const actual = substituteEnv(' ${env:test1} \r\n ${env:test2}\r\n${env:test1}');
		const expected = ' abcd \r\n defg\r\nabcd';

		assert.equal(actual, expected);

		// test completed
		process.env = env;
	});

	test('build GoVersion', () => {
		// [input, wantFormat, wantFormatIncludePrerelease, wantIsValid]
		const testCases: [string | undefined, string, string, boolean][] = [
			[
				'go version devel go1.17-756fd56bbf Thu Apr 29 01:15:34 2021 +0000 darwin/amd64',
				'devel 1.17-756fd56bbf',
				'devel 1.17-756fd56bbf',
				true
			],
			['go version go1.14 darwin/amd64', '1.14.0', '1.14', true],
			['go version go1.14.1 linux/amd64', '1.14.1', '1.14.1', true],
			['go version go1.15rc1 darwin/amd64', '1.15.0', '1.15rc1', true],
			['go version go1.15.1rc2 windows/amd64', '1.15.1', '1.15.1rc2', true],
			['go version go1.15.3-beta.1 darwin/amd64', '1.15.3', '1.15.3-beta.1', true],
			['go version go1.15.3-beta.1.2.3 foobar/amd64', '1.15.3', '1.15.3-beta.1.2.3', true],
			['go version go10.0.1 js/amd64', 'unknown', 'unknown', false],
			[undefined, 'unknown', 'unknown', false],
			['something wrong', 'unknown', 'unknown', false]
		];
		for (const [input, wantFormat, wantFormatIncludePrerelease, wantIsValid] of testCases) {
			const go = new GoVersion('/path/to/go', input);

			assert.equal(go.isValid(), wantIsValid, `GoVersion(${input}) = ${JSON.stringify(go)}`);
			assert.equal(go.format(), wantFormat, `GoVersion(${input}) = ${JSON.stringify(go)}`);
			assert.equal(go.format(true), wantFormatIncludePrerelease, `GoVersion(${input}) = ${JSON.stringify(go)}`);
		}
	});
});

suite('GuessPackageNameFromFile Tests', () => {
	test('package name from main file', (done) => {
		const expectedPackageName = 'main';
		const filename = 'main.go';

		guessPackageNameFromFile(filename)
			.then((result) => {
				assert.equal(result, expectedPackageName);
			})
			.then(() => done(), done);
	});

	test('package name from dirpath', (done) => {
		const expectedPackageName = 'package';
		const fileDir = 'path/package/file.go';

		guessPackageNameFromFile(fileDir)
			.then(([result]) => {
				assert.equal(result, expectedPackageName);
			})
			.then(() => done(), done);
	});

	test('package name from test file', (done) => {
		const expectedPackageName = 'file';
		const expectedPackageTestName = 'file_test';
		const fileDir = 'file_test.go';

		guessPackageNameFromFile(fileDir)
			.then(([packageNameResult, packageTestNameResult]) => {
				assert.equal(packageNameResult, expectedPackageName);
				assert.equal(packageTestNameResult, expectedPackageTestName);
			})
			.then(() => done(), done);
	});
});

suite('Duplicate Diagnostics Tests', () => {
	test('remove duplicate diagnostics', async () => {
		const fixturePath = path.join(__dirname, '..', '..', '..', 'test', 'testdata');
		const uri1 = vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_1.go'));
		const uri2 = vscode.Uri.file(path.join(fixturePath, 'linterTest', 'linter_2.go'));

		const diagnosticCollection = vscode.languages.createDiagnosticCollection('linttest');

		// Populate the diagnostic collection
		const diag1 = [
			new vscode.Diagnostic(
				new vscode.Range(1, 2, 1, 3),
				'first line diagnostic',
				vscode.DiagnosticSeverity.Warning
			),
			new vscode.Diagnostic(
				new vscode.Range(2, 0, 2, 3),
				'second line diagnostic',
				vscode.DiagnosticSeverity.Warning
			),
			new vscode.Diagnostic(new vscode.Range(2, 3, 2, 5), 'second line error', vscode.DiagnosticSeverity.Error),
			new vscode.Diagnostic(
				new vscode.Range(4, 0, 4, 3),
				'fourth line diagnostic',
				vscode.DiagnosticSeverity.Warning
			)
		];
		const diag2 = [
			new vscode.Diagnostic(
				new vscode.Range(1, 2, 1, 3),
				'first line diagnostic',
				vscode.DiagnosticSeverity.Warning
			),
			new vscode.Diagnostic(
				new vscode.Range(2, 0, 2, 3),
				'second line diagnostic',
				vscode.DiagnosticSeverity.Warning
			),
			new vscode.Diagnostic(new vscode.Range(2, 3, 2, 5), 'second line error', vscode.DiagnosticSeverity.Error),
			new vscode.Diagnostic(
				new vscode.Range(4, 0, 4, 3),
				'fourth line diagnostic',
				vscode.DiagnosticSeverity.Warning
			)
		];
		diagnosticCollection.set(uri1, diag1);
		diagnosticCollection.set(uri2, diag2);

		// After removing diagnostics from uri1, there should only be one diagnostic remaining, and
		// the diagnostics for uri2 should not be changed.
		const want1 = [diag1[3]];
		const want2: vscode.Diagnostic[] = [];
		diag2.forEach((diag) => {
			want2.push(diag);
		});

		const newDiagnostics: vscode.Diagnostic[] = [
			new vscode.Diagnostic(
				new vscode.Range(1, 2, 1, 3),
				'first line diagnostic',
				vscode.DiagnosticSeverity.Warning
			),
			new vscode.Diagnostic(new vscode.Range(2, 3, 2, 5), 'second line error', vscode.DiagnosticSeverity.Error)
		];

		removeDuplicateDiagnostics(diagnosticCollection, uri1, newDiagnostics);

		assert.strictEqual(diagnosticCollection.get(uri1).length, want1.length);
		for (let i = 0; i < want1.length; i++) {
			assert.strictEqual(diagnosticCollection.get(uri1)[i], want1[i]);
		}

		assert.strictEqual(diagnosticCollection.get(uri2).length, want2.length);
		for (let i = 0; i < want2.length; i++) {
			assert.strictEqual(diagnosticCollection.get(uri2)[i], want2[i]);
		}
	});
});
