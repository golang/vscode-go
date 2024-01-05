/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import { describe, it } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getLatestGoVersions, GoEnvironmentOption, latestGoVersionKey } from '../../src/goEnvironmentStatus';
import { getGlobalState, setGlobalState, updateGlobalState } from '../../src/stateUtils';
import { MockMemento } from '../mocks/MockMemento';
import * as fetchModule from 'node-fetch';

import moment = require('moment');

describe('#getLatestGoVersion()', function () {
	this.timeout(40000);
	let sandbox: sinon.SinonSandbox | undefined;
	let defaultMemento: vscode.Memento;

	const now = 100000000;
	const oneday = 60 * 60 * 24 * 1000; // 24 hours in milliseconds

	this.beforeAll(async () => {
		defaultMemento = getGlobalState();
	});
	this.afterAll(async () => {
		setGlobalState(defaultMemento);
	});

	this.beforeEach(() => {
		sandbox = sinon.createSandbox();
		setGlobalState(new MockMemento());

		const responseJSON = JSON.stringify([
			{ version: 'go1.15.1', stable: true },
			{ version: 'go1.14.2', stable: true }
		]);
		const fetchMock = sandbox.mock(fetchModule);
		fetchMock.expects('default')
			.withArgs('https://go.dev/dl/?mode=json')
			.returns(Promise.resolve(
				new fetchModule.Response(responseJSON)));
		const mmnt = sandbox.mock(moment);
		mmnt.expects('now').returns(now);
	});

	this.afterEach(async () => {
		sandbox!.restore();
	});

	it('should get latest go versions from golang.org/dl with empty cache', async () => {
		const results = await getLatestGoVersions();
		const want = [
			{ label: 'Go 1.15.1', binpath: 'golang.org/dl/go1.15.1' },
			{ label: 'Go 1.14.2', binpath: 'golang.org/dl/go1.14.2' }
		];

		assert.strictEqual(results.length, want.length);
		for (let i = 0; i < results.length; i++) {
			assert.strictEqual(results[i].label, want[i].label);
			assert.strictEqual(results[i].binpath, want[i].binpath);
		}
	});

	const cacheVersions = [
		new GoEnvironmentOption('golang.org/dl/go1.14.7', 'Go 1.14.7', false),
		new GoEnvironmentOption('golang.org/dl/go1.13.2', 'Go 1.13.2', false)
	];

	it('should get latest go versions from golang.org/dl with timed out cache', async () => {
		// add a timed out cache entry
		await updateGlobalState(latestGoVersionKey, {
			timestamp: now - (oneday + 1), // more than one day ago
			goVersions: cacheVersions
		});

		// run test
		const results = await getLatestGoVersions();
		const want = [
			{ label: 'Go 1.15.1', binpath: 'golang.org/dl/go1.15.1' },
			{ label: 'Go 1.14.2', binpath: 'golang.org/dl/go1.14.2' }
		];

		// check results
		assert.strictEqual(results.length, want.length);
		for (let i = 0; i < results.length; i++) {
			assert.strictEqual(results[i].label, want[i].label);
			assert.strictEqual(results[i].binpath, want[i].binpath);
		}
	});

	it('should get latest go versions from cache', async () => {
		// add a valid cache entry
		await updateGlobalState(latestGoVersionKey, {
			timestamp: now - (oneday - 100), // less than one day ago
			goVersions: cacheVersions
		});

		// run test
		const results = await getLatestGoVersions();
		const want = [
			{ label: 'Go 1.14.7', binpath: 'golang.org/dl/go1.14.7' },
			{ label: 'Go 1.13.2', binpath: 'golang.org/dl/go1.13.2' }
		];

		// check results
		assert.strictEqual(results.length, want.length);
		for (let i = 0; i < results.length; i++) {
			assert.strictEqual(results[i].label, want[i].label);
			assert.strictEqual(results[i].binpath, want[i].binpath);
		}
	});
});
