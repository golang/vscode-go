/* eslint-disable no-prototype-builtins */
/* eslint-disable prefer-const */
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
import semverCoerce from 'semver/functions/coerce';
import { getGoConfig, extensionInfo } from './config';
import { toolInstallationEnvironment } from './goEnv';
import { addGoStatus, goEnvStatusbarItem, outputChannel, removeGoStatus } from './goStatus';
import { getFromGlobalState, getFromWorkspaceState, updateGlobalState, updateWorkspaceState } from './stateUtils';
import { getBinPath, getCheckForToolsUpdatesConfig, getGoVersion, GoVersion } from './util';
import {
	correctBinname,
	executableFileExists,
	fixDriveCasingInWindows,
	getBinPathFromEnvVar,
	getCurrentGoRoot,
	dirExists
} from './utils/pathUtils';
import vscode = require('vscode');
import { installTool } from './goInstallTools';
import { CommandFactory } from './commands';
import fetch from 'node-fetch';

export class GoEnvironmentOption implements vscode.QuickPickItem {
	readonly description: string;
	constructor(readonly binpath: string, readonly label: string, readonly available = true) {
		this.description = available ? binpath : `download ${binpath}`;
	}
}

export let terminalCreationListener: vscode.Disposable | undefined;

let environmentVariableCollection: vscode.EnvironmentVariableCollection;
export function setEnvironmentVariableCollection(env: vscode.EnvironmentVariableCollection) {
	environmentVariableCollection = env;
}

// QuickPickItem names for chooseGoEnvironment menu.
const CLEAR_SELECTION = '$(clear-all) Clear selection';
const CHOOSE_FROM_FILE_BROWSER = '$(folder) Choose from file browser';

function canChooseGoEnvironment() {
	// if there is no workspace, show GOROOT with message
	if (!vscode.workspace.name) {
		return { ok: false, reason: 'Switching Go version is not yet supported in single-file mode.' };
	}

	if (getGoConfig().get('goroot')) {
		return { ok: false, reason: 'Switching Go version when "go.goroot" is set is unsupported.' };
	}

	if (process.env['GOROOT']) {
		return { ok: false, reason: 'Switching Go version when process.env["GOROOT"] is set is unsupported.' };
	}

	return { ok: true };
}

/**
 * Presents a command palette menu to the user to select their go binary.
 */
export const chooseGoEnvironment: CommandFactory = () => async () => {
	if (!goEnvStatusbarItem) {
		return;
	}
	const { ok, reason } = canChooseGoEnvironment();
	if (!ok) {
		vscode.window.showInformationMessage(`GOROOT: ${getCurrentGoRoot()}. ${reason}`);
		return;
	}

	let options: vscode.QuickPickItem[] = [
		// Option to choose go binary from file browser.
		{
			label: CHOOSE_FROM_FILE_BROWSER,
			description: 'Select the go binary to use'
		},
		// Option to clear the existing selection.
		{ label: CLEAR_SELECTION }
	];
	try {
		const seenDescriptions = new Set<string>();
		const seenLabels = new Set<string>();
		// addOption adds the option to the input array only if it is unique,
		// based on its description and label.
		const addOption = (options: GoEnvironmentOption[], option: GoEnvironmentOption | undefined) => {
			if (option === undefined) {
				return;
			}
			if (!seenDescriptions.has(option.description) && !seenLabels.has(option.label)) {
				seenDescriptions.add(option.description);
				seenLabels.add(option.label);
				options.push(option);
			}
		};

		const defaultOption = await Promise.resolve(getDefaultGoOption());
		const goSDKOptions = await getSDKGoOptions();

		const local: GoEnvironmentOption[] = [];
		addOption(local, defaultOption);
		goSDKOptions.forEach((option) => addOption(local, option));

		if (local.length > 0) {
			options.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Locally discovered' });
			options.push(...local);
		}

		const downloadableOptions = await getDownloadableGoVersions();
		const downloadable: GoEnvironmentOption[] = [];
		downloadableOptions.forEach((option) => addOption(downloadable, option));

		if (downloadable.length > 0) {
			options.push({ kind: vscode.QuickPickItemKind.Separator, label: 'Downloadable' });
			options.push(...downloadable);
		}
	} catch (e) {
		vscode.window.showErrorMessage((e as Error).message);
		return;
	}

	// Get user's selection, return if none was made.
	const selection = await vscode.window.showQuickPick<vscode.QuickPickItem>(options);
	if (!selection) {
		return;
	}

	// Update currently selected go.
	try {
		await setSelectedGo(selection);
	} catch (e) {
		vscode.window.showErrorMessage((e as Error).message);
	}
};

/**
 * Updates the selected go path and label in the workspace state.
 * @returns true if set successfully, false otherwise.
 */
export async function setSelectedGo(goOption: vscode.QuickPickItem, promptReload = true): Promise<boolean> {
	if (!goOption) {
		return false;
	}

	// If the selected go version is not installed, install it.
	if (goOption instanceof GoEnvironmentOption) {
		const o = goOption.available ? (goOption as GoEnvironmentOption) : await downloadGo(goOption);
		// Check that the given binary is not already at the beginning of the PATH.
		const go = await getGoVersion();
		if (!!go && (go.binaryPath === o.binpath || 'Go ' + go.format() === o.label)) {
			return false;
		}
		await updateWorkspaceState('selectedGo', o);
	} else if (goOption.label === CLEAR_SELECTION) {
		if (!getSelectedGo()) {
			return false; // do nothing.
		}
		await updateWorkspaceState('selectedGo', undefined);
	} else if (goOption.label === CHOOSE_FROM_FILE_BROWSER) {
		const currentGOROOT = getCurrentGoRoot();
		const defaultUri = currentGOROOT ? vscode.Uri.file(path.join(currentGOROOT, 'bin')) : undefined;

		const newGoUris = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			defaultUri
		});
		if (!newGoUris || newGoUris.length !== 1) {
			return false;
		}
		const newGoBin = fixDriveCasingInWindows(newGoUris[0].fsPath);
		const oldGoBin = fixDriveCasingInWindows(path.join(defaultUri?.fsPath ?? '', correctBinname('go')));

		if (newGoBin === oldGoBin) {
			return false;
		}
		if (!executableFileExists(newGoBin)) {
			vscode.window.showErrorMessage(`${newGoBin} is not an executable`);
			return false;
		}
		let newGo: GoVersion | undefined;
		try {
			newGo = await getGoVersion(newGoBin);
			await updateWorkspaceState('selectedGo', new GoEnvironmentOption(newGo.binaryPath, formatGoVersion(newGo)));
		} catch (e) {
			if (!newGo || !newGo.isValid()) {
				vscode.window.showErrorMessage(`failed to get "${newGoBin} version", invalid Go binary:\n${e}`);
				return false;
			}
		}
	}
	// Show modal dialog to the user to reload the window, this require user's
	// immediate attention.
	// promptReload defaults to true and should only be false for tests.
	if (promptReload) {
		const choice = await vscode.window.showWarningMessage(
			'Please reload the window to finish applying Go version changes.',
			{
				modal: true
			},
			'Reload Window'
		);
		if (choice === 'Reload Window') {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}
	goEnvStatusbarItem.text = 'Go: reload required';
	goEnvStatusbarItem.command = 'workbench.action.reloadWindow';

	return true;
}

/**
 * Downloads the specified go version available in dl.golang.org.
 */
async function downloadGo(goOption: GoEnvironmentOption): Promise<GoEnvironmentOption> {
	if (goOption.available) {
		return Promise.resolve(goOption);
	}
	const execFile = promisify(cp.execFile);
	const newExecutableName = goOption.binpath.split('/').splice(-1)[0];

	return await vscode.window.withProgress(
		{
			title: `Downloading ${goOption.label}`,
			location: vscode.ProgressLocation.Notification
		},
		async () => {
			outputChannel.info(`go install ${goOption.binpath}@latest`);
			const result = await installTool({
				name: newExecutableName,
				importPath: goOption.binpath,
				modulePath: goOption.binpath,
				description: newExecutableName,
				isImportant: false
			});
			if (result) {
				outputChannel.error(`Error installing ${goOption.binpath}: ${result}`);
				throw new Error(`Could not install ${goOption.binpath} - check logs in the "Go" output channel`);
			}
			// run `goX.X download`
			const goXExecutable = getBinPath(newExecutableName);
			outputChannel.info(`${goXExecutable} download`);
			try {
				await execFile(goXExecutable, ['download']);
			} catch (downloadErr) {
				outputChannel.error(`Error finishing installation: ${downloadErr}`);
				throw new Error('Could not download Go version.');
			}

			outputChannel.info(`Checking newly downloaded ${goOption.label} SDK`);

			let sdkPath = '';
			try {
				const { stdout } = await execFile(goXExecutable, ['env', 'GOROOT'], {
					env: toolInstallationEnvironment()
				});
				if (stdout) {
					sdkPath = stdout.trim();
				}
			} catch (downloadErr) {
				outputChannel.error(`Error finishing installation: ${downloadErr}`);
				throw new Error('Could not download Go version.');
			}
			if (!sdkPath || !(await dirExists(sdkPath))) {
				outputChannel.error(`SDK path does not exist: ${sdkPath}`);
				throw new Error(`SDK path does not exist: ${sdkPath}`);
			}

			outputChannel.info(`${goOption.label} is available in ${sdkPath}`);

			const binpath = path.join(sdkPath, 'bin', correctBinname('go'));
			const newOption = new GoEnvironmentOption(binpath, goOption.label);
			outputChannel.info('Success!');
			return newOption;
		}
	);
}

/**
 * PATH value cached before addGoRuntimeBaseToPath modified.
 */
let defaultPathEnv = '';

function pathEnvVarName(): string | undefined {
	if (process.env.hasOwnProperty('PATH')) {
		return 'PATH';
	} else if (process.platform === 'win32' && process.env.hasOwnProperty('Path')) {
		return 'Path';
	} else {
		return;
	}
}

/**
 * These options overwrite profiles such as `.bashrc`.
 * Users who do not want this behavior should set `go.terminal.activateEnvironment` to `false`.
 */
const envVarMutatorOptions: vscode.EnvironmentVariableMutatorOptions = {
	applyAtProcessCreation: true,
	applyAtShellIntegration: true
};

/**
 * addGoRuntimeBaseToPATH adds the given path to the front of the PATH
 * environment variable. It removes duplicates.
 * TODO: can we avoid changing PATH but utilize toolExecutionEnv?
 */
export function addGoRuntimeBaseToPATH(newGoRuntimeBase: string) {
	if (!newGoRuntimeBase) {
		return;
	}
	const goCfg = getGoConfig();
	if (!goCfg.get('terminal.activateEnvironment')) {
		return;
	}
	const pathEnvVar = pathEnvVarName();
	if (!pathEnvVar) {
		outputChannel.debug("couldn't find PATH property in process.env");
		return;
	}

	if (!defaultPathEnv) {
		// cache the default value
		defaultPathEnv = <string>process.env[pathEnvVar];
	}

	outputChannel.debug(`addGoRuntimeBase(${newGoRuntimeBase}) when PATH=${defaultPathEnv}`);

	// Calling this multiple times will override the previous value.
	// environmentVariableCollection.clear();
	if (process.platform !== 'darwin') {
		environmentVariableCollection?.prepend(pathEnvVar, newGoRuntimeBase + path.delimiter, envVarMutatorOptions);
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
			(vscode.workspace.getConfiguration('terminal.integrated.shellArgs').get('osx') || [])
		);
		if (terminalShellArgs.includes('-l') || terminalShellArgs.includes('--login')) {
			for (const term of vscode.window.terminals) {
				updateIntegratedTerminal(term);
			}
			if (terminalCreationListener) {
				terminalCreationListener.dispose();
			}
			terminalCreationListener = vscode.window.onDidOpenTerminal(updateIntegratedTerminal);
		} else {
			environmentVariableCollection?.prepend(
				pathEnvVar,
				newGoRuntimeBase + path.delimiter,
				envVarMutatorOptions
			);
		}
	}

	let pathVars = defaultPathEnv.split(path.delimiter);
	pathVars = pathVars.filter((p) => p !== newGoRuntimeBase);
	pathVars.unshift(newGoRuntimeBase);
	process.env[pathEnvVar] = pathVars.join(path.delimiter);
}
/**
 * Clears terminal PATH environment modification previously installed using
 * addGoRuntimeBaseToPATH.
 * In particular, changes to vscode.EnvironmentVariableCollection persist across
 * vscode sessions, so when we decide not to mutate PATH, we need to clear the
 * preexisting changes.
 */
export function clearGoRuntimeBaseFromPATH() {
	if (terminalCreationListener) {
		const l = terminalCreationListener;
		terminalCreationListener = undefined;
		l.dispose();
	}
	const pathEnvVar = pathEnvVarName();
	if (!pathEnvVar) {
		outputChannel.debug("couldn't find PATH property in process.env");
		return;
	}
	environmentVariableCollection?.delete(pathEnvVar);
}

function isTerminalOptions(
	opts: vscode.TerminalOptions | vscode.ExtensionTerminalOptions
): opts is vscode.TerminalOptions {
	return 'shellPath' in opts;
}

/**
 * Updates the PATH variable in the given terminal to default to the currently
 * selected Go.
 */
export async function updateIntegratedTerminal(terminal: vscode.Terminal): Promise<void> {
	if (
		!terminal ||
		// Don't interfere if this terminal was created to run a Go task (goTaskProvider.ts).
		// Go task uses ProcessExecution which results in the terminal having `go` or `go.exe`
		// as its shellPath.
		(isTerminalOptions(terminal.creationOptions) &&
			path.basename(terminal.creationOptions.shellPath || '') === correctBinname('go'))
	) {
		return;
	}
	const gorootBin = path.join(getCurrentGoRoot(), 'bin');
	const defaultGoRuntime = getBinPathFromEnvVar('go', defaultPathEnv, false);
	if (defaultGoRuntime && gorootBin === path.dirname(defaultGoRuntime)) {
		return;
	}

	// Append the goroot to the beginning of the PATH so it takes precedence.
	// TODO: add support for more terminal names
	if (vscode.env.shell.search(/(powershell|pwsh)$/i) !== -1) {
		terminal.sendText(`$env:Path="${gorootBin};$env:Path"`, true);
		terminal.sendText('clear');
	} else if (vscode.env.shell.search(/fish$/i) !== -1) {
		terminal.sendText(`set -gx PATH ${gorootBin} $PATH`);
		terminal.sendText('clear');
	} else if (vscode.env.shell.search(/\/(bash|sh|zsh|ksh)$/i) !== -1) {
		terminal.sendText(`export PATH=${gorootBin}:$PATH`, true);
		terminal.sendText('clear');
	}
}

/**
 * Retreives the current selected Go from the workspace state.
 */
export function getSelectedGo(): GoEnvironmentOption {
	return getFromWorkspaceState('selectedGo');
}

/**
 * @returns reference to the statusbar item.
 */
export function getGoEnvironmentStatusbarItem(): vscode.StatusBarItem {
	return goEnvStatusbarItem;
}

export function formatGoVersion(version?: GoVersion): string {
	if (!version || !version.isValid()) {
		return '(unknown)';
	}
	const versionStr = version.format(true);
	const versionWords = versionStr.split(' ');
	if (versionWords.length > 1 && versionWords[0] === 'devel') {
		// go devel +hash or go devel go1.17-hash
		return versionWords[1].startsWith('go') ? `${versionWords[1].slice(2)}` : `${versionWords[1]}`;
	} else {
		return `${versionWords[0]}`;
	}
}

/**
 * @returns go versions available in `$HOME/sdk`.
 */
async function getSDKGoOptions(): Promise<GoEnvironmentOption[]> {
	// Get list of Go versions.
	const sdkPath = path.join(os.homedir(), 'sdk');

	if (!(await dirExists(sdkPath))) {
		return [];
	}
	const readdir = promisify(fs.readdir);
	const subdirs = await readdir(sdkPath);
	const stat = promisify(fs.stat);

	// The dir happens to be the version, which will be used as the label.
	// The path is assembled and used as the description.
	const options = await Promise.all(
		subdirs.map(async (dir) => {
			const binpath = path.join(sdkPath, dir, 'bin', correctBinname('go'));
			try {
				if ((await stat(binpath)).isFile()) {
					return new GoEnvironmentOption(binpath, dir.replace('go', 'Go '));
				}
			} catch {
				// ignore
			}
		})
	);
	return options.filter(Boolean) as GoEnvironmentOption[];
}

export async function getDefaultGoOption(): Promise<GoEnvironmentOption | undefined> {
	// Make goroot default to "go.goroot" in vscode-go settings.
	const goroot = getCurrentGoRoot();
	if (!goroot) {
		return undefined;
	}

	// Set Go version and command.
	const version = await getGoVersion();
	return new GoEnvironmentOption(path.join(goroot, 'bin', correctBinname('go')), formatGoVersion(version));
}

/**
 * Makes a web request to get versions of Go.
 */
interface GoVersionWebResult {
	version: string;
	stable: boolean;
}
/**
 * @returns downloadable go versions from `golang.org/dl`.
 */
async function getDownloadableGoVersions(): Promise<GoEnvironmentOption[]> {
	// TODO: use `go list -m --versions -json go` when go1.20+ is the minimum supported version.
	// fetch information about what Go versions are available to install
	let webResults;
	try {
		const response = await fetch('https://go.dev/dl/?mode=json');
		webResults = (await response.json()) as GoVersionWebResult[];
	} catch (error) {
		return [];
	}

	if (!webResults) {
		return [];
	}
	// Turn the web result into GoEnvironmentOption model.
	return webResults.reduce((opts: GoEnvironmentOption[], result: GoVersionWebResult) => {
		// TODO: allow downloading from different sites
		const dlPath = `golang.org/dl/${result.version}`;
		const label = result.version.replace('go', 'Go ');
		return [...opts, new GoEnvironmentOption(dlPath, label, false)];
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
		// Fetch the latest supported Go versions.
		try {
			// Fetch the latest Go versions and cache the results.
			results = await getDownloadableGoVersions();
			await updateGlobalState(latestGoVersionKey, {
				timestamp: now,
				goVersions: results
			});
		} catch (e) {
			results = [];
		}
	}

	return results;
}

const STATUS_BAR_ITEM_NAME = 'Go Update Notification';

/**
 * Key for the global state that tracks Go versions for which the user has
 * explicitly dismissed the upgrade notification.
 */
const DISMISSED_GO_VERSION_KEY = 'dismissedGoVersionUpdates';

export async function offerToInstallLatestGoVersion(ctx: Pick<vscode.ExtensionContext, 'subscriptions'>) {
	if (extensionInfo.isInCloudIDE) {
		// TODO: As we use the language status bar, the notification is less visible
		// and we can consider to remove this condition check.
		return;
	}
	const goConfig = getGoConfig();
	const checkForUpdate = getCheckForToolsUpdatesConfig(goConfig);
	if (checkForUpdate === 'off' || checkForUpdate === 'local') {
		// 'proxy' or misconfiguration..
		return;
	}

	let latestVersions = await getLatestGoVersions();

	const currentVersion = await getGoVersion();

	// The official support for vscode-go is last three minor versions of Go.
	// Try to start with last four minor versions.
	let minimumVersion = semverCoerce(latestVersions[0].label);
	if (minimumVersion) {
		minimumVersion.minor = minimumVersion.minor - 3;
		minimumVersion.patch = 0;
	}

	const download = {
		title: 'Download',
		async command() {
			await vscode.env.openExternal(vscode.Uri.parse('https://go.dev/dl/'));
		}
	};

	// Popup if the Go version is beyond support.
	if (minimumVersion && currentVersion.lt(minimumVersion.format())) {
		let text = `The minimum supported Go version is ${minimumVersion.format()}. Please update your Go to ensure the extension functions correctly. You are currently using ${formatGoVersion(
			currentVersion
		)}.`;
		vscode.window.showInformationMessage(text, download).then((selection) => {
			selection?.command();
		});
	}

	// Filter out Go versions the user has already dismissed.
	const dismissedVersions: GoEnvironmentOption[] = await getFromGlobalState(DISMISSED_GO_VERSION_KEY);
	if (dismissedVersions) {
		latestVersions = latestVersions.filter((version) => !dismissedVersions.find((x) => x.label === version.label));
	}

	// Filter out Go versions below the current go versions.
	if (currentVersion) {
		latestVersions = latestVersions.filter((version) => currentVersion.lt(version.label));
	}

	// Notify user that there is a newer version of Go available.
	if (latestVersions.length > 0) {
		ctx.subscriptions.push(
			vscode.commands.registerCommand('go.promptforgoinstall', () => {
				const neverAgain = {
					title: "Don't Show Again",
					async command() {
						// Mark these versions as seen.
						let dismissedVersions: GoEnvironmentOption[] = await getFromGlobalState(
							DISMISSED_GO_VERSION_KEY
						);
						if (!dismissedVersions) {
							dismissedVersions = [];
						}
						latestVersions.forEach((version) => {
							dismissedVersions.push(version);
						});
						await updateGlobalState(DISMISSED_GO_VERSION_KEY, dismissedVersions);
					}
				};

				let text: string;
				if (latestVersions.length > 1) {
					text = `${latestVersions
						.map((x) => x.label)
						.reduce((prev, next) => {
							return prev + ' and ' + next;
						})} are available`;
				} else {
					text = `${latestVersions[0].label} is available.`;
				}
				text = text + ` You are currently using ${formatGoVersion(currentVersion)}.`;
				vscode.window.showInformationMessage(text, download, neverAgain).then((selection) => {
					selection?.command();
					removeGoStatus(STATUS_BAR_ITEM_NAME);
				});
			})
		);

		const statusBarItem = addGoStatus(STATUS_BAR_ITEM_NAME);
		statusBarItem.name = STATUS_BAR_ITEM_NAME;
		statusBarItem.text = 'New Go version is available';
		statusBarItem.detail = latestVersions.map((x) => x.label).join(', ');
		statusBarItem.command = {
			title: 'Upgrade',
			command: 'go.promptforgoinstall',
			arguments: [latestVersions],
			tooltip: 'Upgrade or silence notification'
		};
		// TODO: Error level is more visible. Consider to make it configurable?
		statusBarItem.severity = vscode.LanguageStatusSeverity.Warning;
	}
}
