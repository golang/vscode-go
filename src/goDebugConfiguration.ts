/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
import parse = require('yargs-parser');
import unparse = require('yargs-unparser');
import { toolExecutionEnvironment } from './goEnv';
import { promptForMissingTool } from './goInstallTools';
import { packagePathToGoModPathMap } from './goModules';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { getBinPath, getGoConfig, resolvePath } from './util';
import { parseEnvFiles } from './utils/envUtils';

export class GoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	constructor(private defaultDebugAdapterType: string = 'go') { }

	public provideDebugConfigurations(
		folder: vscode.WorkspaceFolder | undefined,
		token?: vscode.CancellationToken
	): vscode.DebugConfiguration[] {
		return [
			{
				name: 'Launch',
				type: this.defaultDebugAdapterType,
				request: 'launch',
				mode: 'auto',
				program: '${fileDirname}',
				env: {},
				args: []
			}
		];
	}

	public resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): vscode.DebugConfiguration {
		const activeEditor = vscode.window.activeTextEditor;
		if (!debugConfiguration || !debugConfiguration.request) {
			// if 'request' is missing interpret this as a missing launch.json
			if (!activeEditor || activeEditor.document.languageId !== 'go') {
				return;
			}

			debugConfiguration = Object.assign(debugConfiguration || {}, {
				name: 'Launch',
				type: this.defaultDebugAdapterType,
				request: 'launch',
				mode: 'auto',
				program: path.dirname(activeEditor.document.fileName) // matches ${fileDirname}
			});
		}

		if (!debugConfiguration.type) {
			debugConfiguration['type'] = this.defaultDebugAdapterType;
		}

		debugConfiguration['packagePathToGoModPathMap'] = packagePathToGoModPathMap;

		const goConfig = getGoConfig(folder && folder.uri);
		const dlvConfig = goConfig['delveConfig'];
		let useApiV1 = false;
		if (debugConfiguration.hasOwnProperty('useApiV1')) {
			useApiV1 = debugConfiguration['useApiV1'] === true;
		} else if (dlvConfig.hasOwnProperty('useApiV1')) {
			useApiV1 = dlvConfig['useApiV1'] === true;
		}
		if (useApiV1) {
			debugConfiguration['apiVersion'] = 1;
		}
		if (!debugConfiguration.hasOwnProperty('apiVersion') && dlvConfig.hasOwnProperty('apiVersion')) {
			debugConfiguration['apiVersion'] = dlvConfig['apiVersion'];
		}
		if (!debugConfiguration.hasOwnProperty('dlvLoadConfig') && dlvConfig.hasOwnProperty('dlvLoadConfig')) {
			debugConfiguration['dlvLoadConfig'] = dlvConfig['dlvLoadConfig'];
		}
		if (
			!debugConfiguration.hasOwnProperty('showGlobalVariables') &&
			dlvConfig.hasOwnProperty('showGlobalVariables')
		) {
			debugConfiguration['showGlobalVariables'] = dlvConfig['showGlobalVariables'];
		}
		if (debugConfiguration.request === 'attach' && !debugConfiguration['cwd']) {
			debugConfiguration['cwd'] = '${workspaceFolder}';
		}
		if (debugConfiguration['cwd']) {
			// expand 'cwd' folder path containing '~', which would cause dlv to fail
			debugConfiguration['cwd'] = resolvePath(debugConfiguration['cwd']);
		}

		// Remove any '--gcflags' entries and show a warning
		if (debugConfiguration['buildFlags']) {
			const resp = this.removeFlag(debugConfiguration['buildFlags'], 'gcflags');
			if (resp.removed) {
				debugConfiguration['buildFlags'] = resp.args;
				this.showWarning(
					'ignoreDebugGCFlagsWarning',
					`User specified build flag '--gcflags' in 'buildFlags' is being ignored (see [debugging with build flags](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#specifying-other-build-flags) documentation)`
				);
			}
		}
		if (debugConfiguration['env'] && debugConfiguration['env']['GOFLAGS']) {
			const resp = this.removeFlag(debugConfiguration['env']['GOFLAGS'], 'gcflags');
			if (resp.removed) {
				debugConfiguration['env']['GOFLAGS'] = resp.args;
				this.showWarning(
					'ignoreDebugGCFlagsWarning',
					`User specified build flag '--gcflags' in 'GOFLAGS' is being ignored (see [debugging with build flags](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#specifying-other-build-flags) documentation)`
				);
			}
		}

		debugConfiguration['dlvToolPath'] = getBinPath('dlv');
		if (!path.isAbsolute(debugConfiguration['dlvToolPath'])) {
			promptForMissingTool('dlv');
			return;
		}

		if (debugConfiguration['mode'] === 'auto') {
			debugConfiguration['mode'] =
				activeEditor && activeEditor.document.fileName.endsWith('_test.go') ? 'test' : 'debug';
		}

		if (debugConfiguration.request === 'launch' && debugConfiguration['mode'] === 'remote') {
			this.showWarning(
				'ignoreDebugLaunchRemoteWarning',
				`Request type of 'launch' with mode 'remote' is deprecated, please use request type 'attach' with mode 'remote' instead.`
			);
		}

		if (
			debugConfiguration.request === 'attach' &&
			debugConfiguration['mode'] === 'remote' &&
			debugConfiguration['program']
		) {
			this.showWarning(
				'ignoreUsingRemotePathAndProgramWarning',
				`Request type of 'attach' with mode 'remote' does not work with 'program' attribute, please use 'cwd' attribute instead.`
			);
		}
		return debugConfiguration;
	}

	public resolveDebugConfigurationWithSubstitutedVariables(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): vscode.DebugConfiguration {
		// Reads debugConfiguration.envFile and
		// combines the environment variables from all the env files and
		// debugConfiguration.env, on top of the tools execution environment variables.
		// It also unsets 'envFile' from the user-suppled debugConfiguration
		// because it is already applied.
		const goToolsEnvVars = toolExecutionEnvironment(folder?.uri); // also includes GOPATH: getCurrentGoPath().
		const fileEnvs = parseEnvFiles(debugConfiguration['envFile']);
		const env = debugConfiguration['env'] || {};

		debugConfiguration['env'] = Object.assign(goToolsEnvVars, fileEnvs, env);
		debugConfiguration['envFile'] = undefined;  // unset, since we already processed.

		return debugConfiguration;
	}

	private showWarning(ignoreWarningKey: string, warningMessage: string) {
		const ignoreWarning = getFromGlobalState(ignoreWarningKey);
		if (ignoreWarning) {
			return;
		}

		const neverAgain = { title: `Don't Show Again` };
		vscode.window.showWarningMessage(warningMessage, neverAgain).then((result) => {
			if (result === neverAgain) {
				updateGlobalState(ignoreWarningKey, true);
			}
		});
	}

	private removeFlag(args: string, flag: string): {args: string, removed: boolean} {
		const argv = parse(args, {configuration: {'short-option-groups': false}});
		if (argv[flag]) {
			delete argv[flag];
			return { args: unparse(argv).join(' '), removed: true };
		}
		return {args, removed: false};
	}
}
