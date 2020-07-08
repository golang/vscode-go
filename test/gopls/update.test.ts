/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import moment = require('moment');
import semver = require('semver');
import sinon = require('sinon');
import * as lsp from '../../src/goLanguageServer';
import { getTool, Tool } from '../../src/goTools';

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
			[
				'latest pre-release',
				'v0.4.2-pre1',
				false, null,
			],
			[
				'latest pre-release (pre-release)',
				'v0.4.2-pre1',
				true, null,
			],
			[
				'outdated pre-release version',
				'v0.3.1-pre1',
				false, latestVersion,
			],
			[
				'outdated pre-release version (pre-release)',
				'v0.3.1-pre1',
				true, latestPrereleaseVersion,
			],
			[
				'recent pseudoversion after pre-release, 2020-05-20',
				'v0.0.0-20200521000000-2212a7e161a5',
				false, null,
			],
			[
				'recent pseudoversion before pre-release, 2020-05-20',
				'v0.0.0-20200515000000-2212a7e161a5',
				false, null,
			],
			[
				'recent pseudoversion after pre-release (pre-release)',
				'v0.0.0-20200521000000-2212a7e161a5',
				true, null,
			],
			[
				'recent pseudoversion before pre-release (pre-release)',
				'v0.0.0-20200515000000-2212a7e161a5',
				true, latestPrereleaseVersion,
			],
			[
				'outdated pseudoversion',
				'v0.0.0-20200309030707-2212a7e161a5',
				false, latestVersion,
			],
			[
				'outdated pseudoversion (pre-release)',
				'v0.0.0-20200309030707-2212a7e161a5',
				true, latestPrereleaseVersion,
			],
		];
		for (const [name, usersVersion, acceptPrerelease, want] of testCases) {
			sinon.replace(lsp, 'getLocalGoplsVersion', async () => {
				return usersVersion;
			});
			sinon.replace(lsp, 'getLatestGoplsVersion', async () => {
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
			const got = await lsp.shouldUpdateLanguageServer(tool, 'bad/path/to/gopls', true);
			assert.deepEqual(got, want, `${name}: failed (got: '${got}' ${typeof got} want: '${want}' ${typeof want})`);
			sinon.restore();
		}
	});
});
