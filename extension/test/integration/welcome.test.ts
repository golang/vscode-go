/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import assert from 'assert';
import { shouldShowGoWelcomePage } from '../../src/welcome';
import { extensionId } from '../../src/const';
import { WelcomePanel } from '../../src/welcome';
import sinon = require('sinon');
import * as config from '../../src/config';
import { MockCfg } from '../mocks/MockCfg';

suite('WelcomePanel Tests', () => {
	let sandbox: sinon.SinonSandbox;
	setup(() => {
		sandbox = sinon.createSandbox();
	});
	teardown(() => sandbox.restore());

	// 0:showVersions, 1:newVersion, 2:oldVersion, 3: showWelcome, 4:expected
	//
	// If showWelcome is false, then expected has to be false.
	// Otherwise, expected is true if (and only if) newVersion occurs in showVersions
	// and is newer than oldVersion (as semantic versions).
	type testCase = [string[], string, string, boolean, boolean];
	const testCases: testCase[] = [
		[[], '0.22.0', '0.0.0', true, false],
		[[], '0.22.0', '0.21.0', true, false],
		[[], '0.22.0', '0.22.0-rc.1', true, false],
		[[], '0.22.0', '0.22.0', true, false],
		[[], '0.22.0', '0.23.0', true, false],

		[['0.22.0'], '0.22.0', '0.0.0', true, true],
		[['0.22.0'], '0.22.0', '0.0.0', false, false],
		[['0.22.0'], '0.22.0', '0.21.0-rc.1', true, true],
		[['0.22.0'], '0.22.0', '0.21.0', true, true],
		[['0.22.0'], '0.22.0', '0.22.0-rc.1', true, true],
		[['0.22.0'], '0.22.0', '0.22.0', true, false],
		[['0.22.0'], '0.22.0', '0.22.1', true, false],
		[['0.22.0'], '0.22.0', '0.23.0', true, false],
		[['0.22.0'], '0.22.0', '1.0.0', true, false],
		[['0.22.0'], '0.22.0', '2021.1.100', true, false],

		[['0.22.0'], '0.22.0-rc.2', '0.0.0', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.21.0-rc.1', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.21.0', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.1', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.2', true, false],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0-rc.3', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.0', true, true],
		[['0.22.0'], '0.22.0-rc.2', '0.22.1', true, false],
		[['0.22.0'], '0.22.0-rc.2', '0.23.0', true, false],
		[['0.22.0'], '0.22.0-rc.2', '1.0.0', true, false],
		[['0.22.0'], '0.22.0-rc.2', '2021.1.100', true, false],

		[['0.22.0'], '0.22.1', '0.0.0', true, false],
		[['0.22.0'], '0.22.1', '0.21.0-rc.1', true, false],
		[['0.22.0'], '0.22.1', '0.21.0', true, false],
		[['0.22.0'], '0.22.1', '0.22.0-rc.1', true, false],
		[['0.22.0'], '0.22.1', '0.22.0', true, false],
		[['0.22.0'], '0.22.1', '0.23.0', true, false],
		[['0.22.0'], '0.22.1', '1.0.0', true, false],
		[['0.22.0'], '0.22.1', '2021.1.100', true, false]
	];
	testCases.forEach((c: testCase) => {
		const [showVersions, newVersion, oldVersion, showWelcome, expected] = c;
		test(`shouldShowGoWelcomePage(${JSON.stringify(
			showVersions
		)}, ${newVersion}, ${oldVersion}, (showWelcome=${showWelcome}))`, () => {
			const goConfig = new MockCfg([]);
			sandbox.stub(config, 'getGoConfig').returns(goConfig);
			sinon.stub(goConfig, 'get').withArgs('showWelcome').returns(showWelcome);
			assert.strictEqual(shouldShowGoWelcomePage(showVersions, newVersion, oldVersion), expected);
		});
	});
});

suite('joinPath Tests', () => {
	test('WelcomePanel dataroot is set as expected', () => {
		const uri = vscode.extensions.getExtension(extensionId)?.extensionUri;
		assert(uri);
		WelcomePanel.createOrShow({ extensionUri: uri })();
		const got = WelcomePanel.currentPanel?.dataroot;
		const want = vscode.Uri.joinPath(uri, 'media');
		assert.strictEqual(got?.toString(), want.toString());
	});
});
