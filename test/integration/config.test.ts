/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import vscode = require('vscode');
import { Configuration } from '../../src/config';

suite('GoConfiguration Tests', () => {
	function check(trusted: boolean, workspaceConfig: { [key: string]: any }, key: string, expected: any) {
		const getConfigurationFn = (section: string) => new MockCfg(workspaceConfig);
		const cfg = (new Configuration(trusted, getConfigurationFn)).get('go');

		const got0 = JSON.stringify(cfg.get(key));
		const got1 = JSON.stringify(cfg[key]);
		const want = JSON.stringify(expected);
		assert.strictEqual(got0, want, `cfg.get(${key}) = ${got0}, want ${want}`);
		assert.strictEqual(got1, want, `cfg[${key}] = ${got1}, want ${want}`);
	}

	test('trusted workspace', () => {
		check(true, { goroot: 'goroot_val' }, 'goroot', 'goroot_val');
		check(true, { gopath: 'gopath_val' }, 'gopath', 'gopath_val');
		check(true, { toolsGopath: 'toolsGopath_val' }, 'toolsGopath', 'toolsGopath_val');
		check(true, { alternateTools: { go: 'foo' } }, 'alternateTools', { go: 'foo' });

		check(true, { buildFlags: ['-v'] }, 'buildFlags', ['-v']);
		check(true, { languageServerFlags: ['-rpc.trace'] }, 'languageServerFlags', ['-rpc.trace']);
	});

	test('untrusted workspace', () => {
		check(false, { goroot: 'goroot_val' }, 'goroot', null);
		check(false, { gopath: 'gopath_val' }, 'gopath', null);
		check(false, { toolsGopath: 'toolsGopath_val' }, 'toolsGopath', null);
		check(false, { alternateTools: { go: 'foo' } }, 'alternateTools', {});

		check(false, { buildFlags: ['-v'] }, 'buildFlags', ['-v']);
		check(false, { languageServerFlags: ['-rpc.trace'] }, 'languageServerFlags', ['-rpc.trace']);
	});

	function checkGopls(trusted: boolean, workspaceConfig: { [key: string]: any }, key: string, expected: any) {
		const getConfigurationFn = (section: string) => new MockCfg(workspaceConfig);
		const cfg = (new Configuration(trusted, getConfigurationFn)).get('gopls');

		const got0 = JSON.stringify(cfg.get(key));
		const got1 = JSON.stringify(cfg[key]);
		const want = JSON.stringify(expected);
		assert.strictEqual(got0, want, `cfg.get(${key}) = ${got0}, want ${want}`);
		assert.strictEqual(got1, want, `cfg[${key}] = ${got1}, want ${want}`);
	}

	test('trusted workspace (gopls settings)', () => {
		checkGopls(true, { buildFlags: '-v' }, 'buildFlags', '-v');
		checkGopls(true, { env: { GOBIN: 'foo' } }, 'env', { GOBIN: 'foo' });
	});

	test('untrusted workspace (gopls settings)', () => {
		checkGopls(false, { buildFlags: '-v' }, 'buildFlags', '-v');
		checkGopls(false, { env: { GOBIN: 'foo' } }, 'env', { GOBIN: 'foo' });
	});
});

// tslint:disable: no-any
class MockCfg implements vscode.WorkspaceConfiguration {
	private map: Map<string, any>;
	private wrapped: vscode.WorkspaceConfiguration;

	constructor(workspaceSettings: { [key: string]: any } = {}) {
		// getter
		Object.defineProperties(this, Object.getOwnPropertyDescriptors(workspaceSettings));
		this.map = new Map<string, any>(Object.entries(workspaceSettings));
		this.wrapped = vscode.workspace.getConfiguration('go');
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
		if (this.map.has(section)) {
			i.workspaceValue = this.map.get(section);
		}
		return i;
	}

	public update(
		section: string, value: any,
		configurationTarget?: boolean | vscode.ConfigurationTarget,
		overrideInLanguage?: boolean): Thenable<void> {
		throw new Error('Method not implemented.');
	}
}
