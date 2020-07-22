/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import sinon = require('sinon');
import { shouldPromptForGoplsSurvey, SurveyConfig } from '../../src/goLanguageServer';

suite('gopls survey tests', () => {
	test('prompt for survey', () => {
		// global state -> offer survey
		const testCases: [SurveyConfig, boolean][] = [
			// User who is activating the extension for the first time.
			[
				{},
				true,
			],
			// User who has already taken the survey.
			[
				{
					lastDateAccepted: new Date('2020-04-02'),
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: true,
					promptThisMonth: false,
				},
				undefined,
			],
			// User who has declined survey prompting.
			[
				{
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: false,
				},
				undefined,
			],
			// User who hasn't activated the extension in a while, but has opted in to prompting.
			[
				{
					dateComputedPromptThisMonth: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true,
				},
				true,
			],
			// User who hasn't activated the extension in a while, and has never been prompted.
			[
				{
					dateComputedPromptThisMonth: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
				},
				true,
			],
			// User who should get prompted this month, but hasn't been yet.
			[
				{
					lastDateAccepted: undefined,
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true,
					promptThisMonth: true,
				},
				true,
			],
		];
		testCases.map(([testConfig, wantPrompt], i) => {
			// Replace Math.Random so that it always returns 1. This means
			// that we will always choose to prompt, in the event that the
			// user can be prompted that month.
			sinon.replace(Math, 'random', () => 0);

			const now = new Date('2020-04-29');
			const gotPrompt = shouldPromptForGoplsSurvey(now, testConfig);
			if (wantPrompt) {
				assert.ok(gotPrompt, `prompt determination failed for ${i}`);
			} else {
				assert.equal(gotPrompt, wantPrompt, `prompt determination failed for ${i}`);
			}
			sinon.restore();
		});
	});
});
