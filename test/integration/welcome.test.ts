/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import * as assert from 'assert';
import { shouldShowGoWelcomePage } from '../../src/goMain';
import { extensionId } from '../../src/const';
import { WelcomePanel } from '../../src/welcome';

suite('WelcomePanel Tests', () => {
	// 0:showVersions, 1:newVersion, 2:oldVersion, 3:expected
	type testCase = [string[], string, string, boolean];
	const testCases: testCase[] = [
		[[], '0.22.0', '0.0.0', false],
		[[], '0.22.0', '0.21.0', false],
		[[], '0.22.0', '0.22.0-rc.1', false],
		[[], '0.22.0', '0.22.0', false],
		[[], '0.22.0', '0.23.0', false],

		[['0.22.0'], '0.22.0', '0.0.0', true],
		[['0.22.0'], '0.22.0', '0.21.0-rc.1', true],
		[['0.22.0'], '0.22.0', '0.21.0', true],
		[['0.22.0'], '0.22.0', '0.22.0-rc.1', true],
		[['0.22.0'], '0.22.0', '0.22.0', false],
		[['0.22.0'], '0.22.0', '0.22.1', false],
		[['0.22.0'], '0.22.0', '0.23.0', false],
		[['0.22.0'], '0.22.0', '1.0.0', false],
		[['0.22.0'], '0.22.0', '2021.1.100', false],

		[['0.22.0'], '0.22.0-rc.2', '0.0.0', true],
		[['0.22.0'], '0.22.0-rc.2', '0.21.0-rc.1', true],
		[['0.22.0'], '0.22.0-rc.2', '0.21.0', true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.1', true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.2', false],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.3', true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0', true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.1', false],
		[['0.22.0'], '0.22.0-rc.2', '0.23.0', false],
		[['0.22.0'], '0.22.0-rc.2', '1.0.0', false],
		[['0.22.0'], '0.22.0-rc.2', '2021.1.100', false],

		[['0.22.0'], '0.22.1', '0.0.0', false],
		[['0.22.0'], '0.22.1', '0.21.0-rc.1', false],
		[['0.22.0'], '0.22.1', '0.21.0', false],
		[['0.22.0'], '0.22.1', '0.22.0-rc.1', false],
		[['0.22.0'], '0.22.1', '0.22.0', false],
		[['0.22.0'], '0.22.1', '0.23.0', false],
		[['0.22.0'], '0.22.1', '1.0.0', false],
		[['0.22.0'], '0.22.1', '2021.1.100', false]
	];
	testCases.forEach((c: testCase) => {
		const [showVersions, newVersion, oldVersion, expected] = c;

		test(`shouldShowGoWelcomePage(${JSON.stringify(showVersions)}, ${newVersion}, ${oldVersion})`, () => {
			assert.strictEqual(shouldShowGoWelcomePage(showVersions, newVersion, oldVersion), expected);
		});
	});
});

suite('joinPath Tests', () => {
	test('WelcomePanel dataroot is set as expected', () => {
		const uri = vscode.extensions.getExtension(extensionId).extensionUri;
		WelcomePanel.createOrShow(uri);
		const got = WelcomePanel.currentPanel.dataroot;
		const want = vscode.Uri.joinPath(uri, 'media');
		assert.strictEqual(got.toString(), want.toString());
	});
});
