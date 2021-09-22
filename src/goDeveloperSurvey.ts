/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import { lastUserAction } from './goLanguageServer';
import { daysBetween, flushSurveyConfig, getStateConfig, minutesBetween, timeMinute } from './goSurvey';

// Start and end dates of the survey.
export const startDate = new Date('2021-09-01'); // TODO(rstambler): Set an actual start date.
export const endDate = new Date('2022-01-01'); // TODO(rstambler): Set an actual end date.

// DeveloperSurveyConfig is the set of global properties used to determine if
// we should prompt a user to take the gopls survey.
export interface DeveloperSurveyConfig {
	// prompt is true if the user can be prompted to take the survey.
	// It is false if the user has responded "Never" to the prompt.
	prompt?: boolean;

	// datePromptComputed is the date on which the value of the prompt field
	// was set. It is usually the same as lastDatePrompted, but not
	// necessarily.
	datePromptComputed?: Date;

	// lastDatePrompted is the most recent date that the user has been prompted.
	lastDatePrompted?: Date;

	// lastDateAccepted is the most recent date that the user responded "Yes"
	// to the survey prompt. The user need not have completed the survey.
	lastDateAccepted?: Date;
}

export function maybePromptForDeveloperSurvey() {
	const now = new Date();
	let cfg = shouldPromptForSurvey(now, getSurveyConfig());
	if (!cfg) {
		return;
	}
	if (!cfg.prompt) {
		return;
	}
	const callback = async () => {
		const currentTime = new Date();

		// Make sure the user has been idle for at least a minute.
		if (minutesBetween(lastUserAction, currentTime) < 1) {
			setTimeout(callback, 5 * timeMinute);
			return;
		}
		cfg = await promptForDeveloperSurvey(cfg, now);
		if (cfg) {
			flushSurveyConfig(developerSurveyConfig, cfg);
		}
	};
	callback();
}

// shouldPromptForSurvey decides if we should prompt the given user to take the
// survey. It returns the DeveloperSurveyConfig if we should prompt, and
// undefined if we should not prompt.
export function shouldPromptForSurvey(now: Date, cfg: DeveloperSurveyConfig): DeveloperSurveyConfig {
	// TODO(rstambler): Merge checks for surveys into a setting.

	// Don't prompt if the survey hasn't started or is over.
	if (!inDateRange(startDate, endDate, now)) {
		return;
	}

	// Reset the values if we're outside of the previous survey period.
	if (cfg.datePromptComputed && !inDateRange(startDate, endDate, cfg.datePromptComputed)) {
		cfg = {};
	}
	// If the prompt value is not set, assume we haven't prompted the user
	// and should do so.
	if (cfg.prompt === undefined) {
		cfg.prompt = true;
		cfg.datePromptComputed = now;
	}
	flushSurveyConfig(developerSurveyConfig, cfg);
	if (!cfg.prompt) {
		return;
	}

	// Check if the user has taken the survey in the current survey period.
	// Don't prompt them if they have.
	if (cfg.lastDateAccepted) {
		if (inDateRange(startDate, endDate, cfg.lastDateAccepted)) {
			return;
		}
	}

	// Check if the user has been prompted for the survey in the last 5 days.
	// Don't prompt them if they have been.
	if (cfg.lastDatePrompted) {
		// If the survey will end in 5 days, prompt the next day.
		// Otherwise, wait for 5 days.
		if (daysBetween(now, endDate) > 5 && daysBetween(now, cfg.lastDatePrompted) < 5) {
			return;
		}
		return cfg;
	}

	// This is the first activation this month (or ever), so decide if we
	// should prompt the user. This is done by generating a random number in
	// the range [0, 1) and checking if it is < probability.
	const probability = 0.2;
	cfg.datePromptComputed = now;
	cfg.prompt = Math.random() < probability;
	flushSurveyConfig(developerSurveyConfig, cfg);
	return cfg;
}

async function promptForDeveloperSurvey(cfg: DeveloperSurveyConfig, now: Date): Promise<DeveloperSurveyConfig> {
	const selected = await vscode.window.showInformationMessage(
		// TODO(rstambler): Figure out how to phrase this.
		'Looks like you are coding in Go! We are currently running a Go developer survey...',
		'Yes',
		'Not now',
		'Never'
	);

	// Update the time last asked.
	cfg.lastDatePrompted = now;
	cfg.datePromptComputed = now;

	switch (selected) {
		case 'Yes':
			{
				cfg.lastDateAccepted = now;
				cfg.prompt = true;
				const surveyURL = 'https://google.com?utm_source=vscode-go'; // set source to vscode-go
				await vscode.env.openExternal(vscode.Uri.parse(surveyURL));
			}
			break;
		case 'Remind me later':
			cfg.prompt = true;

			vscode.window.showInformationMessage("No problem! We'll ask you again another time.");
			break;
		case 'Never':
			cfg.prompt = false;

			vscode.window.showInformationMessage("No problem! We won't ask again.");
			break;
		default:
			// If the user closes the prompt without making a selection, treat it
			// like a "Not now" response.
			cfg.prompt = true;

			break;
	}
	return cfg;
}

export const developerSurveyConfig = 'developerSurveyConfig';

function getSurveyConfig(): DeveloperSurveyConfig {
	return getStateConfig(developerSurveyConfig) as DeveloperSurveyConfig;
}

// Assumes that end > start.
export function inDateRange(start: Date, end: Date, date: Date): boolean {
	// date is before the start time.
	if (date.getTime() - start.getTime() < 0) {
		return false;
	}
	// end is before the date.
	if (end.getTime() - date.getTime() < 0) {
		return false;
	}
	return true;
}
