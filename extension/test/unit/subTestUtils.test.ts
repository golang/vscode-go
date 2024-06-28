/*---------------------------------------------------------
 * Copyright 2022 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import { escapeSubTestName } from '../../src/subTestUtils';

suite('escapeSubTestName Tests', () => {
	test('correctly escapes sub tests', () => {
		const tt = [
			{
				test: 'TestFunction',
				subtest: 'GET /path/with/slashes',
				want: 'TestFunction$/^GET_$/^path$/^with$/^slashes'
			},
			{
				test: 'TestMain',
				subtest: 'All{0,1} tests [run]+ (fine)',
				want: 'TestMain$/^All\\{0,1\\}_tests_\\[run\\]\\+_\\(fine\\)'
			},
			{
				test: 'TestMain',
				subtest: 'Foo|Bar+',
				want: 'TestMain$/^Foo\\|Bar\\+'
			}
		];

		for (const tc of tt) {
			const got = escapeSubTestName(tc.test, tc.subtest);
			assert.strictEqual(got, tc.want);
		}
	});
});
