/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import sinon = require('sinon');
import vscode = require('vscode');
import * as goLanguageServer from '../../src/language/goLanguageServer';
import * as goSurvey from '../../src/goSurvey';
import * as goDeveloperSurvey from '../../src/developerSurvey/prompt';
import * as config from '../../src/developerSurvey/config';

suite('gopls survey tests', () => {
	test('prompt for survey', () => {
		// global state -> offer survey
		const testCases: [goSurvey.GoplsSurveyState, boolean | undefined][] = [
			// User who is activating the extension for the first time.
			[{}, true],
			// User who has already taken the survey.
			[
				{
					lastDateAccepted: new Date('2020-04-02'),
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: true,
					promptThisMonth: false
				},
				undefined
			],
			// User who has declined survey prompting.
			[
				{
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: false
				},
				undefined
			],
			// User who hasn't activated the extension in a while, but has opted in to prompting.
			[
				{
					dateComputedPromptThisMonth: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true
				},
				true
			],
			// User who hasn't activated the extension in a while, and has never been prompted.
			[
				{
					dateComputedPromptThisMonth: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-01-02')
				},
				true
			],
			// User who should get prompted this month, but hasn't been yet.
			[
				{
					lastDateAccepted: undefined,
					dateComputedPromptThisMonth: new Date('2020-04-10'),
					lastDatePrompted: new Date('2019-01-02'),
					prompt: true,
					promptThisMonth: true
				},
				true
			]
		];
		testCases.map(([testConfig, wantPrompt], i) => {
			// Replace Math.Random so that it always returns 0. This means
			// that we will always choose to prompt, in the event that the
			// user can be prompted that month.
			sinon.replace(Math, 'random', () => 0);

			const now = new Date('2020-04-29');
			const gotPrompt = goSurvey.shouldPromptForSurvey(now, testConfig);
			if (wantPrompt) {
				assert.ok(gotPrompt, `prompt determination failed for ${i}`);
			} else {
				assert.equal(gotPrompt, wantPrompt, `prompt determination failed for ${i}`);
			}
			sinon.restore();
		});
	});
});

suite('developer survey tests', () => {
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
	});

	teardown(() => {
		sandbox.restore();
	});

	test('inRange', () => {
		// start, end, date => inRange
		const testCases: [Date, Date, Date, boolean][] = [
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2021-10-31'), true],
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2020-10-31'), false],
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2022-10-31'), false]
		];
		testCases.map(([Start, End, date, want]) => {
			const got = goDeveloperSurvey.inDateRange({ StartDate: Start, EndDate: End, URL: '' }, date);
			assert.strictEqual(got, want, `expected inRange(${Start}, ${End}, ${date} = ${want}, got: ${got})`);
		});
	});

	test('latest survey', async () => {
		const oldConfig: config.DeveloperSurveyConfig = {
			StartDate: new Date('2025-07-01T00:00:00Z'),
			EndDate: new Date('2025-08-01T00:00:00Z'),
			URL: 'https://google.com/survey/old?s=v'
		};

		const newConfig = {
			StartDate: new Date('2025-09-01T00:00:00Z'),
			EndDate: new Date('2025-10-01T00:00:00Z'),
			URL: 'https://google.com/survey/new?s=v'
		};

		// old state, now, module survey config => return survey config
		const testCases: [
			config.DeveloperSurveyConfigState,
			Date,
			string | undefined,
			config.DeveloperSurveyConfig | undefined
		][] = [
			// Update 3 hours ago, use cached.
			[
				{
					config: oldConfig,
					lastDateUpdated: new Date('2025-08-01T00:00:00Z'),
					version: 'v0.0.1'
				} as config.DeveloperSurveyConfigState,
				new Date('2025-08-01T00:03:00Z'),
				`{
  "StartDate": "2025-09-01T00:00:00Z",
  "EndDate": "2025-10-01T00:00:00Z",
  "URL": "https://google.com/survey/new"
}`,
				oldConfig
			],
			// Update 3 days ago, fetch from module.
			[
				{
					config: oldConfig,
					lastDateUpdated: new Date('2025-08-01T00:00:00Z'),
					version: 'v0.0.1'
				} as config.DeveloperSurveyConfigState,
				new Date('2025-08-04T00:00:00Z'),
				`{
  "StartDate": "2025-09-01T00:00:00Z",
  "EndDate": "2025-10-01T00:00:00Z",
  "URL": "https://google.com/survey/new"
}`,
				newConfig
			],
			// Update 3 days ago, fetch failed, fall back to old state.
			[
				{
					config: oldConfig,
					lastDateUpdated: new Date('2025-08-01T00:00:00Z'),
					version: 'v0.0.1'
				} as config.DeveloperSurveyConfigState,
				new Date('2025-08-04T00:00:00Z'),
				undefined,
				oldConfig
			],
			// No old state, fetch from module.
			[
				{} as config.DeveloperSurveyConfigState,
				new Date('2025-08-04T00:00:00Z'),
				`{
  "StartDate": "2025-09-01T00:00:00Z",
  "EndDate": "2025-10-01T00:00:00Z",
  "URL": "https://google.com/survey/new"
}`,
				newConfig
			],
			// No old state, fetch failed, return undefined.
			[{} as config.DeveloperSurveyConfigState, new Date('2025-08-04T00:00:00Z'), undefined, undefined],
			// Date follow pattern YYYY-MM-DD, fetch from module.
			[
				{
					config: oldConfig,
					lastDateUpdated: new Date('2025-08-01T00:00:00Z'),
					version: 'v0.0.1'
				} as config.DeveloperSurveyConfigState,
				new Date('2025-08-04T00:00:00Z'),
				`{
  "StartDate": "2025-09-01",
  "EndDate": "2025-10-01",
  "URL": "https://google.com/survey/new"
}`,
				newConfig
			]
		];

		// Stub once and change behavior in each iteration.
		const getStateConfigStub = sandbox.stub(goSurvey, 'getStateConfig');
		const fetchRemoteSurveyConfigStub = sandbox.stub(config, 'fetchRemoteSurveyConfig');

		for (const [i, [state, now, result, want]] of testCases.entries()) {
			getStateConfigStub.returns(state);
			if (!result) {
				fetchRemoteSurveyConfigStub.resolves(undefined);
			} else {
				fetchRemoteSurveyConfigStub.resolves([result, 'v0.0.2']);
			}

			const got = await config.getLatestDeveloperSurvey(now);
			assert.deepStrictEqual(got, want, `Test case #${i} failed`);
		}
	});

	test('prompt for survey', () => {
		// Replace Math.Random so that it always returns a value less than
		// 0.1. This means that we will always choose to prompt, in the
		// event that the user can be prompted that month.
		sandbox.stub(Math, 'random').returns(0);

		// global state -> offer survey
		const testCases: [goDeveloperSurvey.DeveloperSurveyState, boolean][] = [
			// User who is activating the extension for the first time.
			[{}, true],
			// User who has already taken the survey.
			[
				{
					lastDateAccepted: new Date('2020-04-02'),
					datePromptComputed: new Date('2020-04-02'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: true
				},
				false
			],
			// User who has declined survey prompting.
			[
				{
					datePromptComputed: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: false
				},
				false
			],
			// User who has opted into prompting, but hasn't opened the
			// extension in a while.
			[
				{
					datePromptComputed: new Date('2019-04-10'),
					lastDatePrompted: new Date('2019-04-10'),
					prompt: true
				},
				true
			],
			// User who has opted into prompting, but has been prompted < 5
			// days ago.
			[
				{
					datePromptComputed: new Date('2019-04-27'),
					lastDatePrompted: new Date('2019-04-28'),
					prompt: true
				},
				true
			],
			// User accepted the survey a year ago.
			[
				{
					datePromptComputed: new Date('2018-04-27'),
					lastDatePrompted: new Date('2018-04-28'),
					prompt: true,
					lastDateAccepted: new Date('2018-04-28')
				},
				true
			],
			// User declined the survey a year ago.
			[
				{
					datePromptComputed: new Date('2018-04-27'),
					lastDatePrompted: new Date('2018-04-28'),
					prompt: false
				},
				true
			]
		];
		testCases.map(([state, want], i) => {
			const now = new Date('2020-04-29');
			const surveyConfig: config.DeveloperSurveyConfig = {
				StartDate: new Date('2020-03-10'),
				EndDate: new Date('2020-07-10'),
				URL: ''
			};

			const got = goDeveloperSurvey.shouldPromptForSurvey(now, state, surveyConfig);
			if (want) {
				assert.ok(got, `prompt determination failed for ${i}: expected ${want}, got ${got}`);
			} else {
				assert.strictEqual(
					got,
					undefined,
					`prompt determination failed for ${i}: expected undefined, got ${got}`
				);
			}
		});
	});
});

suite('gopls opt out', () => {
	let sandbox: sinon.SinonSandbox;

	setup(() => {
		sandbox = sinon.createSandbox();
	});

	teardown(() => {
		sandbox.restore();
	});

	const today = new Date();
	const yesterday = new Date(today.valueOf() - 1000 * 60 * 60 * 24);

	// testConfig, choice, wantCount
	const testCases: [goLanguageServer.GoplsOptOutConfig, string, number][] = [
		// No saved config, different choices in the first dialog box.
		[{}, 'Yes', 1],
		[{}, 'No', 1],
		[{}, '', 1],
		[{ lastDatePrompted: new Date('2020-04-02') }, '', 1],
		[{ lastDatePrompted: yesterday }, '', 0],
		[{ prompt: false }, '', 0],
		[{ prompt: false, lastDatePrompted: new Date('2020-04-02') }, '', 0],
		[{ prompt: false, lastDatePrompted: yesterday }, '', 0],
		[{ prompt: true }, '', 1],
		[{ prompt: true, lastDatePrompted: new Date('2020-04-02') }, 'Yes', 1],
		[{ prompt: true, lastDatePrompted: yesterday }, '', 0]
	];

	testCases.map(async ([testConfig, choice, wantCount], i) => {
		test(`opt out: ${i}`, async () => {
			const stub = sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: choice });
			const getGoplsOptOutConfigStub = sandbox.stub(goLanguageServer, 'getGoplsOptOutConfig').returns(testConfig);
			const flushGoplsOptOutConfigStub = sandbox.stub(goLanguageServer, 'flushGoplsOptOutConfig');
			sandbox.stub(vscode.env, 'openExternal').resolves(true);

			await goLanguageServer.promptAboutGoplsOptOut({});
			assert.strictEqual(stub.callCount, wantCount, 'unexpected call count');
			sandbox.assert.called(getGoplsOptOutConfigStub);
			sandbox.assert.calledOnce(flushGoplsOptOutConfigStub);
			const got = flushGoplsOptOutConfigStub.getCall(0).args[0];
			if (choice === 'Yes') assert.strictEqual(got.prompt, false, 'unexpected prompt config stored');
			if (wantCount > 0)
				assert(
					got.lastDatePrompted && got.lastDatePrompted >= today,
					`unexpected lastDatePrompted: ${JSON.stringify(got.lastDatePrompted)}`
				);
		});
	});
});
