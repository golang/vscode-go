/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import moment = require('moment');
import semver = require('semver');
import sinon = require('sinon');
import lsp = require('../../src/goLanguageServer');
import { getTool, Tool } from '../../src/goTools';

suite('gopls update tests', () => {
	test('prompt for update', () => {
		const latestRelease = semver.coerce('v0.4.0');
		const latestReleaseTimestamp = moment('2020-04-08', 'YYYY-MM-DD');
		const latestPrerelease = semver.coerce('v0.4.0-pre1');
		const latestPrereleaseTimestamp = moment('2020-05-07', 'YYYY-MM-DD');
		const testCases: [string, boolean, semver.SemVer][] = [
			['v0.3.1', false, latestRelease], // outdated tagged version
			['v0.3.1', true, latestPrerelease], // outdated tagged version, accept pre-release
			['v0.4.0', false, null], // up-to-date tagged version
			['v0.4.0', true, latestPrerelease], // up-to-date tagged version, accept pre-release
			['(devel)', false, null], // pre-release version
			['nosuchversion', false, null], // nonsense version
			[
				'v0.4.1-pre1 h1:w6e4AmFe6sDSVrgaRkf4WqLyVAlByUrr9QM5xH7z1e4=',
				false, null // pre-release version
			],
			[
				'v0.4.1-pre1 h1:w6e4AmFe6sDSVrgaRkf4WqLyVAlByUrr9QM5xH7z1e4=',
				true, null // pre-release version
			],
			[
				'v0.3.1-pre1 h1:pBnJjmdcHy5AiRJleOWaakxFHykf8uXzSZKQMd0EA0Q=',
				false, latestRelease // outdated pre-release version, don't accept pre-release
			],
			[
				'v0.3.1-pre1 h1:pBnJjmdcHy5AiRJleOWaakxFHykf8uXzSZKQMd0EA0Q=',
				true, latestPrerelease // outdated pre-release version, accept pre-release
			],
			[
				'v0.0.0-20200509030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				false, null, // recent pseudoversion
			],
			[
				'v0.0.0-20200501030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				true, latestPrerelease, // recent pseudoversion (before pre-release)
			],
			[
				'v0.0.0-20200309030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				false, latestRelease, // old pseudoversion
			],
			[
				'v0.0.0-20200309030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				true, latestPrerelease, // old pseudoversion
			],
		];
		testCases.map(async ([usersVersion, acceptPrerelease, want], i) => {
			sinon.replace(lsp, 'getLocalGoplsVersion', async () => {
				return usersVersion;
			});
			sinon.replace(lsp, 'getLatestGoplsVersion', async () => {
				if (acceptPrerelease) {
					return latestPrerelease;
				}
				return latestRelease;
			});
			sinon.replace(lsp, 'getTimestampForVersion', async (_: Tool, version: semver.SemVer) => {
				if (version === latestRelease) {
					return latestReleaseTimestamp;
				}
				if (version === latestPrerelease) {
					return latestPrereleaseTimestamp;
				}
			});
			const tool = getTool('gopls');
			const got = await lsp.shouldUpdateLanguageServer(tool, 'bad/path/to/gopls', true);
			assert.equal(got, want);
			sinon.restore();
		});
	});
});
