/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { GoExtensionContext } from '../context';
import { getGoConfig } from '../config';
import { daysBetween, getStateConfig, minutesBetween, storeSurveyState, timeMinute } from '../goSurvey';
import { DeveloperSurveyConfig, getLatestDeveloperSurvey } from './config';

/**
 * DEVELOPER_SURVEY_STATE_KEY is the key for the go developer survey state
 * stored in VSCode memento. It should not be changed to maintain backward
 * compatibility with previous extension versions.
 */
export const DEVELOPER_SURVEY_STATE_KEY = 'developerSurveyConfig';

/**
 * DeveloperSurveyState is the set of global properties used to determine if
 * we should prompt a user to take the go developer survey.
 * This interface is stored in VS Code's memento. The field names should not
 * be changed as they are key to parsing the stored data from previous releases.
 */
export interface DeveloperSurveyState {
	// prompt is true if the user can be prompted to take the survey.
	// It is false if the user was not selected to be prompted (e.g. part of the
	// 90% of users that are not prompted) or if we prompted and the user has
	// responded "Never" to the prompt. This state is kept per survey;
	// rejecting a survey means we will not prompt again for that specific
	// survey, but we will still prompt for the next one.
	prompt?: boolean;

	// datePromptComputed is the date on which the value of the prompt field
	// was set. It is usually the same as lastDatePrompted, but not necessarily.
	datePromptComputed?: Date;

	// lastDatePrompted is the most recent date that the user has been prompted.
	lastDatePrompted?: Date;

	// lastDateAccepted is the most recent date that the user responded "Yes"
	// to the survey prompt. The user need not have completed the survey.
	lastDateAccepted?: Date;
}

export async function maybePromptForDeveloperSurvey(goCtx: GoExtensionContext) {
	// First, check the value of the 'go.survey.prompt' setting to see
	// if the user has opted out of all survey prompts.
	const goConfig = getGoConfig();
	if (goConfig.get('survey.prompt') === false) {
		return;
	}

	const now = new Date();
	const config = await getLatestDeveloperSurvey(now);
	if (!config) {
		return;
	}

	const state = shouldPromptForSurvey(now, getDeveloperSurveyState(), config);
	if (!state) {
		return;
	}

	const prompt = async (state: DeveloperSurveyState) => {
		const currentTime = new Date();
		const { lastUserAction = new Date() } = goCtx;
		// Make sure the user has been idle for at least a minute.
		if (minutesBetween(lastUserAction, currentTime) < 1) {
			setTimeout(prompt, 5 * timeMinute);
			return;
		}
		state = await promptForDeveloperSurvey(now, state, config);
		if (state) {
			storeSurveyState(DEVELOPER_SURVEY_STATE_KEY, state);
		}
	};
	prompt(state);
}

/**
 * shouldPromptForSurvey decides if we should prompt the given user to take the
 * survey. It returns the DeveloperSurveyState if we should prompt, and
 * undefined if we should not prompt.
 */
export function shouldPromptForSurvey(
	now: Date,
	state: DeveloperSurveyState,
	config: DeveloperSurveyConfig
): DeveloperSurveyState | undefined {
	// Don't prompt if the survey hasn't started or is over.
	if (!inDateRange(config, now)) {
		return;
	}

	// TODO(rstambler): Merge checks for surveys into a setting.
	if (!state.datePromptComputed || !inDateRange(config, state.datePromptComputed)) {
		// state is missing or stale: reinitialize.
		state = {};

		// This is the first activation for this survey period, so decide if we
		// should prompt the user. This is done by generating a random number in
		// the range [0, 1) and checking if it is < probability.
		state.datePromptComputed = now;

		const promptProbability = 0.1;
		state.prompt = Math.random() < promptProbability;

		// The state have changed, store it to memento.
		storeSurveyState(DEVELOPER_SURVEY_STATE_KEY, state);
	}

	if (!state.prompt) {
		return;
	}

	// Check if the user has taken the survey in the current survey period.
	// Don't prompt them if they have.
	if (state.lastDateAccepted && inDateRange(config, state.lastDateAccepted)) {
		return;
	}

	// Check if the user has been prompted for the survey in the last 5 days.
	// Don't prompt them if they have been.
	if (state.lastDatePrompted) {
		const daysSinceLastPrompt = daysBetween(now, state.lastDatePrompted);
		// Don't prompt twice on the same day, even if it's the last day of the
		// survey.
		if (daysSinceLastPrompt < 1) {
			return;
		}
		// If the survey will end in 5 days, prompt on the next day.
		// Otherwise, wait for 5 days.
		if (daysBetween(now, config.EndDate) > 5) {
			return;
		}
	}

	return state;
}

export async function promptForDeveloperSurvey(
	now: Date,
	state: DeveloperSurveyState,
	config: DeveloperSurveyConfig
): Promise<DeveloperSurveyState> {
	const selected = await vscode.window.showInformationMessage(
		`Help shape Go’s future! Would you like to help ensure that Go is meeting your needs
by participating in this 10-minute Go Developer Survey (${config.EndDate.getFullYear().toString()}-${config.EndDate.getMonth().toString()}) before ${config.EndDate.toDateString()}?`,
		'Yes',
		'Remind me later',
		'Never'
	);

	// Update the time last asked.
	state.lastDatePrompted = now;
	state.datePromptComputed = now;

	switch (selected) {
		case 'Yes':
			{
				state.lastDateAccepted = now;
				state.prompt = true;
				await vscode.env.openExternal(vscode.Uri.parse(config.URL));
			}
			break;
		case 'Remind me later':
			state.prompt = true;

			vscode.window.showInformationMessage("No problem! We'll ask you again another time.");
			break;
		case 'Never': {
			state.prompt = false;

			const selected = await vscode.window.showInformationMessage(
				`No problem! We won't ask again.
If you'd like to opt-out of all survey prompts, you can set 'go.survey.prompt' to false.`,
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
			state.prompt = true;

			break;
	}
	return state;
}

export function getDeveloperSurveyState(): DeveloperSurveyState {
	return getStateConfig(DEVELOPER_SURVEY_STATE_KEY) as DeveloperSurveyState;
}

// Assumes that end > start.
export function inDateRange(cfg: DeveloperSurveyConfig, date: Date): boolean {
	// date is before the start time.
	if (date.getTime() - cfg.StartDate.getTime() < 0) {
		return false;
	}
	// end is before the date.
	if (cfg.EndDate.getTime() - date.getTime() < 0) {
		return false;
	}
	return true;
}
