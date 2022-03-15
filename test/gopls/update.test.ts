/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable node/no-deprecated-api */
/* eslint-disable @typescript-eslint/no-unused-vars */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { getGoConfig } from '../../src/config';
import * as lsp from '../../src/language/goLanguageServer';
import * as goInstallTools from '../../src/goInstallTools';
import { getTool, Tool } from '../../src/goTools';
import { getCheckForToolsUpdatesConfig as getCheckForToolUpdatesConfig } from '../../src/util';
import moment = require('moment');
import semver = require('semver');
import sinon = require('sinon');

suite('getCheckForToolUpdatesConfig tests', () => {
	const CHECK_FOR_UPDATES = 'toolsManagement.checkForUpdates';
	const LEGACY_CHECK_FOR_UPDATES = 'useGoProxyToCheckForToolUpdates';
	const defaultConfigInspector = getGoConfig().inspect(CHECK_FOR_UPDATES);

	test('default is as expected', () => {
		const { key, defaultValue, globalValue, workspaceValue } = defaultConfigInspector;
		assert.deepStrictEqual(
			{ key, defaultValue, globalValue, workspaceValue },
			{
				key: `go.${CHECK_FOR_UPDATES}`,
				defaultValue: 'proxy',
				globalValue: undefined,
				workspaceValue: undefined
			},
			CHECK_FOR_UPDATES
		);
		assert.strictEqual(getGoConfig().get(LEGACY_CHECK_FOR_UPDATES), true, LEGACY_CHECK_FOR_UPDATES);
	});

	// wrapper class of vscode.WorkspaceConfiguration - the object returned by
	// vscode.getConfiguration is read-only, and doesn't allow property modification
	// so working with sinon directly doesn't seem possible.
	class TestWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
		constructor(private _wrapped: vscode.WorkspaceConfiguration) {}
		public get<T>(params: string) {
			return this._wrapped.get<T>(params);
		}
		public has(params: string) {
			return this._wrapped.has(params);
		}
		public inspect<T>(params: string) {
			return this._wrapped.inspect<T>(params);
		}
		public update<T>(
			section: string,
			value: any,
			configurationTarget?: vscode.ConfigurationTarget | boolean,
			overrideInLanguage?: boolean
		) {
			return this._wrapped.update(section, value, configurationTarget, overrideInLanguage);
		}
		[key: string]: any;
	}

	teardown(() => {
		sinon.restore();
	});

	test('default checkForUpdates returns proxy', () => {
		const gocfg = getGoConfig();
		assert.strictEqual(getCheckForToolUpdatesConfig(gocfg), 'proxy');
	});
	test('local when new config is not set and legacy config is set to false', () => {
		const gocfg = new TestWorkspaceConfiguration(getGoConfig());
		sinon.stub(gocfg, 'get').withArgs(LEGACY_CHECK_FOR_UPDATES).returns(false);

		assert.strictEqual(getCheckForToolUpdatesConfig(gocfg), 'local');
	});
	test('proxy when new config is "proxy" and legacy config is set to false', () => {
		const gocfg = new TestWorkspaceConfiguration(getGoConfig());
		sinon
			.stub(gocfg, 'get')
			.withArgs(LEGACY_CHECK_FOR_UPDATES)
			.returns(false)
			.withArgs(CHECK_FOR_UPDATES)
			.returns('proxy');
		sinon
			.stub(gocfg, 'inspect')
			.withArgs(CHECK_FOR_UPDATES)
			.returns(Object.assign({}, defaultConfigInspector, { globalValue: 'proxy' }));

		assert.strictEqual(getCheckForToolUpdatesConfig(gocfg), 'proxy');
	});
	test('off when new config (workspace) is "off" and legacy config is set to false', () => {
		const gocfg = new TestWorkspaceConfiguration(getGoConfig());
		sinon
			.stub(gocfg, 'get')
			.withArgs(LEGACY_CHECK_FOR_UPDATES)
			.returns(false)
			.withArgs(CHECK_FOR_UPDATES)
			.returns('off');
		sinon
			.stub(gocfg, 'inspect')
			.withArgs(CHECK_FOR_UPDATES)
			.returns(Object.assign({}, defaultConfigInspector, { workspaceValue: 'off' }));
		assert.strictEqual(getCheckForToolUpdatesConfig(gocfg), 'off');
	});
});

suite('gopls update tests', () => {
	test('prompt for update', async () => {
		const tool = getTool('gopls');

		const toSemver = (v: string) => semver.parse(v, { includePrerelease: true, loose: true });

		// Fake data stubbed functions will serve.
		const latestVersion = toSemver('0.4.1');
		const latestVersionTimestamp = moment('2020-05-13', 'YYYY-MM-DD');
		const latestPrereleaseVersion = toSemver('0.4.2-pre1');
		const latestPrereleaseVersionTimestamp = moment('2020-05-20', 'YYYY-MM-DD');

		// name, usersVersion, acceptPrerelease, want
		const testCases: [string, string, boolean, semver.SemVer][] = [
			['outdated, tagged', 'v0.3.1', false, latestVersion],
			['outdated, tagged (pre-release)', '0.3.1', true, latestPrereleaseVersion],
			['up-to-date, tagged', latestVersion.format(), false, null],
			['up-to-date tagged (pre-release)', 'v0.4.0', true, latestPrereleaseVersion],
			['developer version', '(devel)', false, null],
			['developer version (pre-release)', '(devel)', true, null],
			['nonsense version', 'nosuchversion', false, latestVersion],
			['nonsense version (pre-release)', 'nosuchversion', true, latestPrereleaseVersion],
			['latest pre-release', 'v0.4.2-pre1', false, null],
			['latest pre-release (pre-release)', 'v0.4.2-pre1', true, null],
			['outdated pre-release version', 'v0.3.1-pre1', false, latestVersion],
			['outdated pre-release version (pre-release)', 'v0.3.1-pre1', true, latestPrereleaseVersion],
			['recent pseudoversion after pre-release, 2020-05-20', 'v0.0.0-20200521000000-2212a7e161a5', false, null],
			['recent pseudoversion before pre-release, 2020-05-20', 'v0.0.0-20200515000000-2212a7e161a5', false, null],
			['recent pseudoversion after pre-release (pre-release)', 'v0.0.0-20200521000000-2212a7e161a5', true, null],
			[
				'recent pseudoversion before pre-release (pre-release)',
				'v0.0.0-20200515000000-2212a7e161a5',
				true,
				latestPrereleaseVersion
			],
			['outdated pseudoversion', 'v0.0.0-20200309030707-2212a7e161a5', false, latestVersion],
			[
				'outdated pseudoversion (pre-release)',
				'v0.0.0-20200309030707-2212a7e161a5',
				true,
				latestPrereleaseVersion
			]
		];
		for (const [name, usersVersion, acceptPrerelease, want] of testCases) {
			sinon.replace(lsp, 'getLocalGoplsVersion', async () => {
				return { version: usersVersion };
			});
			sinon.replace(goInstallTools, 'latestToolVersion', async () => {
				if (acceptPrerelease) {
					return latestPrereleaseVersion;
				}
				return latestVersion;
			});
			sinon.replace(lsp, 'getTimestampForVersion', async (_: Tool, version: semver.SemVer) => {
				if (version === latestVersion) {
					return latestVersionTimestamp;
				}
				if (version === latestPrereleaseVersion) {
					return latestPrereleaseVersionTimestamp;
				}
			});
			const got = await lsp.shouldUpdateLanguageServer(tool, {
				enabled: true,
				path: 'bad/path/to/gopls',
				version: null,
				checkForUpdates: 'proxy',
				env: {},
				features: {
					diagnostics: true
				},
				flags: [],
				modtime: new Date(),
				serverName: 'gopls'
			});
			assert.deepEqual(got, want, `${name}: failed (got: '${got}' ${typeof got} want: '${want}' ${typeof want})`);
			sinon.restore();
		}
	});
});

suite('version comparison', () => {
	const tool = getTool('dlv');
	const latestVersion = tool.latestVersion;

	teardown(() => {
		sinon.restore();
	});

	async function testShouldUpdateTool(expected: boolean, moduleVersion?: string) {
		sinon.stub(goInstallTools, 'inspectGoToolVersion').returns(Promise.resolve({ moduleVersion }));
		const got = await goInstallTools.shouldUpdateTool(tool, '/bin/path/to/dlv');
		assert.strictEqual(
			expected,
			got,
			`hard-coded minimum: ${tool.latestVersion.toString()} vs localVersion: ${moduleVersion}`
		);
	}

	test('local delve is old', async () => {
		await testShouldUpdateTool(true, 'v1.6.0');
	});

	test('local delve is the minimum required version', async () => {
		await testShouldUpdateTool(false, 'v' + latestVersion.toString());
	});

	test('local delve is newer', async () => {
		await testShouldUpdateTool(false, `v${latestVersion.major}.${latestVersion.minor + 1}.0`);
	});

	test('local delve is slightly older', async () => {
		await testShouldUpdateTool(
			true,
			`v${latestVersion.major}.${latestVersion.minor}.${latestVersion.patch}-0.20201231000000-5360c6286949`
		);
	});

	test('local delve is slightly newer', async () => {
		await testShouldUpdateTool(
			false,
			`v{$latestVersion.major}.${latestVersion.minor}.${latestVersion.patch}-0.30211231000000-5360c6286949`
		);
	});

	test('local delve version is unknown', async () => {
		// maybe a wrapper shellscript?
		await testShouldUpdateTool(false, undefined);
	});

	test('local delve version is non-sense', async () => {
		// maybe a wrapper shellscript?
		await testShouldUpdateTool(false, 'hello');
	});

	test('local delve version is non-sense again', async () => {
		// maybe a wrapper shellscript?
		await testShouldUpdateTool(false, '');
	});
});
