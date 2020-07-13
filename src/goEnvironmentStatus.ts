/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import cp = require('child_process');
import fs = require('fs');
import os = require('os');
import path = require('path');
import { promisify } from 'util';
import vscode = require('vscode');
import WebRequest = require('web-request');
import { toolInstallationEnvironment } from './goEnv';
import { getCurrentGoRoot, pathExists } from './goPath';
import { outputChannel } from './goStatus';
import { getBinPath, getGoConfig, getGoVersion, getTempFilePath, rmdirRecursive } from './util';

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

// statusbar item for switching the Go environment
let goEnvStatusbarItem: vscode.StatusBarItem;
let terminalCreationListener: vscode.Disposable;

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar() {
	if (!goEnvStatusbarItem) {
		goEnvStatusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	}
	// set Go version and command
	const version = await getGoVersion();
	const goOption = new GoEnvironmentOption(version.binaryPath, formatGoVersion(version.format()));

	// ensure terminals use the correct Go version
	if (!terminalCreationListener) {
		updateIntegratedTerminal(vscode.window.activeTerminal);
		terminalCreationListener = vscode.window.onDidOpenTerminal(updateIntegratedTerminal);
	}

	hideGoStatusBar();
	goEnvStatusbarItem.text = goOption.label;
	goEnvStatusbarItem.command = 'go.environment.choose';
	showGoStatusBar();
}

/**
 * disable the Go environment status bar item
 */
export function disposeGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.dispose();
	}
	if (!!terminalCreationListener) {
		terminalCreationListener.dispose();
	}
}

/**
 * Show the Go Environment statusbar item on the statusbar
 */
export function showGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.show();
	}
}

/**
 * Hide the Go Environment statusbar item from the statusbar
 */
export function hideGoStatusBar() {
	if (!!goEnvStatusbarItem) {
		goEnvStatusbarItem.hide();
	}
}

/**
 * Present a command palette menu to the user to select their go binary
 */
export async function chooseGoEnvironment() {
	if (!goEnvStatusbarItem) {
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
	const options = [defaultQuickPick, ...goSDKQuickPicks, ...uninstalledQuickPicks].reduce((opts, nextOption) => {
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
		await setSelectedGo(GoEnvironmentOption.fromQuickPickItem(selection), vscode.ConfigurationTarget.Workspace);
		vscode.window.showInformationMessage(`Switched to ${selection.label}`);
	} catch (e) {
		vscode.window.showErrorMessage(e.message);
	}
}

/**
 * update the selected go path and label in the workspace state
 */
export async function setSelectedGo(
	selectedGo: GoEnvironmentOption, scope: vscode.ConfigurationTarget, promptReload = true
) {
	const execFile = promisify(cp.execFile);

	const goConfig = getGoConfig();
	const alternateTools: any = goConfig.get('alternateTools') || {};
	// if the selected go version is not installed, install it
	if (selectedGo.binpath.startsWith('go get')) {
		// start a loading indicator
		await vscode.window.withProgress({
			title: `Downloading ${selectedGo.label}`,
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
			const [, ...args] = selectedGo.binpath.split(' ');
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
				await execFile(goXExecutable, ['download'], { env });
			} catch (downloadErr) {
				outputChannel.appendLine(`Error finishing installation: ${downloadErr}`);
				throw new Error('Could not download Go version.');
			}

			outputChannel.appendLine('Finding newly downloaded Go');
			const sdkPath = path.join(process.env.HOME, 'sdk');
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

			const binpath = path.join(sdkPath, dir, 'bin', 'go');
			const newAlternateTools = {
				...alternateTools,
				go: binpath,
			};
			await goConfig.update('alternateTools', newAlternateTools, scope);
			goEnvStatusbarItem.text = selectedGo.label;

			outputChannel.appendLine('Updating integrated terminals');
			vscode.window.terminals.forEach(updateIntegratedTerminal);

			// remove tmp directories
			outputChannel.appendLine('Cleaning up...');
			rmdirRecursive(toolsTmpDir);
			outputChannel.appendLine('Success!');
		});
	} else {
		const newAlternateTools = {
			...alternateTools,
			go: selectedGo.binpath,
		};
		await goConfig.update('alternateTools', newAlternateTools, scope);
		goEnvStatusbarItem.text = selectedGo.label;
	}
	// prompt the user to reload the window
	// promptReload defaults to true and should only be false for tests
	if (promptReload) {
		const choice = await vscode.window.showInformationMessage('Please reload the window to finish applying changes.', 'Reload Window');
		if (choice === 'Reload Window') {
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}
}

/**
 * update the PATH variable in the given terminal to default to the currently selected Go
 */
export async function updateIntegratedTerminal(terminal: vscode.Terminal) {
	if (!terminal) { return; }
	const goroot = path.join(getCurrentGoRoot(), 'bin');
	const isWindows = terminal.name.toLowerCase() === 'powershell' || terminal.name.toLowerCase() === 'cmd';

	// append the goroot to the beginning of the PATH so it takes precedence
	// TODO: add support for more terminal names
	// this assumes all non-windows shells are bash-like.
	if (isWindows) {
		terminal.sendText(`set PATH=${goroot};%Path%`, true);
		terminal.sendText('cls');
	} else {
		terminal.sendText(`export PATH=${goroot}:$PATH`, true);
		terminal.sendText('clear');
	}
}

/**
 * retreive the current selected Go from the workspace state
 */
export async function getSelectedGo(): Promise<GoEnvironmentOption> {
	const goVersion = await getGoVersion();
	return new GoEnvironmentOption(goVersion.binaryPath, formatGoVersion(goVersion.format()));
}

/**
 * return reference to the statusbar item
 */
export function getGoEnvironmentStatusbarItem(): vscode.StatusBarItem {
	return goEnvStatusbarItem;
}

export function formatGoVersion(version: string): string {
	const versionWords = version.split(' ');
	if (versionWords[0] === 'devel') {
		// Go devel +hash
		return `Go ${versionWords[0]} ${versionWords[4]}`;
	} else if (versionWords.length > 0) {
		// some other version format
		return `Go ${version.substr(0, 8)}`;
	} else {
		// default semantic version format
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
			path.join(sdkPath, dir, 'bin', 'go'),
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
		path.join(goroot, 'bin', 'go'),
		formatGoVersion(version.format()),
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
	const webResults = await WebRequest.json<GoVersionWebResult[]>('https://golang.org/dl/?mode=json');
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
