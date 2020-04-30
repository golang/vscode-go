/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import * as assert from 'assert';
import sinon = require('sinon');
import { shouldPromptForGoplsSurvey, surveyConfigPrefix } from '../../src/goLanguageServer';

suite('gopls survey tests', () => {
	test('build survey config tests', () => {
		// global state -> offer survey
		const testCases: [Map<string, string>, boolean][] = [
			// The user has taken the survey in the last year, so don't prompt.
			[
				new Map<string, string>([
					[`${surveyConfigPrefix}_dateAccepted`, '2020-04-02'],
				]), false,
			],
		];
		const stateUtils = require('../../src/stateUtils');
		testCases.map(([testGlobalState, wantPrompt]) => {
			const fake = sinon.fake((key: string, defaultValue?: any): any => {
				return testGlobalState.get(key);
			});
			sinon.replace(stateUtils, 'getFromGlobalState', fake);
			const gotPrompt = shouldPromptForGoplsSurvey();
			assert.equal(wantPrompt, gotPrompt, `expected prompt to be ${wantPrompt}, got ${gotPrompt}`);
		});

	});
});
