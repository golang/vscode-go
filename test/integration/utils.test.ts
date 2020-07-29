/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import { GoVersion, guessPackageNameFromFile, substituteEnv } from '../../src/util';

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
		const testCases: [string|undefined, string, string, boolean][] = [
			[
				'go version devel +a295d59d Fri Jun 26 19:00:25 2020 +0000 darwin/amd64',
				'devel +a295d59d',
				'devel +a295d59d',
				true,
			],
			[
				'go version go1.14 darwin/amd64',
				'1.14.0',
				'1.14',
				true,
			],
			[
				'go version go1.14.1 linux/amd64',
				'1.14.1',
				'1.14.1',
				true,
			],
			[
				'go version go1.15rc1 darwin/amd64',
				'1.15.0',
				'1.15rc1',
				true,
			],
			[
				'go version go1.15.1rc2 windows/amd64',
				'1.15.1',
				'1.15.1rc2',
				true,
			],
			[
				'go version go1.15.3-beta.1 darwin/amd64',
				'1.15.3',
				'1.15.3-beta.1',
				true,
			],
			[
				'go version go1.15.3-beta.1.2.3 foobar/amd64',
				'1.15.3',
				'1.15.3-beta.1.2.3',
				true,
			],
			[
				'go version go10.0.1 js/amd64',
				'unknown',
				'unknown',
				false,
			],
			[
				undefined,
				'unknown',
				'unknown',
				false,
			],
			[
				'something wrong',
				'unknown',
				'unknown',
				false,
			]
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
