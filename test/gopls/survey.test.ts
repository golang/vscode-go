/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import sinon = require('sinon');
import { buildSurveyConfig, shouldPromptForGoplsSurvey, SurveyConfig, surveyConfigPrefix } from '../../src/goLanguageServer';

suite('gopls survey tests', () => {
	test('build survey config tests', () => {
		// global state -> offer survey
		const testCases: [Map<string, string>, SurveyConfig, boolean][] = [
			// User who is activating the extension for the first time.
			[
				new Map<string, any>(),
				{
					lastDateAccepted: undefined,
					lastDateActivated: undefined,
					lastDatePrompted: undefined,
					prompt: undefined,
					promptThisMonth: undefined,
				},
				true,
			],
			// User who has already taken the survey.
			[
				new Map<string, any>([
					[`${surveyConfigPrefix}_lastDateAccepted`, '2020-04-02'],
					[`${surveyConfigPrefix}_lastDateActivated`, '2020-04-10'],
					[`${surveyConfigPrefix}_lastDatePrompted`, '2020-04-02'],
					[`${surveyConfigPrefix}_prompt`, true],
					[`${surveyConfigPrefix}_promptThisMonth`, false],
				]),
				{
					lastDateAccepted: new Date('2020-04-02'),
					lastDateActivated: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: true,
					promptThisMonth: false,
				},
				false,
			],
			// User who has declined survey prompting.
			[
				new Map<string, any>([
					[`${surveyConfigPrefix}_lastDateActivated`, '2020-04-10'],
					[`${surveyConfigPrefix}_lastDatePrompted`, '2020-04-02'],
					[`${surveyConfigPrefix}_prompt`, false],
				]),
				{
					lastDateAccepted: undefined,
					lastDateActivated: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: false,
					promptThisMonth: undefined,
				},
				false,
			],
			// User who hasn't activated the extension in a while, but has opted in to prompting.
			[
				new Map<string, any>([
					[`${surveyConfigPrefix}_lastDateActivated`, '2019-04-10'],
					[`${surveyConfigPrefix}_lastDatePrompted`, '2019-01-02'],
					[`${surveyConfigPrefix}_prompt`, true],
				]),
				{
					lastDateAccepted: undefined,
					lastDateActivated: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true,
					promptThisMonth: undefined,
				},
				true,
			],
			// User who hasn't activated the extension in a while, and has never been prompted.
			[
				new Map<string, any>([
					[`${surveyConfigPrefix}_lastDateActivated`, '2019-04-10'],
					[`${surveyConfigPrefix}_lastDatePrompted`, '2019-01-02'],
				]),
				{
					lastDateAccepted: undefined,
					lastDateActivated: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: undefined,
					promptThisMonth: undefined,
				},
				true,
			],
			// User who should get prompted this month, but hasn't been yet.
			[
				new Map<string, any>([
					[`${surveyConfigPrefix}_lastDateActivated`, '2020-04-10'],
					[`${surveyConfigPrefix}_lastDatePrompted`, '2019-01-02'],
					[`${surveyConfigPrefix}_prompt`, true],
					[`${surveyConfigPrefix}_promptThisMonth`, true],
				]),
				{
					lastDateAccepted: undefined,
					lastDateActivated: new Date('2020-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true,
					promptThisMonth: true,
				},
				true,
			],
		];
		const stateUtils = require('../../src/stateUtils');
		testCases.map(([testGlobalState, wantCfg, wantPrompt], i) => {
			// Replace the global state with the test states.
			sinon.replace(stateUtils, 'getFromGlobalState', sinon.fake((key: string, defaultValue?: any): any => {
				return testGlobalState.get(key);
			}));

			// Replace Math.Random so that it always returns 1. This means
			// that we will always choose to prompt, in the event that the
			// user can be prompted that month.
			sinon.replace(Math, 'random', () => 1);

			const cfg = buildSurveyConfig();
			assert.deepEqual(cfg, wantCfg, `building config failed for ${i}`);

			const now = new Date('2020-04-29');
			const gotPrompt = shouldPromptForGoplsSurvey(now, cfg);
			assert.equal(wantPrompt, gotPrompt, `prompt determination failed for ${i}`);

			sinon.restore();
		});
	});
});
