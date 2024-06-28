/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
'use strict';
import vscode = require('vscode');

// tslint:disable: no-any
export class MockCfg implements vscode.WorkspaceConfiguration {
	private map: Map<string, any>;
	private wrapped: vscode.WorkspaceConfiguration;

	constructor(workspaceSettings: { [key: string]: any } = {}) {
		// getter
		Object.defineProperties(this, Object.getOwnPropertyDescriptors(workspaceSettings));
		this.map = new Map<string, any>(Object.entries(workspaceSettings));
		this.wrapped = vscode.workspace.getConfiguration('go'); // intentionally using vscode API directly.
	}

	// tslint:disable: no-any
	public get(section: string, defaultValue?: any): any {
		if (this.map.has(section)) {
			return this.map.get(section);
		}
		return this.wrapped.get(section, defaultValue);
	}

	public has(section: string): boolean {
		if (this.map.has(section)) {
			return true;
		}
		return this.wrapped.has(section);
	}

	public inspect<T>(section: string) {
		const i = this.wrapped.inspect<T>(section);
		const part = section.split('.');
		if (this.map.has(part[0])) {
			let v: any = this.map.get(part[0]);
			for (let i = 1; i < part.length; i++) {
				if (Object.prototype.hasOwnProperty.call(v, part[i])) {
					v = v[part[i]];
				} else {
					v = undefined;
					break;
				}
			}
			if (i) {
				i.workspaceValue = v;
			}
		}
		return i;
	}

	public update(
		section: string,
		value: any,
		configurationTarget?: boolean | vscode.ConfigurationTarget,
		overrideInLanguage?: boolean
	): Thenable<void> {
		throw new Error('Method not implemented.');
	}
}
