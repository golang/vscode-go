/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import cp = require('child_process');
import path = require('path');
import util = require('util');
import vscode = require('vscode');
import vscodeUri = require('vscode-uri');
import { getGoConfig } from './config';
import { toolExecutionEnvironment } from './goEnv';
import { getFormatTool } from './goFormat';
import { installTools } from './goInstallTools';
import { outputChannel } from './goStatus';
import { getTool } from './goTools';
import { getFromGlobalState, updateGlobalState } from './stateUtils';
import { getBinPath, getGoVersion, getModuleCache, getWorkspaceFolderPath } from './util';
import { envPath, fixDriveCasingInWindows, getCurrentGoRoot } from './utils/pathUtils';
export let GO111MODULE: string;

export async function runGoEnv(uri?: vscode.Uri, envvars: string[] = []): Promise<any> {
	const goExecutable = getBinPath('go');
	if (!goExecutable) {
		console.warn(
			`Failed to run "go env GOMOD" to find mod file as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath})`
		);
		return {};
	}
	const env = toolExecutionEnvironment(uri);
	GO111MODULE = env['GO111MODULE'];
	const args = ['env', '-json'].concat(envvars);
	try {
		const { stdout, stderr } = await util.promisify(cp.execFile)(goExecutable, args, { cwd: uri?.fsPath, env });
		if (stderr) {
			throw new Error(stderr);
		}
		return JSON.parse(stdout);
	} catch (e) {
		vscode.window.showErrorMessage(`Failed to run "go env ${args}": ${e.message}`);
		return {};
	}
}

export function isModSupported(fileuri: vscode.Uri, isDir?: boolean): Promise<boolean> {
	return getModFolderPath(fileuri, isDir).then((modPath) => !!modPath);
}

export const packagePathToGoModPathMap: { [key: string]: string } = {};

export async function getModFolderPath(fileuri: vscode.Uri, isDir?: boolean): Promise<string> {
	const pkgUri = isDir ? fileuri : vscodeUri.Utils.dirname(fileuri);
	const pkgPath = pkgUri.fsPath;
	if (packagePathToGoModPathMap[pkgPath]) {
		return packagePathToGoModPathMap[pkgPath];
	}

	// We never would be using the path under module cache for anything
	// So, dont bother finding where exactly is the go.mod file
	const moduleCache = getModuleCache();
	if (fixDriveCasingInWindows(fileuri.fsPath).startsWith(moduleCache)) {
		return moduleCache;
	}
	const goVersion = await getGoVersion();
	if (!goVersion || goVersion.lt('1.11')) {
		return;
	}

	const goModEnvJSON = await runGoEnv(pkgUri, ['GOMOD']);
	let goModEnvResult =
		goModEnvJSON['GOMOD'] === '/dev/null' || goModEnvJSON['GOMOD'] === 'NUL' ? '' : goModEnvJSON['GOMOD'];
	if (goModEnvResult) {
		goModEnvResult = path.dirname(goModEnvResult);
		const goConfig = getGoConfig(fileuri);

		if (goConfig['inferGopath'] === true && !fileuri.path.includes('/vendor/')) {
			goConfig.update('inferGopath', false, vscode.ConfigurationTarget.WorkspaceFolder);
			vscode.window.showInformationMessage(
				'The "inferGopath" setting is disabled for this workspace because Go modules are being used.'
			);
		}

		if (goConfig['useLanguageServer'] === false && getFormatTool(goConfig) === 'goreturns') {
			const promptFormatToolMsg =
				'The goreturns tool does not support Go modules. Please update the "formatTool" setting to "goimports".';
			promptToUpdateToolForModules('switchFormatToolToGoimports', promptFormatToolMsg, goConfig);
		}
	}
	packagePathToGoModPathMap[pkgPath] = goModEnvResult;
	return goModEnvResult;
}

const promptedToolsForCurrentSession = new Set<string>();
export async function promptToUpdateToolForModules(
	tool: string,
	promptMsg: string,
	goConfig?: vscode.WorkspaceConfiguration
): Promise<boolean> {
	if (promptedToolsForCurrentSession.has(tool)) {
		return false;
	}
	const promptedToolsForModules = getFromGlobalState('promptedToolsForModules', {});
	if (promptedToolsForModules[tool]) {
		return false;
	}
	const goVersion = await getGoVersion();
	const selected = await vscode.window.showInformationMessage(promptMsg, 'Update', 'Later', "Don't show again");
	let choseToUpdate = false;
	switch (selected) {
		case 'Update':
			choseToUpdate = true;
			if (!goConfig) {
				goConfig = getGoConfig();
			}
			await installTools([getTool(tool)], goVersion);
			switch (tool) {
				case 'switchFormatToolToGoimports':
					goConfig.update('formatTool', 'goimports', vscode.ConfigurationTarget.Global);
					break;
				case 'gopls':
					if (goConfig.get('useLanguageServer') === false) {
						goConfig.update('useLanguageServer', true, vscode.ConfigurationTarget.Global);
					}
					if (goConfig.inspect('useLanguageServer').workspaceFolderValue === false) {
						goConfig.update('useLanguageServer', true, vscode.ConfigurationTarget.WorkspaceFolder);
					}
					break;
			}
			promptedToolsForModules[tool] = true;
			updateGlobalState('promptedToolsForModules', promptedToolsForModules);
			break;
		case "Don't show again":
			promptedToolsForModules[tool] = true;
			updateGlobalState('promptedToolsForModules', promptedToolsForModules);
			break;
		case 'Later':
		default:
			promptedToolsForCurrentSession.add(tool);
			break;
	}
	return choseToUpdate;
}

const folderToPackageMapping: { [key: string]: string } = {};
export async function getCurrentPackage(cwd: string): Promise<string> {
	if (folderToPackageMapping[cwd]) {
		return folderToPackageMapping[cwd];
	}

	const moduleCache = getModuleCache();
	if (cwd.startsWith(moduleCache)) {
		let importPath = cwd.substr(moduleCache.length + 1);
		const matches = /@v\d+(\.\d+)?(\.\d+)?/.exec(importPath);
		if (matches) {
			importPath = importPath.substr(0, matches.index);
		}

		folderToPackageMapping[cwd] = importPath;
		return importPath;
	}

	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		console.warn(
			`Failed to run "go list" to find current package as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${envPath})`
		);
		return;
	}
	return new Promise<string>((resolve) => {
		const childProcess = cp.spawn(goRuntimePath, ['list'], { cwd, env: toolExecutionEnvironment() });
		const chunks: any[] = [];
		childProcess.stdout.on('data', (stdout) => {
			chunks.push(stdout);
		});

		childProcess.on('close', () => {
			// Ignore lines that are empty or those that have logs about updating the module cache
			const pkgs = chunks
				.join('')
				.toString()
				.split('\n')
				.filter((line) => line && line.indexOf(' ') === -1);
			if (pkgs.length !== 1) {
				resolve('');
				return;
			}
			folderToPackageMapping[cwd] = pkgs[0];
			resolve(pkgs[0]);
		});
	});
}

export async function goModInit() {
	outputChannel.clear();

	const moduleName = await vscode.window.showInputBox({
		prompt: 'Enter module name',
		value: '',
		placeHolder: 'example/project'
	});

	const goRuntimePath = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	try {
		const env = toolExecutionEnvironment();
		const cwd = getWorkspaceFolderPath();
		outputChannel.appendLine(`Running "${goRuntimePath} mod init ${moduleName}"`);
		await execFile(goRuntimePath, ['mod', 'init', moduleName], { env, cwd });
		outputChannel.appendLine('Module successfully initialized. You are ready to Go :)');
		vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(cwd, 'go.mod')));
	} catch (e) {
		outputChannel.appendLine(e);
		outputChannel.show();
		vscode.window.showErrorMessage(
			`Error running "${goRuntimePath} mod init ${moduleName}": See Go output channel for details`
		);
	}
}
