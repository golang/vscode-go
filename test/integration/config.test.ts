/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Configuration } from '../../src/config';
import { MockCfg } from '../mocks/MockCfg';

suite('GoConfiguration Tests', () => {
	function check(trusted: boolean, workspaceConfig: { [key: string]: any }, key: string, expected: any) {
		const getConfigurationFn = (section: string) => new MockCfg(workspaceConfig);
		const cfg = new Configuration(trusted, getConfigurationFn).get('go');

		const got0 = JSON.stringify(cfg.get(key));
		const got1 = JSON.stringify(cfg[key]);
		const want = JSON.stringify(expected);
		assert.strictEqual(got0, want, `cfg.get(${key}) = ${got0}, want ${want}`);
		assert.strictEqual(got1, want, `cfg[${key}] = ${got1}, want ${want}`);
	}

	test('trusted workspace accepts all workspace settings', () => {
		check(true, { goroot: 'goroot_val' }, 'goroot', 'goroot_val');
		check(true, { gopath: 'gopath_val' }, 'gopath', 'gopath_val');
		check(true, { toolsGopath: 'toolsGopath_val' }, 'toolsGopath', 'toolsGopath_val');
		check(true, { alternateTools: { go: 'foo' } }, 'alternateTools', { go: 'foo' });
		check(true, { inferGopath: true }, 'inferGopath', true);

		check(true, { buildFlags: ['-v'] }, 'buildFlags', ['-v']);
		check(true, { languageServerFlags: ['-rpc.trace'] }, 'languageServerFlags', ['-rpc.trace']);
	});

	test('untrusted workspace ignores dangerous settings', () => {
		check(false, { goroot: 'goroot_val' }, 'goroot', null);
		check(false, { gopath: 'gopath_val' }, 'gopath', null);
		check(false, { toolsGopath: 'toolsGopath_val' }, 'toolsGopath', null);
		check(false, { alternateTools: { go: 'foo' } }, 'alternateTools', {});
		check(false, { inferGopath: true }, 'inferGopath', false);

		check(false, { buildFlags: ['-v'] }, 'buildFlags', ['-v']);
		check(false, { languageServerFlags: ['-rpc.trace'] }, 'languageServerFlags', ['-rpc.trace']);
	});

	function checkGopls(trusted: boolean, workspaceConfig: { [key: string]: any }, key: string, expected: any) {
		const getConfigurationFn = (section: string) => new MockCfg(workspaceConfig);
		const cfg = new Configuration(trusted, getConfigurationFn).get('gopls');

		const got0 = JSON.stringify(cfg.get(key));
		const got1 = JSON.stringify(cfg[key]);
		const want = JSON.stringify(expected);
		assert.strictEqual(got0, want, `cfg.get(${key}) = ${got0}, want ${want}`);
		assert.strictEqual(got1, want, `cfg[${key}] = ${got1}, want ${want}`);
	}

	test('trusted workspace (gopls settings) accepts all settings', () => {
		// unaffected settings.
		checkGopls(true, { buildFlags: '-v' }, 'buildFlags', '-v');
		checkGopls(true, { env: { GOBIN: 'foo' } }, 'env', { GOBIN: 'foo' });
	});

	test('untrusted workspace (gopls settings) ignores dangerous settings', () => {
		// unaffected settings
		checkGopls(false, { buildFlags: '-v' }, 'buildFlags', '-v');
		checkGopls(false, { env: { GOBIN: 'foo' } }, 'env', { GOBIN: 'foo' });
	});
});
