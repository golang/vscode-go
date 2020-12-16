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
	test('filterGoplsDefaultConfigValues', async () => {
		const defaultGoplsConfig = vscode.workspace.getConfiguration('gopls');
		const defaultGoplsAnalysesConfig = vscode.workspace.getConfiguration('gopls.analyses');

		interface TestCase {
			name: string;
			section: string;
			input: any;
			want: any;
		}
		const testCases: TestCase[] = [
			{
				name: 'user set no gopls settings',
				section: 'gopls',
				input: defaultGoplsConfig,
				want: {}
			},
			{
				name: 'user set some gopls settings',
				section: 'gopls',
				input: Object.assign({}, defaultGoplsConfig, {
					buildFlags: ['-something'],
					env: { foo: 'bar' },
					hoverKind: 'NoDocumentation',
					usePlaceholders: true,
					linkTarget: 'godoc.org'
				}),
				want: {
					buildFlags: ['-something'],
					env: { foo: 'bar' },
					hoverKind: 'NoDocumentation',
					usePlaceholders: true,
					linkTarget: 'godoc.org',
				},
			},
			{
				name: 'user set extra gopls settings',
				section: 'gopls',
				input: Object.assign({}, defaultGoplsConfig, {
					undefinedGoplsSetting: true
				}),
				want: {
					undefinedGoplsSetting: true,
				},
			},
			{
				name: 'never returns undefined',
				section: 'undefined.section',
				input: undefined,
				want: {},
			},
		];
		testCases.map((tc: TestCase) => {
			const actual = lsp.filterGoplsDefaultConfigValues(tc.input, undefined);
			assert.deepStrictEqual(actual, tc.want, `Failed: ${tc.name}`);
		});
	});

	test('passGoConfigToGoplsConfigValues', async () => {
		interface TestCase {
			name: string;
			goplsConfig: any;
			goConfig: any;
			want: any;
		}
		const testCases: TestCase[] = [
			{
				name: 'undefined gopls, go configs result in an empty config',
				goplsConfig: undefined,
				goConfig: undefined,
				want: {}
			},
			{
				name: 'empty gopls, go configs result in an empty config',
				goplsConfig: {},
				goConfig: {},
				want: {}
			},
			{
				name: 'empty gopls, default go configs result in an empty config',
				goplsConfig: {},
				goConfig: {
					buildFlags: [],
					buildTags: '',
				},
				want: {}
			},
			{
				name: 'pass go config buildFlags to gopls config',
				goplsConfig: {},
				goConfig: { buildFlags: ['-modfile', 'gopls.mod', '-tags', 'tag1,tag2', '-modcacherw'] },
				want: { buildFlags: ['-modfile', 'gopls.mod', '-tags', 'tag1,tag2', '-modcacherw']}
			},
			{
				name: 'pass go config buildTags to gopls config',
				goplsConfig: {},
				goConfig: { buildTags: 'tag1,tag2' },
				want: { buildFlags: ['-tags', 'tag1,tag2']}
			},
			{
				name: 'do not pass go config buildTags if buildFlags already have tags',
				goplsConfig: {},
				goConfig: {
					buildFlags: ['-tags', 'tag0'],
					buildTags: 'tag1,tag2'
				},
				want: { buildFlags: ['-tags', 'tag0']}
			},
			{
				name: 'do not mutate other gopls config but gopls.buildFlags',
				goplsConfig: {
					env: {GOPROXY: 'direct'}
				},
				goConfig: { buildFlags: ['-modfile', 'gopls.mod', '-tags', 'tag1,tag2', '-modcacherw'] },
				want: {
					env: { GOPROXY : 'direct' },
					buildFlags: ['-modfile', 'gopls.mod', '-tags', 'tag1,tag2', '-modcacherw']}
			},

			{
				name: 'do not mutate misconfigured gopls.buildFlags',
				goplsConfig: {
					buildFlags: '-modfile gopls.mod',  // misconfiguration
				},
				goConfig: {
					buildFlags: '-modfile go.mod -tags tag1 -modcacherw',
				},
				want: { buildFlags: '-modfile gopls.mod' }
			},
			{
				name: 'do not overwrite gopls config if it is explicitly set',
				goplsConfig: {
					env: {GOPROXY: 'direct'},
					buildFlags: [],  // empty
				},
				goConfig: {
					// expect only non-conflicting flags (tags, modcacherw) passing.
					buildFlags: ['-modfile go.mod -tags tag1 -modcacherw'],
					buildTags: 'tag3',
				},
				want: {
					env: {GOPROXY: 'direct'},
					buildFlags: [],
				}  // gopls.buildFlags untouched.
			},

		];
		testCases.map((tc: TestCase) => {
			const actual = lsp.passGoConfigToGoplsConfigValues(tc.goplsConfig, tc.goConfig);
			assert.deepStrictEqual(actual, tc.want, `Failed: ${tc.name}`);
		});
	});
});
