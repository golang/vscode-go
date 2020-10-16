/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import moment = require('moment');
import os = require('os');
import path = require('path');
import { promisify } from 'util';
import vscode = require('vscode');
import WebRequest = require('web-request');
import { toolInstallationEnvironment } from './goEnv';
import { logVerbose } from './goLogging';
import { addGoStatus, goEnvStatusbarItem, outputChannel, removeGoStatus } from './goStatus';
import { getFromGlobalState, getFromWorkspaceState, updateGlobalState, updateWorkspaceState } from './stateUtils';
import { getBinPath, getGoConfig, getGoVersion, getTempFilePath, GoVersion, rmdirRecursive } from './util';
import { correctBinname, executableFileExists, getBinPathFromEnvVar, getCurrentGoRoot, pathExists } from './utils/pathUtils';

export class GoEnvironmentOption {
	public static fromQuickPickItem({ description, label }: vscode.QuickPickItem): GoEnvironmentOption {
		return new GoEnvironmentOption(description, label);
	}

	constructor(public binpath: string, public label: string) {}

	public toQuickPickItem(): vscode.QuickPickItem {
		return {
			label: this.label,
			description: this.binpath,
		};
	}
}

export let terminalCreationListener: vscode.Disposable;

let environmentVariableCollection: vscode.EnvironmentVariableCollection;
export function setEnvironmentVariableCollection(env: vscode.EnvironmentVariableCollection) {
	environmentVariableCollection = env;
}

// QuickPickItem names for chooseGoEnvironment menu.
const CLEAR_SELECTION = '$(clear-all) Clear selection';
const CHOOSE_FROM_FILE_BROWSER = '$(folder) Choose from file browser';

/**
 * Present a command palette menu to the user to select their go binary
 */
export async function chooseGoEnvironment() {
	if (!goEnvStatusbarItem) {
		return;
	}

	// if there is no workspace, show GOROOT with message
	if (!vscode.workspace.name) {
		vscode.window.showInformationMessage(`GOROOT: ${getCurrentGoRoot()}. Switching Go version is not yet supported in single-file mode.`);
		return;
	}

	// fetch default go and uninstalled go versions
	let defaultOption: GoEnvironmentOption;
	let uninstalledOptions: GoEnvironmentOption[];
	let goSDKOptions: GoEnvironmentOption[];
	try {
		[defaultOption, uninstalledOptions, goSDKOptions] = await Promise.all([
			getDefaultGoOption(),
			fetchDownloadableGoVersions(),
			getSDKGoOptions()
		]);
	} catch (e) {
		vscode.window.showErrorMessage(e.message);
		return;
	}

	// create quick pick items
	const uninstalledQuickPicks = uninstalledOptions.map((op) => op.toQuickPickItem());
	const defaultQuickPick = defaultOption.toQuickPickItem();
	const goSDKQuickPicks = goSDKOptions.map((op) => op.toQuickPickItem());

	// dedup options by eliminating duplicate paths (description)
	const clearOption: vscode.QuickPickItem = { label: CLEAR_SELECTION };
	const filePickerOption: vscode.QuickPickItem = {
		label: CHOOSE_FROM_FILE_BROWSER,
		description: 'Select the go binary to use',
	};
	// TODO(hyangah): Add separators after clearOption if github.com/microsoft/vscode#74967 is resolved.
	const options = [filePickerOption, clearOption, defaultQuickPick, ...goSDKQuickPicks, ...uninstalledQuickPicks]
		.reduce((opts, nextOption) => {
			if (opts.find((op) => op.description === nextOption.description || op.label === nextOption.label)) {
				return opts;
			}
			return [...opts, nextOption];
		}, [] as vscode.QuickPickItem[]);

	// get user's selection, return if none was made
	const selection = await vscode.window.showQuickPick<vscode.QuickPickItem>(options);
	if (!selection) {
		return;
	}

	// update currently selected go
	try {
		const changed = await setSelectedGo(GoEnvironmentOption.fromQuickPickItem(selection));
		if (changed) {
			vscode.window.showInformationMessage(`Switched to ${selection.label}`);
		}
	} catch (e) {
		vscode.window.showErrorMessage(e.message);
	}
}

/**
 * update the selected go path and label in the workspace state
 */
export async function setSelectedGo(goOption: GoEnvironmentOption, promptReload = true): Promise<boolean> {
	if (!goOption) {
		return false;
	}

	// if the selected go version is not installed, install it
	if (goOption.binpath?.startsWith('go get')) {
		// start a loading indicator
		await downloadGo(goOption);
	} else if (goOption.label === CLEAR_SELECTION) {
		if (!getSelectedGo()) {
			return false;  // do nothing.
		}
		await updateWorkspaceState('selectedGo', undefined);
	} else if (goOption.label === CHOOSE_FROM_FILE_BROWSER) {
		const currentGOROOT = getCurrentGoRoot();
		const defaultUri = currentGOROOT ? vscode.Uri.file(path.join(currentGOROOT, 'bin')) : undefined;

		const newGoUris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			defaultUri,
		});
		if (!newGoUris || newGoUris.length !== 1) {
			return false;
		}
		const newGoUri = newGoUris[0];

		if (defaultUri === newGoUri) {
			return false;
		}
		if (!executableFileExists(newGoUri.path)) {
			vscode.window.showErrorMessage(`${newGoUri.path} is not an executable`);
			return false;
		}
		const newGo = await getGoVersion(newGoUri.path);
		if (!newGo) {
			vscode.window.showErrorMessage(`failed to get "${newGoUri.path} version", invalid Go binary`);
			return false;
		}
		await updateWorkspaceState('selectedGo', new GoEnvironmentOption(newGo.binaryPath, formatGoVersion(newGo)));
	} else {
		// check that the given binary is not already at the beginning of the PATH
		const go = await getGoVersion();
		if (!!go && (go.binaryPath === goOption.binpath || 'Go ' + go.format() === goOption.label)) {
			return false;
		}
		await updateWorkspaceState('selectedGo', goOption);
	}
	// prompt the user to reload the window.
	// promptReload defaults to true and should only be false for tests.
	if (promptReload) {
		const choice = await vscode.window.showInformationMessage('Please reload the window to finish applying Go version changes.', 'Reload Window');
		if (choice === 'Reload Window') {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}
	goEnvStatusbarItem.text = 'Go: reload required';
	goEnvStatusbarItem.command = 'workbench.action.reloadWindow';

	return true;
}

// downloadGo downloads the specified go version available in dl.golang.org.
async function downloadGo(goOption: GoEnvironmentOption) {
	const execFile = promisify(cp.execFile);
	await vscode.window.withProgress({
		title: `Downloading ${goOption.label}`,
		location: vscode.ProgressLocation.Notification,
	}, async () => {
		outputChannel.show();
		outputChannel.clear();

		outputChannel.appendLine('Finding Go executable for downloading');
		const goExecutable = getBinPath('go');
		if (!goExecutable) {
			outputChannel.appendLine('Could not find Go executable.');
			throw new Error('Could not find Go tool.');
		}

		// TODO(bcloud) dedup repeated logic below which comes from
		// https://github.com/golang/vscode-go/blob/bc23fa854192d04200c8e4f74dca18d2c3021b46/src/goInstallTools.ts#L184
		// Install tools in a temporary directory, to avoid altering go.mod files.
		const mkdtemp = promisify(fs.mkdtemp);
		const toolsTmpDir = await mkdtemp(getTempFilePath('go-tools-'));
		let tmpGoModFile: string;

		// Write a temporary go.mod file to avoid version conflicts.
		tmpGoModFile = path.join(toolsTmpDir, 'go.mod');
		const writeFile = promisify(fs.writeFile);
		await writeFile(tmpGoModFile, 'module tools');

		// use the current go executable to download the new version
		const env = {
			...toolInstallationEnvironment(),
			GO111MODULE: 'on',
		};
		const [, ...args] = goOption.binpath.split(' ');
		outputChannel.appendLine(`Running ${goExecutable} ${args.join(' ')}`);
		try {
			await execFile(goExecutable, args, {
				env,
				cwd: toolsTmpDir,
			});
		} catch (getErr) {
			outputChannel.appendLine(`Error finding Go: ${getErr}`);
			throw new Error('Could not find Go version.');
		}

		// run `goX.X download`
		const newExecutableName = args[1].split('/')[2];
		const goXExecutable = getBinPath(newExecutableName);
		outputChannel.appendLine(`Running: ${goXExecutable} download`);
		try {
			await execFile(goXExecutable, ['download'], { env, cwd: toolsTmpDir });
		} catch (downloadErr) {
			outputChannel.appendLine(`Error finishing installation: ${downloadErr}`);
			throw new Error('Could not download Go version.');
		}

		outputChannel.appendLine('Finding newly downloaded Go');
		const sdkPath = path.join(os.homedir(), 'sdk');
		if (!await pathExists(sdkPath)) {
			outputChannel.appendLine(`SDK path does not exist: ${sdkPath}`);
			throw new Error(`SDK path does not exist: ${sdkPath}`);
		}

		const readdir = promisify(fs.readdir);
		const subdirs = await readdir(sdkPath);
		const dir = subdirs.find((subdir) => subdir === newExecutableName);
		if (!dir) {
			outputChannel.appendLine('Could not find newly downloaded Go');
			throw new Error('Could not install Go version.');
		}

		const binpath = path.join(sdkPath, dir, 'bin', correctBinname('go'));
		const newOption = new GoEnvironmentOption(binpath, goOption.label);
		await updateWorkspaceState('selectedGo', newOption);

		// remove tmp directories
		outputChannel.appendLine('Cleaning up...');
		rmdirRecursive(toolsTmpDir);
		outputChannel.appendLine('Success!');
	});
}

// PATH value cached before addGoRuntimeBaseToPath modified.
let defaultPathEnv = '';

function pathEnvVarName(): string|undefined {
	if (process.env.hasOwnProperty('PATH')) {
		return 'PATH';
	} else if (process.platform === 'win32' && process.env.hasOwnProperty('Path')) {
		return 'Path';
	} else {
		return;
	}
}

// addGoRuntimeBaseToPATH adds the given path to the front of the PATH environment variable.
// It removes duplicates.
// TODO: can we avoid changing PATH but utilize toolExecutionEnv?
export function addGoRuntimeBaseToPATH(newGoRuntimeBase: string) {
	if (!newGoRuntimeBase) {
		return;
	}
	const pathEnvVar = pathEnvVarName();
	if (!pathEnvVar) {
		logVerbose(`couldn't find PATH property in process.env`);
		return;
	}

	if (!defaultPathEnv) {  // cache the default value
		defaultPathEnv = <string>process.env[pathEnvVar];
	}

	logVerbose(`addGoRuntimeBase(${newGoRuntimeBase}) when PATH=${defaultPathEnv}`);

	// calling this multiple times will override the previous value.
	// environmentVariableCollection.clear();
	if (process.platform !== 'darwin') {
		environmentVariableCollection?.prepend(pathEnvVar, newGoRuntimeBase + path.delimiter);
	} else {
		// When '-l' or '--login' flags are set, the terminal will invoke a login
		// shell again and the paths from the user's login shell will be prepended
		// again in front of the path mutated by environmentVariableCollection API.
		// That causes the mutated path to be ignored which we don't want.
		// So, let's not use the API if those flags are set, but go with the old way
		// -- i.e. send the export shell command.
		// See the open issue and the discussion here:
		// https://github.com/microsoft/vscode/issues/99878#issuecomment-642808852
		const terminalShellArgs = <string[]>(
		vscode.workspace.getConfiguration('terminal.integrated.shellArgs').get('osx') || []);
		if (terminalShellArgs.includes('-l') || terminalShellArgs.includes('--login')) {
			for (const term of vscode.window.terminals) {
				updateIntegratedTerminal(term);
			}
			if (!terminalCreationListener) {
				terminalCreationListener = vscode.window.onDidOpenTerminal(updateIntegratedTerminal);
			}
		} else {
			environmentVariableCollection?.prepend(pathEnvVar, newGoRuntimeBase + path.delimiter);
		}
	}

	let pathVars = defaultPathEnv.split(path.delimiter);
	pathVars = pathVars.filter((p) => p !== newGoRuntimeBase);
	pathVars.unshift(newGoRuntimeBase);
	process.env[pathEnvVar] = pathVars.join(path.delimiter);
}

// Clear terminal PATH environment modification previously installed
// using addGoRuntimeBaseToPATH.
// In particular, changes to vscode.EnvironmentVariableCollection persist across
// vscode sessions, so when we decide not to mutate PATH, we need to clear
// the preexisting changes.
export function clearGoRuntimeBaseFromPATH() {
	if (terminalCreationListener) {
		const l = terminalCreationListener;
		terminalCreationListener = undefined;
		l.dispose();
	}
	const pathEnvVar = pathEnvVarName();
	if (!pathEnvVar) {
		logVerbose(`couldn't find PATH property in process.env`);
		return;
	}
	environmentVariableCollection?.delete(pathEnvVar);
}

/**
 * update the PATH variable in the given terminal to default to the currently selected Go
 */
export async function updateIntegratedTerminal(terminal: vscode.Terminal): Promise<void> {
	if (!terminal) { return; }
	const gorootBin = path.join(getCurrentGoRoot(), 'bin');
	const defaultGoRuntime = getBinPathFromEnvVar('go', defaultPathEnv, false);
	if (defaultGoRuntime && gorootBin === path.dirname(defaultGoRuntime)) {
		return;
	}

	// append the goroot to the beginning of the PATH so it takes precedence
	// TODO: add support for more terminal names
	// this assumes all non-windows shells are bash-like.
	if (terminal.name.toLowerCase() === 'cmd') {
		terminal.sendText(`set PATH=${gorootBin};%Path%`, true);
		terminal.sendText('cls');
	} else if (['powershell', 'pwsh'].includes(terminal.name.toLowerCase())) {
		terminal.sendText(`$env:Path="${gorootBin};$env:Path"`, true);
		terminal.sendText('clear');
	} else if (terminal.name.toLowerCase() === 'fish') {
		terminal.sendText(`set -gx PATH ${gorootBin} $PATH`);
		terminal.sendText('clear');
	} else if (['bash', 'sh', 'zsh', 'ksh'].includes(terminal.name.toLowerCase())) {
		terminal.sendText(`export PATH=${gorootBin}:$PATH`, true);
		terminal.sendText('clear');
	}
}

/**
 * retreive the current selected Go from the workspace state
 */
export function getSelectedGo(): GoEnvironmentOption {
	return getFromWorkspaceState('selectedGo');
}

/**
 * return reference to the statusbar item
 */
export function getGoEnvironmentStatusbarItem(): vscode.StatusBarItem {
	return goEnvStatusbarItem;
}

export function formatGoVersion(version?: GoVersion): string {
	if (!version || !version.isValid()) {
		return `Go (unknown)`;
	}
	const versionStr = version.format(true);
	const versionWords = versionStr.split(' ');
	if (versionWords.length > 1 && versionWords[0] === 'devel') {
		// Go devel +hash
		return `Go ${versionWords[1]}`;
	} else {
		return `Go ${versionWords[0]}`;
	}
}

async function getSDKGoOptions(): Promise<GoEnvironmentOption[]> {
	// get list of Go versions
	const sdkPath = path.join(os.homedir(), 'sdk');

	if (!await pathExists(sdkPath)) {
		return [];
	}
	const readdir = promisify(fs.readdir);
	const subdirs = await readdir(sdkPath);
	// the dir happens to be the version, which will be used as the label
	// the path is assembled and used as the description
	return subdirs.map((dir: string) =>
		new GoEnvironmentOption(
			path.join(sdkPath, dir, 'bin', correctBinname('go')),
			dir.replace('go', 'Go '),
		)
	);
}

export async function getDefaultGoOption(): Promise<GoEnvironmentOption> {
	// make goroot default to go.goroot
	const goroot = getCurrentGoRoot();
	if (!goroot) {
		throw new Error('No Go command could be found.');
	}

	// set Go version and command
	const version = await getGoVersion();
	return new GoEnvironmentOption(
		path.join(goroot, 'bin', correctBinname('go')),
		formatGoVersion(version),
	);
}

/**
 * make a web request to get versions of Go
 */
interface GoVersionWebResult {
	version: string;
	stable: boolean;
	files: {
		filename: string;
		os: string;
		arch: string;
		version: string;
		sha256: string;
		size: number;
		kind: string;
	}[];
}
async function fetchDownloadableGoVersions(): Promise<GoEnvironmentOption[]> {
	// fetch information about what Go versions are available to install
	let webResults;
	try {
		webResults = await WebRequest.json<GoVersionWebResult[]>('https://golang.org/dl/?mode=json');
	} catch (error) {
		return [];
	}

	if (!webResults) {
		return [];
	}
	// turn the web result into GoEnvironmentOption model
	return webResults.reduce((opts, result: GoVersionWebResult) => {
		// TODO: allow downloading from different sites
		const dlPath = `go get golang.org/dl/${result.version}`;
		const label = result.version.replace('go', 'Go ');
		return [...opts, new GoEnvironmentOption(dlPath, label)];
	}, []);
}

export const latestGoVersionKey = 'latestGoVersions';
const oneday = 60 * 60 * 24 * 1000; // 24 hours in milliseconds

export async function getLatestGoVersions(): Promise<GoEnvironmentOption[]> {
	const timeout = oneday;
	const now = moment.now();

	let results: GoEnvironmentOption[];

	// Check if we can use cached results
	const cachedResults = getFromGlobalState(latestGoVersionKey);
	if (cachedResults && now - cachedResults.timestamp < timeout) {
		results = cachedResults.goVersions;
	} else {
		// fetch the latest supported Go versions
		try {
			// fetch the latest Go versions and cache the results
			results = await fetchDownloadableGoVersions();
			await updateGlobalState(latestGoVersionKey, {
				timestamp: now,
				goVersions: results,
			});
		} catch (e) {
			// hardcode the latest versions of Go in case golang.dl is unavailable
			results = [
				new GoEnvironmentOption('go get golang.org/dl/go1.15', 'Go 1.15'),
				new GoEnvironmentOption('go get golang.org/dl/go1.14.7', 'Go 1.14.7'),
			];
		}
	}

	return results;
}

const dismissedGoVersionUpdatesKey = 'dismissedGoVersionUpdates';

export async function offerToInstallLatestGoVersion() {
	const goConfig = getGoConfig();
	if (!goConfig['useGoProxyToCheckForToolUpdates']) {
		return;
	}

	let options = await getLatestGoVersions();

	// filter out Go versions the user has already dismissed
	let dismissedOptions: GoEnvironmentOption[];
	dismissedOptions = await getFromGlobalState(dismissedGoVersionUpdatesKey);
	if (!!dismissedOptions) {
		options = options.filter((version) => !dismissedOptions.find((x) => x.label === version.label));
	}

	// compare to current go version.
	const currentVersion = await getGoVersion();
	if (!!currentVersion) {
		options = options.filter((version) => currentVersion.lt(version.label));
	}

	// notify user that there is a newer version of Go available
	if (options.length > 0) {
		addGoStatus('Go Update Available', 'go.promptforgoinstall', 'A newer version of Go is available');
		vscode.commands.registerCommand('go.promptforgoinstall', () => {
			const download = {
				title: 'Download',
				async command() {
					await vscode.env.openExternal(vscode.Uri.parse(`https://golang.org/dl/`));
				}
			};

			const neverAgain = {
				title: `Don't Show Again`,
				async command() {
					// mark these versions as seen
					dismissedOptions = await getFromGlobalState(dismissedGoVersionUpdatesKey);
					if (!dismissedOptions) {
						dismissedOptions = [];
					}
					options.forEach((version) => {
						dismissedOptions.push(version);
					});
					await updateGlobalState(dismissedGoVersionUpdatesKey, dismissedOptions);
				}
			};

			let versionsText: string;
			if (options.length > 1) {
				versionsText = `${options.map((x) => x.label)
					.reduce((prev, next) => {
						return prev + ' and ' + next;
					})} are available`;
			} else {
				versionsText = `${options[0].label} is available`;
			}

			vscode.window
				.showInformationMessage(
					`${versionsText}. You are currently using ${formatGoVersion(currentVersion)}.`,
					download,
					neverAgain
				)
				.then((selection) => {
					removeGoStatus();
					selection.command();
				});
		});
	}
}
