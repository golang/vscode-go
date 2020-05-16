/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import semver = require('semver');
import sinon = require('sinon');
import lsp = require('../../src/goLanguageServer');
import { getTool, Tool } from '../../src/goTools';

suite('gopls update tests', () => {
	test('prompt for update', () => {
		const tool = getTool('gopls');
		const testCases: [string, string, boolean, semver.SemVer?][] = [
			['outdated, tagged', 'v0.3.1', false, tool.latestVersion],
			['outdated, tagged (pre-release)', '0.3.1', true, tool.latestPrereleaseVersion],
			['up-to-date, tagged', 'v0.4.0', false, undefined],
			['up-to-date tagged (pre-release)', 'v0.4.0', true, tool.latestPrereleaseVersion],
			['developer version', '(devel)', false, undefined],
			['developer version (pre-release)', '(devel)', true, undefined],
			['nonsense version', 'nosuchversion', false, undefined],
			['nonsense version (pre-release)', 'nosuchversion', true, undefined],
			[
				'latest pre-release',
				'v0.4.1-pre1 h1:w6e4AmFe6sDSVrgaRkf4WqLyVAlByUrr9QM5xH7z1e4=',
				false, undefined,
			],
			[
				'latest pre-release (pre-release)',
				'v0.4.1-pre1 h1:w6e4AmFe6sDSVrgaRkf4WqLyVAlByUrr9QM5xH7z1e4=',
				true, undefined,
			],
			[
				'outdated pre-release version',
				'v0.3.1-pre1 h1:pBnJjmdcHy5AiRJleOWaakxFHykf8uXzSZKQMd0EA0Q=',
				false, tool.latestVersion,
			],
			[
				'outdated pre-release version (pre-release)',
				'v0.3.1-pre1 h1:pBnJjmdcHy5AiRJleOWaakxFHykf8uXzSZKQMd0EA0Q=',
				true, tool.latestPrereleaseVersion,
			],
			[
				'recent pseudoversion after pre-release',
				'v0.0.0-20200509030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				false, undefined,
			],
			[
				'recent pseudoversion before pre-release',
				'v0.0.0-20200501030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				false, undefined,
			],
			[
				'recent pseudoversion before pre-release (pre-release)',
				'v0.0.0-20200501030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				true, tool.latestPrereleaseVersion,
			],
			[
				'outdated pseudoversion',
				'v0.0.0-20200309030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				false, tool.latestVersion,
			],
			[
				'outdated pseudoversion (pre-release)',
				'v0.0.0-20200309030707-2212a7e161a5 h1:0gSpZ0Z2URJoo3oilGRq9ViMLDTlmNSDCyeZNHHrvd4=',
				true, tool.latestPrereleaseVersion,
			],
		];
		testCases.map(async ([name, usersVersion, acceptPrerelease, want], i) => {
			sinon.replace(lsp, 'getLocalGoplsVersion', async () => {
				return usersVersion;
			});
			sinon.replace(lsp, 'getLatestGoplsVersion', async () => {
				if (acceptPrerelease) {
					return tool.latestPrereleaseVersion;
				}
				return tool.latestVersion;
			});
			sinon.replace(lsp, 'getTimestampForVersion', async (_: Tool, version?: semver.SemVer) => {
				if (version === tool.latestVersion) {
					return tool.latestVersionTimestamp;
				}
				if (version === tool.latestPrereleaseVersion) {
					return tool.latestPrereleaseVersionTimestamp;
				}
			});
			const got = await lsp.shouldUpdateLanguageServer(tool, 'bad/path/to/gopls', true);
			assert.equal(got, want, `${name}@${i} failed`);
			sinon.restore();
		});
	});
});
