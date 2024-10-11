/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as sinon from 'sinon';
import { describe, it } from 'mocha';
import {
	GOPLS_MAYBE_PROMPT_FOR_TELEMETRY,
	TELEMETRY_START_TIME_KEY,
	TelemetryReporter,
	TelemetryService,
	recordTelemetryStartTime
} from '../../src/goTelemetry';
import { MockMemento } from '../mocks/MockMemento';
import { maybeInstallVSCGO } from '../../src/goInstallTools';
import assert from 'assert';
import path from 'path';
import * as fs from 'fs-extra';
import os = require('os');
import { rmdirRecursive } from '../../src/util';
import { extensionId } from '../../src/const';
import { executableFileExists, fileExists } from '../../src/utils/pathUtils';
import { ExtensionMode, Memento, extensions } from 'vscode';

describe('# prompt for telemetry', async () => {
	const extension = extensions.getExtension(extensionId);
	assert(extension);

	it(
		'do not prompt if language client is not used',
		testTelemetryPrompt(
			{
				noLangClient: true,
				previewExtension: true,
				samplingInterval: 1000
			},
			false
		)
	); // no crash when there is no language client.
	it(
		'do not prompt if gopls does not support telemetry',
		testTelemetryPrompt(
			{
				goplsWithoutTelemetry: true,
				previewExtension: true,
				samplingInterval: 1000
			},
			false
		)
	);
	it(
		'prompt when telemetry started a while ago',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				samplingInterval: 1000
			},
			true
		)
	);
	it(
		'do not prompt if telemetry started two days ago',
		testTelemetryPrompt(
			{
				firstDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // two days ago!
				samplingInterval: 1000
			},
			false
		)
	);
	it(
		'do not prompt if gopls with telemetry never ran',
		testTelemetryPrompt(
			{
				firstDate: undefined, // gopls with telemetry not seen before.
				samplingInterval: 1000
			},
			false
		)
	);
	it(
		'do not prompt if not sampled',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				samplingInterval: 0
			},
			false
		)
	);
	it(
		'prompt only if sampled (machineID = 0, samplingInterval = 1)',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				samplingInterval: 1,
				hashMachineID: 0
			},
			true
		)
	);
	it(
		'prompt only if sampled (machineID = 1, samplingInterval = 1)',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				samplingInterval: 1,
				hashMachineID: 1
			},
			false
		)
	);
	it(
		'prompt all preview extension users',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				previewExtension: true,
				samplingInterval: 0
			},
			true
		)
	);
	it(
		'do not prompt if vscode telemetry is disabled',
		testTelemetryPrompt(
			{
				firstDate: new Date('2022-01-01'),
				vsTelemetryDisabled: true,
				previewExtension: true,
				samplingInterval: 1000
			},
			false
		)
	);
	// testExtensionAPI.globalState is a real memento instance passed by ExtensionHost.
	// This instance is active throughout the integration test.
	// When you add more test cases that interact with the globalState,
	// be aware that multiple test cases may access and mutate it asynchronously.
	const testExtensionAPI = await extension.activate();
	it('check we can salvage the value in the real memento', async () => {
		// write Date with Memento.update - old way. Now we always use string for TELEMETRY_START_TIME_KEY value.
		testExtensionAPI.globalState.update(TELEMETRY_START_TIME_KEY, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
		await testTelemetryPrompt(
			{
				samplingInterval: 1000,
				mementoInstance: testExtensionAPI.globalState
			},
			true
		)();
	});
});

interface testCase {
	noLangClient?: boolean; // gopls is not running.
	goplsWithoutTelemetry?: boolean; // gopls is too old.
	firstDate?: Date; // first date the extension observed gopls with telemetry feature.
	previewExtension?: boolean; // assume we are in dev/nightly extension.
	vsTelemetryDisabled?: boolean; // assume the user disabled vscode general telemetry.
	samplingInterval: number; // N where N out of 1000 are sampled.
	hashMachineID?: number; // stub the machine id hash computation function.
	mementoInstance?: Memento; // if set, use this instead of mock memento.
}

function testTelemetryPrompt(tc: testCase, wantPrompt: boolean) {
	return async () => {
		const languageClient = {
			sendRequest: () => {
				return Promise.resolve();
			}
		};
		const spy = sinon.spy(languageClient, 'sendRequest');
		const lc = tc.noLangClient ? undefined : languageClient;

		const memento = tc.mementoInstance ?? new MockMemento();
		if (tc.firstDate) {
			recordTelemetryStartTime(memento, tc.firstDate);
		}
		const commands = tc.goplsWithoutTelemetry ? [] : [GOPLS_MAYBE_PROMPT_FOR_TELEMETRY];

		const sut = new TelemetryService(lc, memento, commands);
		if (tc.hashMachineID !== undefined) {
			sinon.stub(sut, 'hashMachineID').returns(tc.hashMachineID);
		}
		await sut.promptForTelemetry(!!tc.previewExtension, !tc.vsTelemetryDisabled, tc.samplingInterval);
		if (wantPrompt) {
			sinon.assert.calledOnce(spy);
		} else {
			sinon.assert.neverCalledWith(spy);
		}
	};
}

describe('# telemetry reporter using vscgo', async function () {
	this.timeout(20000); // go install can be slow.
	// installVSCGO expects
	//   {extensionPath}/vscgo: vscgo source code for testing.
	//   {extensionPath}/bin: where compiled vscgo will be stored.
	// During testing, extensionDevelopmentPath is the root of the extension.
	// __dirname = out/test/gopls.
	const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetryReporter'));
	const counterfile = path.join(tmpDir, 'counterfile.txt');
	const sut = new TelemetryReporter(0, counterfile);
	let vscgo: string;

	suiteSetup(async () => {
		try {
			vscgo = await maybeInstallVSCGO(
				ExtensionMode.Test,
				extensionId,
				'',
				extensionDevelopmentPath,
				true /*isPreview*/
			);
		} catch (e) {
			assert.fail(`failed to install vscgo needed for testing: ${e}`);
		}
		console.log(`vscgo installed: ${vscgo}`);
	});
	suiteTeardown(() => {
		rmdirRecursive(tmpDir);
		if (executableFileExists(vscgo)) {
			fs.unlink(vscgo);
		}
	});

	teardown(() => {
		if (fileExists(counterfile)) {
			fs.unlink(counterfile);
		}
	});

	it('add succeeds before telemetryReporter.setTool runs', () => {
		sut.add('hello', 1);
		sut.add('world', 2);
	});

	it('flush is noop before setTool', async () => {
		await sut.flush();
		assert(!fileExists(counterfile), 'counterfile exists');
	});

	it('flush writes accumulated counters after setTool', async () => {
		sut.setTool(vscgo);
		await sut.flush();
		const readAll = fs.readFileSync(counterfile).toString();
		assert(readAll.includes('hello 1\n') && readAll.includes('world 2\n'), readAll);
	});

	it('dispose triggers flush', async () => {
		sut.add('bye', 3);
		await sut.dispose();
		const readAll = fs.readFileSync(counterfile).toString();
		assert(readAll.includes('bye 3\n'), readAll);
	});
});
