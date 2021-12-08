/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-prototype-builtins */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import { lstatSync } from 'fs';
import path = require('path');
import vscode = require('vscode');
import { ContinuedEvent } from 'vscode-debugadapter';
import { getGoConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import {
	declinedToolInstall,
	installTools,
	promptForMissingTool,
	promptForUpdatingTool,
	shouldUpdateTool
} from './goInstallTools';
import { packagePathToGoModPathMap } from './goModules';
import { getToolAtVersion } from './goTools';
import { pickProcess, pickProcessByName } from './pickProcess';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { getBinPath, getGoVersion } from './util';
import { parseEnvFiles } from './utils/envUtils';
import { resolveHomeDir } from './utils/pathUtils';

let dlvDAPVersionChecked = false;

export class GoDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
	constructor(private defaultDebugAdapterType: string = 'go') {}

	public async provideDebugConfigurations(
		folder: vscode.WorkspaceFolder | undefined,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration[] | undefined> {
		return await this.pickConfiguration();
	}

	public async pickConfiguration(): Promise<vscode.DebugConfiguration[]> {
		const debugConfigurations = [
			{
				label: 'Go: Launch Package',
				description: 'Debug/test the package of the open file',
				config: {
					name: 'Launch Package',
					type: this.defaultDebugAdapterType,
					request: 'launch',
					mode: 'auto',
					program: '${fileDirname}'
				}
			},
			{
				label: 'Go: Attach to local process',
				description: 'Attach to an existing process by process ID',
				config: {
					name: 'Attach to Process',
					type: 'go',
					request: 'attach',
					mode: 'local',
					processId: 0
				}
			},
			{
				label: 'Go: Connect to server',
				description: 'Connect to a remote headless debug server',
				config: {
					name: 'Connect to server',
					type: 'go',
					request: 'attach',
					mode: 'remote',
					remotePath: '${workspaceFolder}',
					port: 2345,
					host: '127.0.0.1'
				},
				fill: async (config: vscode.DebugConfiguration) => {
					const host = await vscode.window.showInputBox({
						prompt: 'Enter hostname',
						value: '127.0.0.1'
					});
					if (host) {
						config.host = host;
					}
					const port = Number(
						await vscode.window.showInputBox({
							prompt: 'Enter port',
							value: '2345',
							validateInput: (value: string) => {
								if (isNaN(Number(value))) {
									return 'Please enter a number.';
								}
								return '';
							}
						})
					);
					if (port) {
						config.port = port;
					}
				}
			}
		];

		const choice = await vscode.window.showQuickPick(debugConfigurations, {
			placeHolder: 'Choose debug configuration'
		});
		if (!choice) {
			return [];
		}

		if (choice.fill) {
			await choice.fill(choice.config);
		}
		return [choice.config];
	}

	public async resolveDebugConfiguration(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration> {
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

		// Figure out which debugAdapter is being used first, so we can use this to send warnings
		// for properties that don't apply.
		if (!debugConfiguration.hasOwnProperty('debugAdapter') && dlvConfig.hasOwnProperty('debugAdapter')) {
			const { globalValue, workspaceValue } = goConfig.inspect('delveConfig.debugAdapter');
			// user configured the default debug adapter through settings.json.
			if (globalValue !== undefined || workspaceValue !== undefined) {
				debugConfiguration['debugAdapter'] = dlvConfig['debugAdapter'];
			}
		}
		if (!debugConfiguration['debugAdapter']) {
			// For local modes, default to dlv-dap. For remote - to legacy for now.
			debugConfiguration['debugAdapter'] = debugConfiguration['mode'] !== 'remote' ? 'dlv-dap' : 'legacy';
		}
		if (debugConfiguration['debugAdapter'] === 'dlv-dap') {
			if (debugConfiguration['mode'] === 'remote') {
				// This is only possible if a user explicitely requests this combination. Let them, with a warning.
				// They need to use dlv at version 'v1.7.3-0.20211026171155-b48ceec161d5' or later,
				// but we have no way of detectng that with an external server.
				this.showWarning(
					'ignoreDlvDAPInRemoteModeWarning',
					"'remote' mode with 'dlv-dap' debugAdapter must connect to an external `dlv --headless` server @ v1.7.3 or later. Older versions will fail with \"error layer=rpc rpc:invalid character 'C' looking for beginning of value\" logged to the terminal.\n"
				);
			} else if (debugConfiguration['port']) {
				this.showWarning(
					'ignorePortUsedInDlvDapWarning',
					"`port` with 'dlv-dap' debugAdapter connects to [an external `dlv dap` server](https://github.com/golang/vscode-go/blob/master/docs/debugging.md#running-debugee-externally) to launch a program or attach to a process. Remove 'host' and 'port' from your launch.json if you have not launched a 'dlv dap' server."
				);
			}
		}

		const debugAdapter = debugConfiguration['debugAdapter'] === 'dlv-dap' ? 'dlv-dap' : 'dlv';

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
		if (
			debugAdapter === 'dlv-dap' &&
			(debugConfiguration.hasOwnProperty('dlvLoadConfig') ||
				goConfig.inspect('delveConfig.dlvLoadConfig').globalValue !== undefined ||
				goConfig.inspect('delveConfig.dlvLoadConfig').workspaceValue !== undefined)
		) {
			this.showWarning(
				'ignoreDebugDlvConfigWithDlvDapWarning',
				"'dlvLoadConfig' is deprecated with dlv-dap debug adapter.\n\nDlv-dap loads composite data on demand and uses increased string limits on source code hover, in Debug Console and via Copy Value. Please file an issue if these are not sufficient for your use case."
			);
		}

		// Reflect the defaults set through go.delveConfig setting.
		const dlvProperties = [
			'showRegisters',
			'showGlobalVariables',
			'substitutePath',
			'showLog',
			'logOutput',
			'dlvFlags',
			'hideSystemGoroutines'
		];
		if (debugAdapter !== 'dlv-dap') {
			dlvProperties.push('dlvLoadConfig');
		}
		dlvProperties.forEach((p) => {
			if (!debugConfiguration.hasOwnProperty(p) && dlvConfig.hasOwnProperty(p)) {
				debugConfiguration[p] = dlvConfig[p];
			}
		});

		if (debugAdapter !== 'dlv-dap' && debugConfiguration.request === 'attach' && !debugConfiguration['cwd']) {
			debugConfiguration['cwd'] = '${workspaceFolder}';
			if (vscode.workspace.workspaceFolders?.length > 1) {
				debugConfiguration['cwd'] = '${fileWorkspaceFolder}';
			}
		}
		if (debugConfiguration['cwd']) {
			// expand 'cwd' folder path containing '~', which would cause dlv to fail
			debugConfiguration['cwd'] = resolveHomeDir(debugConfiguration['cwd']);
		}

		const dlvToolPath = getBinPath(debugAdapter);
		if (!path.isAbsolute(dlvToolPath)) {
			// If user has not already declined to install this tool,
			// prompt for it. Otherwise continue and have the lack of
			// dlv binary be caught later.
			if (!declinedToolInstall(debugAdapter)) {
				await promptForMissingTool(debugAdapter);
				return;
			}
		}
		debugConfiguration['dlvToolPath'] = dlvToolPath;

		if (debugAdapter === 'dlv-dap' && !dlvDAPVersionChecked) {
			const tool = getToolAtVersion('dlv-dap');
			if (await shouldUpdateTool(tool, dlvToolPath)) {
				// If the user has opted in to automatic tool updates, we can update
				// without prompting.
				const toolsManagementConfig = getGoConfig()['toolsManagement'];
				if (toolsManagementConfig && toolsManagementConfig['autoUpdate'] === true) {
					const goVersion = await getGoVersion();
					const toolVersion = { ...tool, version: tool.latestVersion }; // ToolWithVersion
					await installTools([toolVersion], goVersion, true);
				} else {
					await promptForUpdatingTool(tool.name);
				}
				// installTools could've failed (e.g. no network access) or the user decliend to install dlv-dap
				// in promptForUpdatingTool. If dlv-dap doesn't exist or dlv-dap is too old to have MVP features,
				// the failure will be visible to users when launching the dlv-dap process (crash or error message).
			}
			dlvDAPVersionChecked = true;
		}

		if (debugConfiguration['mode'] === 'auto') {
			let filename = activeEditor?.document?.fileName;
			if (debugConfiguration['program'] && debugConfiguration['program'].endsWith('.go')) {
				// If the 'program' attribute is a file, not a directory, then we will determine the mode from that
				// file path instead of the currently active file.
				filename = debugConfiguration['program'];
			}
			debugConfiguration['mode'] = filename?.endsWith('_test.go') ? 'test' : 'debug';
		}

		if (debugConfiguration['mode'] === 'test' && debugConfiguration['program'].endsWith('_test.go')) {
			// Running a test file in file mode does not make sense, so change the program
			// to the directory.
			debugConfiguration['program'] = path.dirname(debugConfiguration['program']);
		}

		if (debugConfiguration.request === 'launch' && debugConfiguration['mode'] === 'remote') {
			this.showWarning(
				'ignoreDebugLaunchRemoteWarning',
				"Request type of 'launch' with mode 'remote' is deprecated, please use request type 'attach' with mode 'remote' instead."
			);
		}

		if (
			debugAdapter !== 'dlv-dap' &&
			debugConfiguration.request === 'attach' &&
			debugConfiguration['mode'] === 'remote' &&
			debugConfiguration['program']
		) {
			this.showWarning(
				'ignoreUsingRemotePathAndProgramWarning',
				"Request type of 'attach' with mode 'remote' does not work with 'program' attribute, please use 'cwd' attribute instead."
			);
		}

		if (debugConfiguration.request === 'attach' && debugConfiguration['mode'] === 'local') {
			if (!debugConfiguration['processId'] || debugConfiguration['processId'] === 0) {
				// The processId is not valid, offer a quickpick menu of all processes.
				debugConfiguration['processId'] = await pickProcess();
			} else if (
				typeof debugConfiguration['processId'] === 'string' &&
				debugConfiguration['processId'] !== '${command:pickProcess}' &&
				debugConfiguration['processId'] !== '${command:pickGoProcess}'
			) {
				debugConfiguration['processId'] = await pickProcessByName(debugConfiguration['processId']);
			}
		}
		return debugConfiguration;
	}

	public resolveDebugConfigurationWithSubstitutedVariables(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): vscode.DebugConfiguration {
		const debugAdapter = debugConfiguration['debugAdapter'];
		if (debugAdapter === '') {
			return null;
		}

		// Read debugConfiguration.envFile and
		// combine the environment variables from all the env files and
		// debugConfiguration.env.
		// We also unset 'envFile' from the user-suppled debugConfiguration
		// because it is already applied.
		//
		// For legacy mode, we merge the environment variables on top of
		// the tools execution environment variables and update the debugConfiguration
		// because VS Code directly handles launch of the legacy debug adapter.
		// For dlv-dap mode, we do not merge the tools execution environment
		// variables here to reduce the number of environment variables passed
		// as launch/attach parameters.
		const goToolsEnvVars = debugAdapter === 'legacy' ? toolExecutionEnvironment(folder?.uri) : {};
		const fileEnvs = parseEnvFiles(debugConfiguration['envFile']);
		const env = debugConfiguration['env'] || {};

		debugConfiguration['env'] = Object.assign(goToolsEnvVars, fileEnvs, env);
		debugConfiguration['envFile'] = undefined; // unset, since we already processed.

		const entriesWithRelativePaths = ['cwd', 'output', 'program'].filter(
			(attr) => debugConfiguration[attr] && !path.isAbsolute(debugConfiguration[attr])
		);
		if (debugAdapter === 'dlv-dap') {
			// 1. Relative paths -> absolute paths
			if (entriesWithRelativePaths.length > 0) {
				const workspaceRoot = folder?.uri.fsPath;
				if (workspaceRoot) {
					entriesWithRelativePaths.forEach((attr) => {
						debugConfiguration[attr] = path.join(workspaceRoot, debugConfiguration[attr]);
					});
				} else {
					this.showWarning(
						'relativePathsWithoutWorkspaceFolder',
						'Behavior when using relative paths without a workspace folder for `cwd`, `program`, or `output` is undefined.'
					);
				}
			}
			// 2. For launch debug/test modes that builds the debug target,
			//    delve needs to be launched from the right directory (inside the main module of the target).
			//    Compute the launch dir heuristically, and translate the dirname in program to a path relative to buildDir.
			//    We skip this step when working with externally launched debug adapter
			//    because we do not control the adapter's launch process.
			if (debugConfiguration.request === 'launch') {
				const mode = debugConfiguration['mode'] || 'debug';
				if (['debug', 'test', 'auto'].includes(mode)) {
					// Massage config to build the target from the package directory
					// with a relative path. (https://github.com/golang/vscode-go/issues/1713)
					// parseDebugProgramArgSync will throw an error if `program` is invalid.
					const { program, dirname, programIsDirectory } = parseDebugProgramArgSync(
						debugConfiguration['program']
					);
					if (
						dirname &&
						// Presence of the following attributes indicates externally launched debug adapter.
						// Don't mess with 'program' if the debug adapter was launched externally.
						!debugConfiguration.port &&
						!debugConfiguration.debugServer
					) {
						debugConfiguration['__buildDir'] = dirname;
						debugConfiguration['program'] = programIsDirectory
							? '.'
							: '.' + path.sep + path.relative(dirname, program);
					}
				}
			}
		}
		if (debugConfiguration.request === 'attach' && debugConfiguration['mode'] === 'local') {
			// processId needs to be an int, but the substituted variables from pickGoProcess and pickProcess
			// become a string. Convert any strings to integers.
			if (typeof debugConfiguration['processId'] === 'string') {
				debugConfiguration['processId'] = parseInt(debugConfiguration['processId'], 10);
			}
		}
		return debugConfiguration;
	}

	private showWarning(ignoreWarningKey: string, warningMessage: string) {
		const ignoreWarning = getFromGlobalState(ignoreWarningKey);
		if (ignoreWarning) {
			return;
		}

		const neverAgain = { title: "Don't Show Again" };
		vscode.window.showWarningMessage(warningMessage, neverAgain).then((result) => {
			if (result === neverAgain) {
				updateGlobalState(ignoreWarningKey, true);
			}
		});
	}
}

// parseDebugProgramArgSync parses program arg of debug/auto/test launch requests.
export function parseDebugProgramArgSync(
	program: string
): { program: string; dirname: string; programIsDirectory: boolean } {
	if (!program) {
		throw new Error('The program attribute is missing in the debug configuration in launch.json');
	}
	try {
		const pstats = lstatSync(program);
		if (pstats.isDirectory()) {
			return { program, dirname: program, programIsDirectory: true };
		}
		const ext = path.extname(program);
		if (ext === '.go') {
			// TODO(hyangah): .s?
			return { program, dirname: path.dirname(program), programIsDirectory: false };
		}
	} catch (e) {
		console.log(`parseDebugProgramArgSync failed: ${e}`);
	}
	// shouldn't reach here if program was a valid directory or .go file.
	throw new Error(
		`The program attribute '${program}' must be a valid directory or .go file in debug/test/auto modes.`
	);
}
