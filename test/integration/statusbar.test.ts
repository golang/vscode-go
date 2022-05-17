/* eslint-disable no-prototype-builtins */
/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Modification copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs-extra';
import { describe, it } from 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
	formatGoVersion,
	getGoEnvironmentStatusbarItem,
	getSelectedGo,
	GoEnvironmentOption,
	setSelectedGo
} from '../../src/goEnvironmentStatus';
import { updateGoVarsFromConfig } from '../../src/goInstallTools';
import { disposeGoStatusBar } from '../../src/goStatus';
import { getWorkspaceState, setWorkspaceState } from '../../src/stateUtils';
import { MockMemento } from '../mocks/MockMemento';

import ourutil = require('../../src/util');
import { setGOROOTEnvVar } from '../../src/goEnv';

describe('#initGoStatusBar()', function () {
	this.beforeAll(async () => {
		await updateGoVarsFromConfig({}); // should initialize the status bar.
	});

	this.afterAll(() => {
		disposeGoStatusBar();
	});

	it('should create a status bar item', () => {
		assert.notEqual(getGoEnvironmentStatusbarItem(), undefined);
	});

	it('should create a status bar item with a label matching go.goroot version', async () => {
		const version = await ourutil.getGoVersion();
		const versionLabel = formatGoVersion(version);
		let label = getGoEnvironmentStatusbarItem().text;
		const iconPos = label.indexOf('$');
		if (iconPos >= 0) {
			label = label.substring(0, iconPos);
		}
		assert.equal(label, versionLabel, 'goroot version does not match status bar item text');
	});
});

describe('#setGOROOTEnvVar', function () {
	let origGOROOT = process.env['GOROOT'];

	this.beforeEach(() => {
		origGOROOT = process.env['GOROOT'];
	});

	this.afterEach(() => {
		if (origGOROOT) {
			process.env['GOROOT'] = origGOROOT;
		} else {
			delete process.env.GOROOT;
		}
	});

	it('empty goroot does not change GOROOT', async () => {
		await setGOROOTEnvVar('');
		assert.strictEqual(process.env['GOROOT'], origGOROOT);
	});

	it('non-directory value is rejected', async () => {
		await setGOROOTEnvVar(ourutil.getBinPath('go'));
		assert.strictEqual(process.env['GOROOT'], origGOROOT);
	});

	it('directory value is accepted', async () => {
		const goroot = path.join(path.dirname(ourutil.getBinPath('go')), '..');
		await setGOROOTEnvVar(goroot);
		assert.strictEqual(process.env['GOROOT'], goroot);
	});
});

describe('#setSelectedGo()', function () {
	this.timeout(40000);
	let sandbox: sinon.SinonSandbox | undefined;
	let goOption: GoEnvironmentOption;
	let defaultMemento: vscode.Memento;

	this.beforeAll(async () => {
		const version = await ourutil.getGoVersion();
		const defaultGoOption = new GoEnvironmentOption(version.binaryPath, formatGoVersion(version));
		defaultMemento = getWorkspaceState();
		setWorkspaceState(new MockMemento());
		await setSelectedGo(defaultGoOption);
	});
	this.afterAll(async () => {
		setWorkspaceState(defaultMemento);
	});
	this.beforeEach(async () => {
		goOption = await getSelectedGo();
		sandbox = sinon.createSandbox();
	});
	this.afterEach(async () => {
		await setSelectedGo(goOption, false);
		sandbox!.restore();
	});

	it('should update the workspace memento storage', async () => {
		// set workspace setting
		const workspaceTestOption = new GoEnvironmentOption('workspacetestpath', 'testlabel');
		await setSelectedGo(workspaceTestOption, false);

		// check that the new config is set
		assert.equal(getSelectedGo()?.binpath, 'workspacetestpath');
	});

	it.skip('should download an uninstalled version of Go', async () => {
		// TODO(https://github.com/golang/vscode-go/issues/1454): temporarily disabled
		// to unblock nightly release during investigation.
		if (!process.env['VSCODEGO_BEFORE_RELEASE_TESTS']) {
			return;
		}

		// setup tmp home directory for sdk installation
		const envCache = Object.assign({}, process.env);
		process.env.HOME = os.tmpdir();

		// set selected go as a version to download
		const option = new GoEnvironmentOption('golang.org/dl/go1.13.12', 'Go 1.13.12', false);
		await setSelectedGo(option, false);

		// the temp sdk directory should now contain go1.13.12
		const subdirs = await fs.readdir(path.join(os.tmpdir(), 'sdk'));
		assert.ok(subdirs.includes('go1.13.12'), 'Go 1.13.12 was not installed');

		// cleanup
		process.env = envCache;
	});
});
