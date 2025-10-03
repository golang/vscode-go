/* eslint-disable node/no-unpublished-import */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { validateConfig, getGoConfig, getGoplsConfig } from '../../src/config';
import { MockWorkspaceConfiguration } from './mocks/configuration';

suite('Configuration validation tests', () => {
	let sandbox: sinon.SinonSandbox;
	let showWarningMessageStub: sinon.SinonStub;

	setup(() => {
		sandbox = sinon.createSandbox();
		showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
	});

	teardown(() => {
		sandbox.restore();
	});

	const testCases = [
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
		}
	];

	testCases.forEach((tc) => {
		test(tc.name, async () => {
			const goConfig = new MockWorkspaceConfiguration(getGoConfig(), tc.goConfig);
			const goplsConfig = new MockWorkspaceConfiguration(getGoplsConfig(), tc.goplsConfig);

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
