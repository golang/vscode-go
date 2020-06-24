/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import cp = require('child_process');
import fs = require('fs');
import { describe, it } from 'mocha';
import os = require('os');
import path = require('path');
import sinon = require('sinon');
import util = require('util');
import { WorkspaceConfiguration } from 'vscode';
import { disposeGoStatusBar, formatGoVersion, getGoEnvironmentStatusbarItem } from '../../src/goEnvironmentStatus';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { getCurrentGoRoot } from '../../src/goPath';
import ourutil = require('../../src/util');

describe('#initGoStatusBar()', function () {
	this.beforeAll(async () => {
		await updateGoVarsFromConfig();  // should initialize the status bar.
	});

	this.afterAll(() => {
		disposeGoStatusBar();
	});

	it('should create a status bar item', () => {
		assert.notEqual(getGoEnvironmentStatusbarItem(), undefined);
	});

	it('should create a status bar item with a label matching go.goroot version', async () => {
		const version = await ourutil.getGoVersion();
		const versionLabel = formatGoVersion(version.format());
		assert.equal(
			getGoEnvironmentStatusbarItem().text,
			versionLabel,
			'goroot version does not match status bar item text'
		);
	});
});

describe('#updateGoVarsFromConfig()', function () {
	this.timeout(10000);

	let defaultGoConfig: WorkspaceConfiguration | undefined;
	let tmpRoot: string | undefined;
	let tmpRootBin: string | undefined;
	let sandbox: sinon.SinonSandbox | undefined;

	this.beforeAll(async () => {
		defaultGoConfig = ourutil.getGoConfig();

		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rootchangetest'));
		tmpRootBin = path.join(tmpRoot, 'bin');

		// build a fake go binary and place it in tmpRootBin.
		fs.mkdirSync(tmpRootBin);

		const fixtureSourcePath = path.join(__dirname, '..', '..', '..', 'test', 'fixtures', 'testhelpers');
		const execFile = util.promisify(cp.execFile);
		const goRuntimePath = ourutil.getBinPath('go');
		const { stdout, stderr } = await execFile(
			goRuntimePath, ['build', '-o', path.join(tmpRootBin, 'go'), path.join(fixtureSourcePath, 'fakego.go')]);
		if (stderr) {
			assert.fail(`failed to build the fake go binary required for testing: ${stderr}`);
		}
	});

	this.afterAll(() => {
		ourutil.rmdirRecursive(tmpRoot);
	});

	this.beforeEach(() => {
		sandbox = sinon.createSandbox();
	});

	this.afterEach(() => {
		sandbox.restore();
	});

	function pathEnvVar(): string[] {
		let paths = [] as string[];
		if (process.env.hasOwnProperty('PATH')) {
			paths = process.env['PATH'].split(path.delimiter);
		} else if (process.platform === 'win32' && process.env.hasOwnProperty('Path')) {
			paths = process.env['Path'].split(path.delimiter);
		}
		return paths;
	}

	it('should have a sensible goroot with the default setting', async () => {
		await updateGoVarsFromConfig();

		const b = getGoEnvironmentStatusbarItem();
		assert.ok(b.text.startsWith('Go'), `go env statusbar item = ${b.text}, want "Go..."`);
		assert.equal(pathEnvVar()[0], [path.join(getCurrentGoRoot(), 'bin')],
			`the first element in PATH must match the current GOROOT/bin`);
	});

	it('should recognize the adjusted goroot using go.goroot', async () => {
		// stub geteGoConfig to return "go.goroot": tmpRoot.
		const getGoConfigStub = sandbox.stub(ourutil, 'getGoConfig').returns({
			get: (s: string) => {
				if (s === 'goroot') { return tmpRoot; }
				return defaultGoConfig.get(s);
			},
		} as WorkspaceConfiguration);

		// adjust the fake go binary's behavior.
		process.env['FAKEGOROOT'] = tmpRoot;
		process.env['FAKEGOVERSION'] = 'go version go2.0.0 darwin/amd64';

		await updateGoVarsFromConfig();

		sandbox.assert.calledWith(getGoConfigStub);
		assert.equal((await ourutil.getGoVersion()).format(), '2.0.0');
		assert.equal(getGoEnvironmentStatusbarItem().text, 'Go 2.0.0');
		assert.equal(pathEnvVar()[0], [path.join(getCurrentGoRoot(), 'bin')],
			`the first element in PATH must match the current GOROOT/bin`);
	});

	it('should recognize the adjusted goroot using go.alternateTools', async () => {
		// "go.alternateTools" : {"go": "go3"}
		fs.copyFileSync(path.join(tmpRootBin, 'go'), path.join(tmpRootBin, 'go3'));

		const getGoConfigStub = sandbox.stub(ourutil, 'getGoConfig').returns({
			get: (s: string) => {
				if (s === 'alternateTools') {
					return { go: path.join(tmpRootBin, 'go3') };
				}
				return defaultGoConfig.get(s);
			},
		} as WorkspaceConfiguration);

		process.env['FAKEGOROOT'] = tmpRoot;
		process.env['FAKEGOVERSION'] = 'go version go3.0.0 darwin/amd64';

		await updateGoVarsFromConfig();

		sandbox.assert.calledWith(getGoConfigStub);
		assert.equal((await ourutil.getGoVersion()).format(), '3.0.0');
		assert.equal(getGoEnvironmentStatusbarItem().text, 'Go 3.0.0');
		assert.equal(pathEnvVar()[0], [path.join(getCurrentGoRoot(), 'bin')],
			`the first element in PATH must match the current GOROOT/bin`);
	});
});
