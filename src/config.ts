/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');

const SECURITY_SENSITIVE_CONFIG: string[] = [
	'goroot', 'gopath', 'toolsGopath', 'alternateTools'
];

// Go extension configuration for a workspace.
export class Configuration {
	constructor(
		private isTrustedWorkspace: boolean,
		private getConfiguration: typeof vscode.workspace.getConfiguration) { }

	// returns a Proxied vscode.WorkspaceConfiguration, which prevents
	// from using the workspace configuration if the workspace is untrusted.
	public get<T>(uri?: vscode.Uri): vscode.WorkspaceConfiguration {
		const cfg = this.getConfiguration('go', uri);
		if (this.isTrustedWorkspace) {
			return cfg;
		}

		return new WrappedConfiguration(cfg);
	}
}

// wrappedConfiguration wraps vscode.WorkspaceConfiguration.
class WrappedConfiguration implements vscode.WorkspaceConfiguration {
	constructor(private readonly _wrapped: vscode.WorkspaceConfiguration) {
		// set getters for direct setting access (e.g. cfg.gopath), but don't overwrite _wrapped.
		const desc = Object.getOwnPropertyDescriptors(_wrapped);
		for (const prop in desc) {
			if (typeof prop === 'string' && prop !== '_wrapped') {
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
		section: string, value: any, configurationTarget?: boolean | vscode.ConfigurationTarget,
		overrideInLanguage?: boolean): Thenable<void> {
		return this._wrapped.update(section, value, configurationTarget, overrideInLanguage);
	}
}
