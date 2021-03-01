/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import { getFromWorkspaceState, updateWorkspaceState } from './stateUtils';

const WORKSPACE_IS_TRUSTED_KEY = 'WORKSPACE_IS_TRUSTED_KEY';
const SECURITY_SENSITIVE_CONFIG: string[] = ['goroot', 'gopath', 'toolsGopath', 'alternateTools', 'inferGopath'];

// Initialize the singleton defaultConfig and register related commands.
// Prompt if workspace configuration was found but had to be ignored until
// the user has to explicitly opt in to trust the workspace.
export async function initConfig(ctx: vscode.ExtensionContext) {
	const isTrusted = getFromWorkspaceState(WORKSPACE_IS_TRUSTED_KEY, false);
	if (isTrusted !== defaultConfig.workspaceIsTrusted()) {
		defaultConfig.toggleWorkspaceIsTrusted();
	}
	ctx.subscriptions.push(vscode.commands.registerCommand('go.workspace.isTrusted.toggle', toggleWorkspaceIsTrusted));

	if (isTrusted) {
		return;
	}
	const ignored = ignoredWorkspaceConfig(vscode.workspace.getConfiguration('go'), SECURITY_SENSITIVE_CONFIG);
	if (ignored.length === 0) {
		return;
	}
	const ignoredSettings = ignored.map((x) => `"go.${x}"`).join(',');
	const val = await vscode.window.showWarningMessage(
		`Some workspace/folder-level settings (${ignoredSettings}) from the untrusted workspace are disabled ` +
			'by default. If this workspace is trusted, explicitly enable the workspace/folder-level settings ' +
			'by running the "Go: Toggle Workspace Trust Flag" command.',
		'OK',
		'Trust This Workspace',
		'More Info'
	);
	switch (val) {
		case 'Trust This Workspace':
			await toggleWorkspaceIsTrusted();
			break;
		case 'More Info':
			vscode.env.openExternal(
				vscode.Uri.parse('https://github.com/golang/vscode-go/blob/master/docs/settings.md#security')
			);
			break;
		default:
			break;
	}
}

function ignoredWorkspaceConfig(cfg: vscode.WorkspaceConfiguration, keys: string[]) {
	return keys.filter((key) => {
		const inspect = cfg.inspect(key);
		return inspect.workspaceValue !== undefined || inspect.workspaceFolderValue !== undefined;
	});
}

async function toggleWorkspaceIsTrusted() {
	const v = defaultConfig.toggleWorkspaceIsTrusted();
	await updateWorkspaceState(WORKSPACE_IS_TRUSTED_KEY, v);
}

// Go extension configuration for a workspace.
export class Configuration {
	constructor(private _workspaceIsTrusted = false, private getConfiguration = vscode.workspace.getConfiguration) {}

	public toggleWorkspaceIsTrusted() {
		this._workspaceIsTrusted = !this._workspaceIsTrusted;
		return this._workspaceIsTrusted;
	}

	// returns a Proxied vscode.WorkspaceConfiguration, which prevents
	// from using the workspace configuration if the workspace is untrusted.
	public get(section: string, uri?: vscode.Uri): vscode.WorkspaceConfiguration {
		const cfg = this.getConfiguration(section, uri);
		if (section !== 'go' || this._workspaceIsTrusted) {
			return cfg;
		}
		return new WrappedConfiguration(cfg);
	}

	public workspaceIsTrusted(): boolean {
		return this._workspaceIsTrusted;
	}
}

const defaultConfig = new Configuration();

// Returns the workspace Configuration used by the extension.
export function DefaultConfig() {
	return defaultConfig;
}

// wrappedConfiguration wraps vscode.WorkspaceConfiguration.
class WrappedConfiguration implements vscode.WorkspaceConfiguration {
	constructor(private readonly _wrapped: vscode.WorkspaceConfiguration) {
		// set getters for direct setting access (e.g. cfg.gopath), but don't overwrite _wrapped.
		const desc = Object.getOwnPropertyDescriptors(_wrapped);
		for (const prop in desc) {
			// TODO(hyangah): find a better way to exclude WrappedConfiguration's members.
			// These methods are defined by WrappedConfiguration.
			if (typeof prop === 'string' && !['get', 'has', 'inspect', 'update', '_wrapped'].includes(prop)) {
				const d = desc[prop];
				if (SECURITY_SENSITIVE_CONFIG.includes(prop)) {
					const inspect = this._wrapped.inspect(prop);
					d.value = inspect.globalValue ?? inspect.defaultValue;
				}
				Object.defineProperty(this, prop, desc[prop]);
			}
		}
	}

	public get(section: any, defaultValue?: any) {
		if (SECURITY_SENSITIVE_CONFIG.includes(section)) {
			const inspect = this._wrapped.inspect(section);
			return inspect.globalValue ?? defaultValue ?? inspect.defaultValue;
		}
		return this._wrapped.get(section, defaultValue);
	}
	public has(section: string) {
		return this._wrapped.has(section);
	}
	public inspect<T>(section: string) {
		return this._wrapped.inspect<T>(section);
	}
	public update(
		section: string,
		value: any,
		configurationTarget?: boolean | vscode.ConfigurationTarget,
		overrideInLanguage?: boolean
	): Thenable<void> {
		return this._wrapped.update(section, value, configurationTarget, overrideInLanguage);
	}
}

// getGoConfig is declared as an exported const rather than a function, so it can be stubbbed in testing.
export const getGoConfig = (uri?: vscode.Uri) => {
	return getConfig('go', uri);
};

// getGoplsConfig returns the user's gopls configuration.
export function getGoplsConfig(uri?: vscode.Uri) {
	return getConfig('gopls', uri);
}

function getConfig(section: string, uri?: vscode.Uri) {
	if (!uri) {
		if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		} else {
			uri = null;
		}
	}
	return defaultConfig.get(section, uri);
}

// True if the extension is running in known cloud-based IDEs.
export const IsInCloudIDE = process.env.CLOUD_SHELL === 'true' || process.env.CODESPACES === 'true';
