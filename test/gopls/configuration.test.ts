/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import moment = require('moment');
import semver = require('semver');
import sinon = require('sinon');
import * as vscode from 'vscode';
import * as lsp from '../../src/goLanguageServer';
import { getTool, Tool } from '../../src/goTools';

suite('gopls configuration tests', () => {
	test('configuration', async () => {
		const defaultGoplsConfig = vscode.workspace.getConfiguration('gopls');
		const defaultGoplsAnalysesConfig = vscode.workspace.getConfiguration('gopls.analyses');

		interface TestCase {
			name: string;
			section: string;
			base: any;
			want: any;
		}
		const testCases: TestCase[] = [
			{
				name: 'user set no gopls settings',
				section: 'gopls',
				base: defaultGoplsConfig,
				want: {}
			},
			{
				name: 'user set some gopls settings',
				section: 'gopls',
				base: defaultGoplsConfig,
				want: {
					buildFlags: ['-something'],
					env: { foo: 'bar' },
					hoverKind: 'NoDocumentation',
					usePlaceholders: true,
					linkTarget: 'godoc.org',
				},
			},
			{
				name: 'gopls asks analyses section, user set no analysis',
				section: 'gopls.analyses',
				base: defaultGoplsAnalysesConfig,
				want: {},
			},
			{
				name: 'gopls asks analyses section, user set some',
				section: 'gopls.analyses',
				base: defaultGoplsAnalysesConfig,
				want: {
					coolAnalysis: true,
				},
			},
			{
				name: 'user set extra gopls settings',
				section: 'gopls',
				base: defaultGoplsConfig,
				want: {
					undefinedGoplsSetting: true,
				},
			},
			{
				name: 'gopls asks undefined config section',
				section: 'undefined.section',
				base: undefined,
				want: {},
			}
		];
		testCases.map((tc: TestCase) => {
			const input = Object.assign({}, tc.base, tc.want);
			const actual = lsp.filterDefaultConfigValues(input, tc.section, undefined);
			assert.deepStrictEqual(actual, tc.want, `Failed: ${tc.name}`);
		});
	});
});
