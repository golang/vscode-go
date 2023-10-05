/* eslint-disable node/no-unpublished-import */
/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as sinon from 'sinon';
import { describe, it } from 'mocha';
import { GOPLS_MAYBE_PROMPT_FOR_TELEMETRY, TELEMETRY_START_TIME_KEY, TelemetryService } from '../../src/goTelemetry';
import { MockMemento } from '../mocks/MockMemento';

describe('# prompt for telemetry', () => {
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
});

interface testCase {
	noLangClient?: boolean; // gopls is not running.
	goplsWithoutTelemetry?: boolean; // gopls is too old.
	firstDate?: Date; // first date the extension observed gopls with telemetry feature.
	previewExtension?: boolean; // assume we are in dev/nightly extension.
	vsTelemetryDisabled?: boolean; // assume the user disabled vscode general telemetry.
	samplingInterval: number; // N where N out of 1000 are sampled.
	hashMachineID?: number; // stub the machine id hash computation function.
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

		const memento = new MockMemento();
		if (tc.firstDate) {
			memento.update(TELEMETRY_START_TIME_KEY, tc.firstDate);
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
