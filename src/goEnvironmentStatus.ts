/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import fs = require('fs-extra');
import os = require('os');
import path = require('path');
import vscode = require('vscode');

import { updateGoVarsFromConfig } from './goInstallTools';
import { getCurrentGoRoot } from './goPath';
import { getFromWorkspaceState, updateWorkspaceState } from './stateUtils';
import { getGoVersion } from './util';

interface GoEnvironmentOption {
	path: string;
	label: string;
}

// statusbar item for switching the Go environment
let goEnvStatusbarItem: vscode.StatusBarItem;

/**
 * Initialize the status bar item with current Go binary
 */
export async function initGoStatusBar() {
	if (!goEnvStatusbarItem) {
		goEnvStatusbarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	}
	// set Go version and command
	const version = await getGoVersion();

	hideGoStatusBar();
	goEnvStatusbarItem.text = formatGoVersion(version.format());
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

	// get list of Go versions
	const sdkPath = path.join(os.homedir(), 'sdk');
	if (!await fs.pathExists(sdkPath)) {
		vscode.window.showErrorMessage(`SDK path does not exist: ${sdkPath}`);
		return;
	}
	const subdirs = await fs.readdir(sdkPath);

	// create quick pick items
	// the dir happens to be the version, which will be used as the label
	// the path is assembled and used as the description
	const goSdkOptions: vscode.QuickPickItem[] = subdirs.map((dir: string) => {
		return {
			label: dir.replace('go', 'Go '),
			description: path.join(sdkPath, dir, 'bin', 'go'),
		};
	});

	// get default option
	let defaultOption: vscode.QuickPickItem;
	try {
		const defaultGo = await getDefaultGoOption();
		defaultOption = {
			label: defaultGo.label,
			description: defaultGo.path
		};
	} catch (err) {
		vscode.window.showErrorMessage(err.message);
		return;
	}

	// dedup options by eliminating duplicate paths (description)
	const options = [defaultOption, ...goSdkOptions].reduce((opts, nextOption) => {
		if (opts.find((op) => op.description === nextOption.description)) {
			return opts;
		}
		return [...opts, nextOption];
	}, [] as vscode.QuickPickItem[]);

	// show quick pick to select new go version
	const { label, description } = await vscode.window.showQuickPick<vscode.QuickPickItem>(options);
	vscode.window.showInformationMessage(`Current GOROOT: ${description}`);

	// update currently selected go
	await setSelectedGo({
		label,
		path: description,
	});
}

/**
 * update the selected go path and label in the workspace state
 */
async function setSelectedGo(selectedGo: GoEnvironmentOption) {
	// the go-environment state should follow the below format
	// TODO: restart language server when the Go binary is switched
	// TODO: determine if changes to settings.json need to be made
	await updateWorkspaceState('selected-go', selectedGo);
	goEnvStatusbarItem.text = selectedGo.label;
}

/**
 * retreive the current selected Go from the workspace state
 */
export async function getSelectedGo(): Promise<GoEnvironmentOption> {
	return await getFromWorkspaceState('selected-go');
}

/**
 * return reference to the statusbar item
 */
export function getGoEnvironmentStatusbarItem(): vscode.StatusBarItem {
	return goEnvStatusbarItem;
}

export async function getActiveGoRoot(): Promise<string | undefined> {
	// look for current current go binary
	let goroot = getCurrentGoRoot();
	if (!goroot) {
		await updateGoVarsFromConfig();
		goroot = getCurrentGoRoot();
	}
	return goroot || undefined;
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

export async function getDefaultGoOption(): Promise<GoEnvironmentOption> {
	// make goroot default to go.goroot
	const goroot = await getActiveGoRoot();
	if (!goroot) {
		throw new Error('No Go command could be found.');
	}

	// set Go version and command
	const version = await getGoVersion();
	return {
		path: path.join(goroot, 'bin', 'go'),
		label: formatGoVersion(version.format()),
	};
}
