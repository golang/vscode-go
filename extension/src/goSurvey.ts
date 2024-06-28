/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { CommandFactory } from './commands';
import { getGoConfig } from './config';
import { extensionId } from './const';
import { GoExtensionContext } from './context';
import {
	developerSurveyConfig,
	getDeveloperSurveyConfig,
	maybePromptForDeveloperSurvey,
	promptForDeveloperSurvey
} from './goDeveloperSurvey';
import { outputChannel } from './goStatus';
import { getLocalGoplsVersion } from './language/goLanguageServer';
import { getFromGlobalState, getFromWorkspaceState, updateGlobalState } from './stateUtils';
import { getGoVersion } from './util';
import { promptNext4Weeks } from './utils/randomDayutils';

// GoplsSurveyConfig is the set of global properties used to determine if
// we should prompt a user to take the gopls survey.
export interface GoplsSurveyConfig {
	// prompt is true if the user can be prompted to take the survey.
	// It is false if the user has responded "Never" to the prompt.
	prompt?: boolean;

	// promptThisMonth is true if we have used a random number generator
	// to determine if the user should be prompted this month.
	// It is undefined if we have not yet made the determination.
	promptThisMonth?: boolean;

	// dateToPromptThisMonth is the date on which we should prompt the user
	// this month. (It is no longer necessarily in the current month.)
	dateToPromptThisMonth?: Date;

	// dateComputedPromptThisMonth is the date on which the values of
	// promptThisMonth and dateToPromptThisMonth were set.
	dateComputedPromptThisMonth?: Date;

	// lastDatePrompted is the most recent date that the user has been prompted.
	lastDatePrompted?: Date;

	// lastDateAccepted is the most recent date that the user responded "Yes"
	// to the survey prompt. The user need not have completed the survey.
	lastDateAccepted?: Date;
}

export function maybePromptForGoplsSurvey(goCtx: GoExtensionContext) {
	// First, check the value of the 'go.survey.prompt' setting to see
	// if the user has opted out of all survey prompts.
	const goConfig = getGoConfig();
	if (goConfig.get('survey.prompt') === false) {
		return;
	}
	const now = new Date();
	let cfg = shouldPromptForSurvey(now, getGoplsSurveyConfig());
	if (!cfg) {
		return;
	}
	if (!cfg.dateToPromptThisMonth) {
		return;
	}
	const callback = async () => {
		const currentTime = new Date();
		const { lastUserAction = new Date() } = goCtx;
		// Make sure the user has been idle for at least a minute.
		if (minutesBetween(lastUserAction, currentTime) < 1) {
			setTimeout(callback, 5 * timeMinute);
			return;
		}
		cfg = await promptForGoplsSurvey(goCtx, cfg, now);
		if (cfg) {
			flushSurveyConfig(goplsSurveyConfig, cfg);
		}
	};

	// 0 if we passed the computed dateToPromptThisMonth past.
	// If the prompt date was computed a while ago (dateComputedPromptThisMonth),
	// shouldPromptForSurvey should've made a new decision before we get here.
	const delayMs = Math.max(cfg.dateToPromptThisMonth.getTime() - now.getTime(), 0);
	setTimeout(callback, delayMs);
}

export function shouldPromptForSurvey(now: Date, cfg: GoplsSurveyConfig): GoplsSurveyConfig | undefined {
	// If the prompt value is not set, assume we haven't prompted the user
	// and should do so.
	if (cfg.prompt === undefined) {
		cfg.prompt = true;
	}
	flushSurveyConfig(goplsSurveyConfig, cfg);
	if (!cfg.prompt) {
		return;
	}

	// Check if the user has taken the survey in the last year.
	// Don't prompt them if they have been.
	if (cfg.lastDateAccepted) {
		if (daysBetween(now, cfg.lastDateAccepted) < 365) {
			return;
		}
	}

	// Check if the user has been prompted for the survey in the last 90 days.
	// Don't prompt them if they have been.
	if (cfg.lastDatePrompted) {
		if (daysBetween(now, cfg.lastDatePrompted) < 90) {
			return;
		}
	}

	// Check if the extension has been activated this month.
	if (cfg.dateComputedPromptThisMonth) {
		// The extension has been activated this month, so we should have already
		// decided if the user should be prompted.
		if (daysBetween(now, cfg.dateComputedPromptThisMonth) < 28) {
			return cfg;
		}
	}
	// This is the first activation this month (or ever), so decide if we
	// should prompt the user. This is done by generating a random number in
	// the range [0, 1) and checking if it is < probability.
	// We then randomly pick a day in the next 4 weeks to prompt the user.
	// Probability is set based on the # of responses received, and will be
	// decreased if we begin receiving > 200 responses/month.
	const probability = 0.06;
	cfg.promptThisMonth = Math.random() < probability;
	if (cfg.promptThisMonth) {
		cfg.dateToPromptThisMonth = promptNext4Weeks(now);
	} else {
		cfg.dateToPromptThisMonth = undefined;
	}
	cfg.dateComputedPromptThisMonth = now;
	flushSurveyConfig(goplsSurveyConfig, cfg);
	return cfg;
}

async function promptForGoplsSurvey(
	goCtx: GoExtensionContext,
	cfg: GoplsSurveyConfig = {},
	now: Date
): Promise<GoplsSurveyConfig> {
	const selected = await vscode.window.showInformationMessage(
		`Looks like you are using the Go extension for VS Code.
Could you help us improve this extension by filling out a 1-2 minute survey about your experience with it?`,
		'Yes',
		'Not now',
		'Never'
	);

	// Update the time last asked.
	cfg.lastDatePrompted = now;

	switch (selected) {
		case 'Yes':
			{
				const { latestConfig } = goCtx;
				cfg.lastDateAccepted = now;
				cfg.prompt = true;
				const goplsEnabled = latestConfig?.enabled;
				const usersGoplsVersion = await getLocalGoplsVersion(latestConfig);
				const goV = await getGoVersion();
				const goVersion = goV ? (goV.isDevel ? 'devel' : goV.format(true)) : 'na';
				const surveyURL = `https://go.dev/s/ide-hats-survey/?s=c&usingGopls=${goplsEnabled}&gopls=${usersGoplsVersion?.version}&extid=${extensionId}&go=${goVersion}&os=${process.platform}`;
				await vscode.env.openExternal(vscode.Uri.parse(surveyURL));
			}
			break;
		case 'Not now':
			cfg.prompt = true;

			vscode.window.showInformationMessage("No problem! We'll ask you again another time.");
			break;
		case 'Never': {
			cfg.prompt = false;

			const selected = await vscode.window.showInformationMessage(
				`No problem! We won't ask again.
To opt-out of all survey prompts, please disable the 'Go > Survey: Prompt' setting.`,
				'Open Settings'
			);
			switch (selected) {
				case 'Open Settings':
					vscode.commands.executeCommand('workbench.action.openSettings', 'go.survey.prompt');
					break;
				default:
					break;
			}
			break;
		}
		default:
			// If the user closes the prompt without making a selection, treat it
			// like a "Not now" response.
			cfg.prompt = true;

			break;
	}
	return cfg;
}

export const goplsSurveyConfig = 'goplsSurveyConfig';

function getGoplsSurveyConfig(): GoplsSurveyConfig {
	return getStateConfig(goplsSurveyConfig) as GoplsSurveyConfig;
}

export const resetSurveyConfigs: CommandFactory = () => () => {
	flushSurveyConfig(goplsSurveyConfig, null);
	flushSurveyConfig(developerSurveyConfig, null);
};

export function flushSurveyConfig(key: string, cfg: any) {
	if (cfg) {
		updateGlobalState(key, JSON.stringify(cfg));
	} else {
		updateGlobalState(key, null); // reset
	}
}

export function getStateConfig(globalStateKey: string, workspace?: boolean): any {
	let saved: any;
	if (workspace === true) {
		saved = getFromWorkspaceState(globalStateKey);
	} else {
		saved = getFromGlobalState(globalStateKey);
	}
	if (saved === undefined) {
		return {};
	}
	try {
		const cfg = JSON.parse(saved, (key: string, value: any) => {
			// Make sure values that should be dates are correctly converted.
			if (key.toLowerCase().includes('date') || key.toLowerCase().includes('timestamp')) {
				return new Date(value);
			}
			return value;
		});
		return cfg || {};
	} catch (err) {
		console.log(`Error parsing JSON from ${saved}: ${err}`);
		return {};
	}
}

export const showSurveyConfig: CommandFactory = (ctx, goCtx) => async () => {
	// TODO(rstambler): Add developer survey config.
	outputChannel.appendLine('HaTs Survey Configuration');
	outputChannel.appendLine(JSON.stringify(getGoplsSurveyConfig(), null, 2));
	outputChannel.show();

	outputChannel.appendLine('Developer Survey Configuration');
	outputChannel.appendLine(JSON.stringify(getDeveloperSurveyConfig(), null, 2));
	outputChannel.show();

	let selected = await vscode.window.showInformationMessage('Prompt for HaTS survey?', 'Yes', 'Maybe', 'No');
	switch (selected) {
		case 'Yes':
			promptForGoplsSurvey(goCtx, getGoplsSurveyConfig(), new Date());
			break;
		case 'Maybe':
			maybePromptForGoplsSurvey(goCtx);
			break;
		default:
			break;
	}
	selected = await vscode.window.showInformationMessage('Prompt for Developer survey?', 'Yes', 'Maybe', 'No');
	switch (selected) {
		case 'Yes':
			promptForDeveloperSurvey(getDeveloperSurveyConfig(), new Date());
			break;
		case 'Maybe':
			maybePromptForDeveloperSurvey(goCtx);
			break;
		default:
			break;
	}
};

export const timeMinute = 1000 * 60;
const timeHour = timeMinute * 60;
export const timeDay = timeHour * 24;

// daysBetween returns the number of days between a and b.
export function daysBetween(a: Date, b: Date): number {
	return msBetween(a, b) / timeDay;
}

// minutesBetween returns the number of minutes between a and b.
export function minutesBetween(a: Date, b: Date): number {
	return msBetween(a, b) / timeMinute;
}

export function msBetween(a: Date, b: Date): number {
	return Math.abs(a.getTime() - b.getTime());
}
