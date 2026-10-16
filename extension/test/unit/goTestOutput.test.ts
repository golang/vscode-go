/*---------------------------------------------------------
 * Copyright 2026 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import path = require('path');
import { processTestResultLineInJSONMode } from '../../src/goTestOutput';
import type { GoTestOutput } from '../../src/testUtils';

suite('processTestResultLineInJSONMode', () => {
	const cwd = path.resolve('/work/buildfail');
	const pkgMap = new Map([
		['example.com/buildfail', cwd],
		['example.com/buildfail/b', path.join(cwd, 'b')]
	]);

	function run(lines: string[], dir = cwd, consumer?: (e: GoTestOutput) => void): string[] {
		const got: string[] = [];
		const outputChannel = { appendLine: (v: string) => got.push(v) };
		const processLine = processTestResultLineInJSONMode(pkgMap, '', outputChannel, dir, consumer);
		lines.forEach((l) => processLine(l));
		return got;
	}

	// Output of `go test -json -v ./...` (go1.27, Time fields removed) run in a
	// module whose package b has a test file that does not compile.
	const buildFailure = [
		'{"ImportPath":"example.com/buildfail/b [example.com/buildfail/b.test]","Action":"build-output","Output":"# example.com/buildfail/b [example.com/buildfail/b.test]\\n"}',
		'{"ImportPath":"example.com/buildfail/b [example.com/buildfail/b.test]","Action":"build-output","Output":"b/b_test.go:6:14: cannot use \\"not an int\\" (untyped string constant) as int value in variable declaration\\n"}',
		'{"ImportPath":"example.com/buildfail/b [example.com/buildfail/b.test]","Action":"build-fail"}',
		'{"Action":"start","Package":"example.com/buildfail/b"}',
		'{"Action":"output","Package":"example.com/buildfail/b","Output":"FAIL\\texample.com/buildfail/b [build failed]\\n","OutputType":"frame"}',
		'{"Action":"fail","Package":"example.com/buildfail/b","Elapsed":0,"FailedBuild":"example.com/buildfail/b [example.com/buildfail/b.test]"}'
	];

	test('shows build errors with file names resolved against the cwd', () => {
		assert.deepStrictEqual(run(buildFailure), [
			'# example.com/buildfail/b [example.com/buildfail/b.test]',
			`${path.join(cwd, 'b', 'b_test.go')}:6:14: cannot use "not an int" (untyped string constant) as int value in variable declaration`,
			'FAIL\texample.com/buildfail/b [build failed]'
		]);
	});

	test('resolves build errors when go test runs in the package directory', () => {
		const dir = path.join(cwd, 'b');
		const got = run(
			[
				'{"ImportPath":"example.com/buildfail/b [example.com/buildfail/b.test]","Action":"build-output","Output":"./b_test.go:6:14: cannot use \\"not an int\\" (untyped string constant) as int value in variable declaration\\n"}'
			],
			dir
		);
		assert.deepStrictEqual(got, [
			`${path.join(dir, 'b_test.go')}:6:14: cannot use "not an int" (untyped string constant) as int value in variable declaration`
		]);
	});

	test('passes build events to the consumer', () => {
		const actions: string[] = [];
		run(buildFailure, cwd, (e) => actions.push(e.Action));
		assert.deepStrictEqual(actions, ['build-output', 'build-output', 'build-fail', 'start', 'output', 'fail']);
	});

	test('resolves test output against the package directory', () => {
		const got = run([
			'{"Action":"run","Package":"example.com/buildfail","Test":"TestA"}',
			'{"Action":"output","Package":"example.com/buildfail","Test":"TestA","Output":"=== RUN   TestA\\n","OutputType":"frame"}',
			'{"Action":"output","Package":"example.com/buildfail","Test":"TestA","Output":"    a_test.go:6: hello from TestA\\n"}',
			'{"Action":"pass","Package":"example.com/buildfail","Test":"TestA","Elapsed":0}'
		]);
		assert.deepStrictEqual(got, ['=== RUN   TestA', `    ${path.join(cwd, 'a_test.go')}:6: hello from TestA`]);
	});

	test('passes non-JSON lines through', () => {
		assert.deepStrictEqual(run(['# example.com/buildfail/b']), ['# example.com/buildfail/b']);
	});
});
