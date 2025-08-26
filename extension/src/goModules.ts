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
import { toolExecutionEnvironment } from './goEnv';
import { outputChannel } from './goStatus';
import { getBinPath, getGoVersion, getModuleCache, getWorkspaceFolderPath } from './util';
import { getEnvPath, fixDriveCasingInWindows, getCurrentGoRoot } from './utils/pathUtils';
import { CommandFactory } from './commands';
export let GO111MODULE: string | undefined;

export async function runGoEnv(uri?: vscode.Uri, envvars: string[] = []): Promise<any> {
	const goExecutable = getBinPath('go');
	if (!goExecutable) {
		console.warn(
			`Failed to run "go env GOMOD" to find mod file as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()})`
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
		vscode.window.showErrorMessage(`Failed to run "go env ${args}": ${(e as Error).message}`);
		return {};
	}
}

export function isModSupported(fileuri?: vscode.Uri, isDir?: boolean): Promise<boolean> {
	return getModFolderPath(fileuri, isDir).then((modPath) => !!modPath);
}

// packagePathToGoModPathMap is a cache that maps from a file path (of a package directory)
// to the module root directory path (directory of `go env GOMOD`) if the file belongs to a module.
export const packagePathToGoModPathMap: { [key: string]: string } = {};

// getModFolderPath returns the module root of the file. '' or undefined value indicates
// the file is outside of any module or Go module is disabled.
export async function getModFolderPath(fileuri?: vscode.Uri, isDir?: boolean): Promise<string | undefined> {
	const pkgUri = isDir ? fileuri : fileuri && vscodeUri.Utils.dirname(fileuri);
	const pkgPath = pkgUri?.fsPath ?? '';
	if (pkgPath && packagePathToGoModPathMap[pkgPath]) {
		return packagePathToGoModPathMap[pkgPath];
	}

	// We never would be using the path under module cache for anything
	// So, dont bother finding where exactly is the go.mod file
	const moduleCache = getModuleCache();
	if (moduleCache && fixDriveCasingInWindows(fileuri?.fsPath ?? '').startsWith(moduleCache)) {
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
	}
	packagePathToGoModPathMap[pkgPath] = goModEnvResult;
	return goModEnvResult;
}

const folderToPackageMapping: { [key: string]: string } = {};
export async function getCurrentPackage(cwd: string): Promise<string> {
	if (folderToPackageMapping[cwd]) {
		return folderToPackageMapping[cwd];
	}

	const moduleCache = getModuleCache();
	if (moduleCache && cwd.startsWith(moduleCache)) {
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
			`Failed to run "go list" to find current package as the "go" binary cannot be found in either GOROOT(${getCurrentGoRoot()}) or PATH(${getEnvPath()})`
		);
		return '';
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

export const goModInit: CommandFactory = () => async () => {
	const moduleName = await vscode.window.showInputBox({
		prompt: 'Enter module name',
		value: '',
		placeHolder: 'example/project'
	});

	if (!moduleName) {
		return;
	}

	const goRuntimePath = getBinPath('go');
	const execFile = util.promisify(cp.execFile);
	try {
		const env = toolExecutionEnvironment();
		const cwd = getWorkspaceFolderPath() ?? '';
		outputChannel.info(`Running "${goRuntimePath} mod init ${moduleName}"`);
		await execFile(goRuntimePath, ['mod', 'init', moduleName], { env, cwd });
		outputChannel.info('Module successfully initialized. You are ready to Go :)');
		vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(cwd, 'go.mod')));
	} catch (e) {
		outputChannel.error((e as Error).message);
		outputChannel.show();
		vscode.window.showErrorMessage(
			`Error running "${goRuntimePath} mod init ${moduleName}": See Go output channel for details`
		);
	}
};
