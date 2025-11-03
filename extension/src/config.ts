/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// vscode.WorkspaceConfiguration.get() returns any type.
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as semver from 'semver';
import * as vscode from 'vscode';
import { extensionId } from './const';
import { getFormatTool } from './language/legacy/goFormat';
import { getFromGlobalState, updateGlobalState } from './stateUtils';

/** getGoConfig is declared as an exported const rather than a function, so it can be stubbbed in testing. */
export const getGoConfig = (uri?: vscode.Uri) => {
	return getConfig('go', uri);
};

/** getGoplsConfig returns the user's gopls configuration. */
export function getGoplsConfig(uri?: vscode.Uri) {
	return getConfig('gopls', uri);
}

function getConfig(section: string, uri?: vscode.Uri | null) {
	if (!uri) {
		if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		} else {
			uri = null;
		}
	}
	return vscode.workspace.getConfiguration(section, uri);
}

/** ExtensionInfo is a collection of static information about the extension. */
export class ExtensionInfo {
	/** Extension version */
	readonly version?: string;
	/** The application name of the editor, like 'VS Code' */
	readonly appName: string;
	/** True if the extension runs in preview mode (e.g. Nightly, prerelease) */
	readonly isPreview: boolean;
	/** True if the extension runs in well-known cloud IDEs */
	readonly isInCloudIDE: boolean;

	constructor() {
		const packageJSON = vscode.extensions.getExtension(extensionId)?.packageJSON;
		const version = semver.parse(packageJSON?.version);
		this.version = version?.format();
		this.appName = vscode.env.appName;

		// golang.go prerelease: minor version is an odd number, or has the "-dev" suffix.
		this.isPreview =
			extensionId === 'golang.go' && !!version
				? version.minor % 2 === 1 || version.toString().endsWith('-dev')
				: false;
		this.isInCloudIDE =
			process.env.CLOUD_SHELL === 'true' ||
			process.env.MONOSPACE_ENV === 'true' ||
			process.env.CODESPACES === 'true' ||
			!!process.env.GITPOD_WORKSPACE_ID;
	}
}

export const extensionInfo = new ExtensionInfo();

/**
 * FORMATTER_SUGGESTION_PREFIX_KEY is the prefix of key storing whether we
 * we have suggested user to switch from the formatter they configured
 * through "go.formatTool" to "gopls".
 * The corresponding value is type boolean indicating whether we have suggested
 * or not.
 * Right now, the only formatters we are suggesting to user are gofmt and gofumpt.
 */
export const FORMATTER_SUGGESTION_PREFIX_KEY = 'formatter-suggestion-';

/**
 * Performs cross-validation between the 'go' and 'gopls' configurations.
 *
 * This function's purpose is to detect conflicts where a setting in 'go'
 * impacts the behavior of the gopls. It should be called when relevant
 * settings in either configuration change.
 *
 * Note: This does not validate gopls settings internally, as the gopls
 * server is responsible for that itself.
 */
export async function validateConfig(
	goConfig: vscode.WorkspaceConfiguration,
	goplsConfig: vscode.WorkspaceConfiguration
) {
	// Lint tool check.
	const lintTool = goConfig.get<string>('lintTool');
	if (lintTool && lintTool === 'staticcheck' && goplsStaticcheckEnabled(goConfig, goplsConfig)) {
		const message = `Warning: staticcheck is configured to run both client side (go.lintTool=staticcheck) and server side (gopls.ui.diagnostic.staticcheck=true).
This will result in duplicate diagnostics.`;

		const selected = await vscode.window.showWarningMessage(message, 'Open Settings');
		if (selected === 'Open Settings') {
			vscode.commands.executeCommand('workbench.action.openSettingsJson');
		}
	}

	// Format tool check.
	const formatTool = getFormatTool(goConfig);
	if (formatTool === 'customFormatter') {
		const alternateTools = goConfig.get<any>('alternateTools');
		if (alternateTools === undefined || alternateTools['customFormatter'] === undefined) {
			const message =
				"Error: formatter is configured to custom (go.formatTool=custom) but custom formatter path is not provided in go.alternateTools['customFormatter']";

			const selected = await vscode.window.showWarningMessage(message, 'Open Settings');
			if (selected === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettingsJson');
			}
		}
	}

	if (formatTool !== '' && goplsConfig['formatting.gofumpt'] === true) {
		const message = `Warning: formatter is configured to run from both client side (go.formatTool=${formatTool}) and server side (gopls.formatting.gofumpt=true).
This may result in double formatting.`;

		const selected = await vscode.window.showWarningMessage(message, 'Open Settings');
		if (selected === 'Open Settings') {
			vscode.commands.executeCommand('workbench.action.openSettingsJson');
		}
	}

	if (formatTool === 'gofumpt' || formatTool === 'gofmt') {
		const key = FORMATTER_SUGGESTION_PREFIX_KEY + formatTool;

		const suggested = getFromGlobalState(key, false);
		if (!suggested) {
			updateGlobalState(key, true);
			let instructions = 'change "go.formatTool" to default value'; // gopls will use gofmt by default.
			if (formatTool === 'gofumpt') {
				instructions += ' , set "gopls.formatting.gofumpt" to true'; // gofumpt need to be enabled explicitly.
			}
			const message = `Recommendation: the format tool ${formatTool} specified is available in gopls. You can enable it by: ${instructions}`;

			const selected = await vscode.window.showWarningMessage(message, 'Open Settings');
			if (selected === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettingsJson');
			}
		}
	}
}

/**
 * Checks if the staticcheck analyzer is enabled in the gopls configuration.
 *
 * @param goConfig The 'go' extension configuration.
 * @param goplsConfig The 'gopls' configuration.
 * @returns true if staticcheck is enabled in gopls, false otherwise.
 */
export function goplsStaticcheckEnabled(
	goConfig: vscode.WorkspaceConfiguration,
	goplsConfig: vscode.WorkspaceConfiguration
): boolean {
	if (!goConfig.get<boolean>('useLanguageServer')) {
		return false;
	}

	/**
	 * Direct property access is used here instead of the standard
	 * `goplsConfig.get()` method.
	 *
	 * The `.get('a.b')` API interprets dots as a path to a nested property.
	 * However, 'gopls' configuration object has "flattened" keys that literally
	 * contain dots (e.g., the key is the string 'ui.diagnostic.staticcheck').
	 * Bracket notation is the only way to access such a property.
	 */
	if (goplsConfig['ui.diagnostic.staticcheck'] === false) {
		return false;
	}

	// "ui.diagnostic.staticcheck" unset or true means partially enabled and
	// fully enabled.
	// See https://go.googlesource.com/tools/+/refs/heads/master/gopls/doc/analyzers.md
	return true;
}
