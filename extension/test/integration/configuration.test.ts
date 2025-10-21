/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

/* eslint-disable node/no-unpublished-import */

// vscode.WorkspaceConfiguration.get() returns any type. So MockWorkspaceConfiguration
// need to take a input of a Map containing any type.
/* eslint-disable @typescript-eslint/no-explicit-any */

import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getGoConfig, getGoplsConfig, validateConfig } from '../../src/config';
import { MockWorkspaceConfiguration } from './mocks/configuration';

suite('Configuration validation tests', () => {
	let sandbox: sinon.SinonSandbox;
	const util = require('../../src/stateUtils');

	let showWarningMessageStub: sinon.SinonStub;

	setup(() => {
		sandbox = sinon.createSandbox();
		showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
	});

	teardown(() => {
		sandbox.restore();
	});

	interface TestCase {
		name: string;

		// Some configuration validation send one time suggestions to user.
		// This will be the return value for getGlobalState indicating whether
		// the suggestion have been made already.
		suggested?: boolean;

		// go and gopls configuration.
		goConfig?: Map<string, any>;
		goplsConfig?: Map<string, any>;

		expectWarning: boolean;
		warningMessage?: string;
	}

	const testCases: TestCase[] = [
		// Lint tool setting tests.
		{
			name: 'Conflict: lintTool is staticcheck and gopls staticcheck true (fully enabled)',
			goConfig: new Map<string, any>([
				['lintTool', 'staticcheck'],
				['useLanguageServer', true]
			]),
			goplsConfig: new Map<string, any>([['ui.diagnostic.staticcheck', true]]),
			expectWarning: true,
			warningMessage:
				'Warning: staticcheck is configured to run both client side (go.lintTool=staticcheck) and server side (gopls.ui.diagnostic.staticcheck=true)'
		},
		{
			name: 'Conflict: lintTool is staticcheck and gopls staticcheck unset (partially enabled)',
			goConfig: new Map<string, any>([
				['lintTool', 'staticcheck'],
				['useLanguageServer', true]
			]),
			goplsConfig: new Map<string, any>(),
			expectWarning: true,
			warningMessage:
				'Warning: staticcheck is configured to run both client side (go.lintTool=staticcheck) and server side (gopls.ui.diagnostic.staticcheck=true)'
		},
		{
			name: 'Happy Path: lintTool is staticcheck and gopls staticcheck disabled',
			goConfig: new Map<string, any>([
				['lintTool', 'staticcheck'],
				['useLanguageServer', true]
			]),
			goplsConfig: new Map<string, any>([['ui.diagnostic.staticcheck', false]]),
			expectWarning: false
		},
		{
			name: 'Happy path: lintTool is golangci-lint but gopls staticheck enable',
			goConfig: new Map<string, any>([
				['lintTool', 'golangci-lint'],
				['useLanguageServer', true]
			]),
			goplsConfig: new Map<string, any>([['ui.diagnostic.staticcheck', true]]),
			expectWarning: false
		},
		{
			name: 'Happy Path: lintTool is unset and gopls staticcheck true (fully enabled)',
			goConfig: new Map<string, any>([['useLanguageServer', true]]),
			goplsConfig: new Map<string, any>([['ui.diagnostic.staticcheck', true]]),
			expectWarning: false
		},
		{
			name: 'Happy Path: lintTool is unset and gopls staticcheck unset (partially enabled)',
			goConfig: new Map<string, any>([['useLanguageServer', true]]),
			goplsConfig: new Map<string, any>(),
			expectWarning: false
		},
		{
			name: 'Happy path: lintTool is unset but gopls staticheck disabled',
			goConfig: new Map<string, any>([['useLanguageServer', true]]),
			goplsConfig: new Map<string, any>([['ui.diagnostic.staticcheck', false]]),
			expectWarning: false
		},
		// Format tool setting tests.
		{
			name: 'Conflict: formatTool is gofumpt and gopls gofumpt setting is true',
			suggested: true,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofumpt']
			]),
			goplsConfig: new Map<string, any>([['formatting.gofumpt', true]]),
			expectWarning: true,
			warningMessage:
				'Warning: formatter is configured to run from both client side (go.formatTool=gofumpt) and server side (gopls.formatting.gofumpt=true).'
		},
		{
			name: 'Conflict: formatTool is gofmt and gopls gofumpt setting is true',
			suggested: true,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofmt']
			]),
			goplsConfig: new Map<string, any>([['formatting.gofumpt', true]]),
			expectWarning: true,
			warningMessage:
				'Warning: formatter is configured to run from both client side (go.formatTool=gofmt) and server side (gopls.formatting.gofumpt=true).'
		},
		{
			name: 'Suggestion: formatTool is gofumpt',
			suggested: false,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofumpt']
			]),
			goplsConfig: new Map<string, any>([['formatting.gofumpt', true]]),
			expectWarning: true,
			warningMessage: 'Recommendation: the format tool gofumpt specified is available in gopls.'
		},
		{
			name: 'Suggestion: formatTool is gofmt',
			suggested: false,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofmt']
			]),
			expectWarning: true,
			warningMessage: 'Recommendation: the format tool gofmt specified is available in gopls.'
		},
		{
			name: 'Suggestion skipped: formatTool is gofumpt and has been suggested',
			suggested: true,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofumpt']
			]),
			expectWarning: false
		},
		{
			name: 'Suggestion skipped: formatTool is gofmt and has been suggested',
			suggested: true,
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'gofmt']
			]),
			expectWarning: false
		},
		{
			name: 'Happy path: formatTool is default, by default gopls will use gofmt',
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'default']
			]),
			expectWarning: false
		},
		{
			name: 'Happy path: formatTool is default, set gopls.formatting.gofumpt',
			goConfig: new Map<string, any>([
				['useLanguageServer', true],
				['formatTool', 'default']
			]),
			goplsConfig: new Map<string, any>([['formatting.gofumpt', true]]),
			expectWarning: false
		}
	];

	testCases.forEach((tc) => {
		test(tc.name, async () => {
			const goConfig = new MockWorkspaceConfiguration(getGoConfig(), tc.goConfig);
			const goplsConfig = new MockWorkspaceConfiguration(getGoplsConfig(), tc.goplsConfig);

			if (tc.suggested) {
				sandbox.stub(util, 'getFromGlobalState').returns(tc.suggested);
			}

			await validateConfig(goConfig, goplsConfig);

			if (tc.expectWarning) {
				assert(
					showWarningMessageStub.calledWith(
						sinon.match((msg: string) => msg.startsWith(tc.warningMessage!)),
						sinon.match('Open Settings')
					),
					`showWarningMessage was not called with a message starting with "${tc.warningMessage}"`
				);
			} else {
				assert(showWarningMessageStub.notCalled, 'showWarningMessage was called unexpectedly');
			}
		});
	});
});
