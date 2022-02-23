/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import assert from 'assert';
import sinon = require('sinon');
import vscode = require('vscode');
import goLanguageServer = require('../../src/goLanguageServer');
import goSurvey = require('../../src/goSurvey');
import goDeveloperSurvey = require('../../src/goDeveloperSurvey');

suite('gopls survey tests', () => {
	test('prompt for survey', () => {
		// global state -> offer survey
		const testCases: [goSurvey.GoplsSurveyConfig, boolean][] = [
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
	test('inRange', () => {
		// start, end, date => inRange
		const testCases: [Date, Date, Date, boolean][] = [
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2021-10-31'), true],
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2020-10-31'), false],
			[new Date('2021-09-01'), new Date('2021-11-10'), new Date('2022-10-31'), false]
		];
		testCases.map(([start, end, date, want]) => {
			const got = goDeveloperSurvey.inDateRange(start, end, date);
			assert.equal(got, want, `expected inRange(${start}, ${end}, ${date} = ${want}, got: ${got})`);
		});
	});

	test('prompt for survey', () => {
		// global state -> offer survey
		const testCases: [goDeveloperSurvey.DeveloperSurveyConfig, boolean][] = [
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
				undefined
			],
			// User who has declined survey prompting.
			[
				{
					datePromptComputed: new Date('2020-04-10'),
					lastDatePrompted: new Date('2020-04-02'),
					prompt: false
				},
				undefined
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
		testCases.map(([testConfig, wantPrompt], i) => {
			// Replace Math.Random so that it always returns a value less than
			// 0.2. This means that we will always choose to prompt, in the
			// event that the user can be prompted that month.
			sinon.replace(Math, 'random', () => 0);

			sinon.replace(goDeveloperSurvey, 'startDate', new Date('2020-03-10'));
			sinon.replace(goDeveloperSurvey, 'endDate', new Date('2020-07-10'));

			const now = new Date('2020-04-29');
			const gotPrompt = goDeveloperSurvey.shouldPromptForSurvey(now, testConfig);
			if (wantPrompt) {
				assert.ok(gotPrompt, `prompt determination failed for ${i}: expected ${wantPrompt}, got ${gotPrompt}`);
			} else {
				assert.equal(
					gotPrompt,
					wantPrompt,
					`prompt determination failed for ${i}: expected undefined, got ${gotPrompt}`
				);
			}
			sinon.restore();
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

	const testCases: [goLanguageServer.GoplsOptOutConfig, string, number][] = [
		// No saved config, different choices in the first dialog box.
		[{}, 'Enable', 1],
		[{}, 'Not now', 1],
		[{}, 'Never', 2],
		// // Saved config, doesn't matter what the user chooses.
		[{ prompt: false }, '', 0],
		[{ prompt: false, lastDatePrompted: new Date() }, '', 0],
		[{ prompt: true }, '', 1],
		[{ prompt: true, lastDatePrompted: new Date() }, '', 0]
	];

	testCases.map(async ([testConfig, choice, wantCount], i) => {
		test(`opt out: ${i}`, async () => {
			const stub = sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: choice });
			const getGoplsOptOutConfigStub = sandbox.stub(goLanguageServer, 'getGoplsOptOutConfig').returns(testConfig);

			await goLanguageServer.promptAboutGoplsOptOut();
			assert.strictEqual(stub.callCount, wantCount);
			sandbox.assert.called(getGoplsOptOutConfigStub);
		});
	});
});
