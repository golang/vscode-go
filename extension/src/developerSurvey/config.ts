/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { getStateConfig } from '../goSurvey';
import { getBinPath } from '../util';
import { updateGlobalState } from '../stateUtils';
import { outputChannel } from '../goStatus';

/**
 * DeveloperSurveyConfig holds the configuration for the Go Developer survey.
 */
export interface DeveloperSurveyConfig {
	/** The start date for the survey promotion. The survey will not be prompted before this date. */
	StartDate: Date;
	/** The end date for the survey promotion. The survey will not be prompted after this date. */
	EndDate: Date;
	/** The URL for the survey. */
	URL: string;
}

/**
 * DEVELOPER_SURVEY_CONFIG_STATE_KEY is the key for the latest go developer
 * survey config stored in VSCode memento. It should not be changed to maintain
 * backward compatibility with previous extension versions.
 */
export const DEVELOPER_SURVEY_CONFIG_STATE_KEY = 'developerSurveyConfigState';

/**
 * DeveloperSurveyConfigState holds the most recently fetched survey
 * configuration, along with metadata about when it was fetched and its version.
 * This data is stored in the global memento to be used as a cache.
 */
export interface DeveloperSurveyConfigState {
	config: DeveloperSurveyConfig;
	version: string;
	lastDateUpdated: Date;
}

export function getDeveloperSurveyConfigState(): DeveloperSurveyConfigState {
	return getStateConfig(DEVELOPER_SURVEY_CONFIG_STATE_KEY) as DeveloperSurveyConfigState;
}

/**
 * getLatestDeveloperSurvey fetches the latest Go Developer Survey configuration.
 *
 * It first checks for a cached version of the survey config and returns it if it's
 * less than 24 hours old. Otherwise, it attempts to download the latest survey
 * configuration by fetching the specified Go module. If the download fails,
 * it falls back to returning the stale cached config if available.
 *
 * @returns A Promise that resolves to the DeveloperSurveyConfig, or undefined.
 */
export async function getLatestDeveloperSurvey(now: Date): Promise<DeveloperSurveyConfig | undefined> {
	const oldState = getDeveloperSurveyConfigState();
	if (oldState && oldState.config) {
		const SURVEY_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

		if (now.getTime() - oldState.lastDateUpdated.getTime() <= SURVEY_CACHE_DURATION_MS) {
			outputChannel.info(`Using cached Go developer survey: ${oldState.version}`);
			outputChannel.info(
				`Survey active from ${oldState.config.StartDate.toDateString()} to ${oldState.config.EndDate.toDateString()}`
			);
			return oldState.config;
		}
	}

	// Fetch the latest go developer survey module and flush it to momento.
	const res = await fetchRemoteSurveyConfig();
	if (!res) {
		if (oldState && oldState.config) {
			outputChannel.info(`Falling back to cached Go developer survey: ${oldState.version}`);
			outputChannel.info(
				`Survey active from ${oldState.config.StartDate.toDateString()} to ${oldState.config.EndDate.toDateString()}`
			);
			return oldState.config;
		} else {
			return undefined;
		}
	}

	const [content, version] = res;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const config = JSON.parse(content.toString(), (key: string, value: any) => {
		// Manually parse date fields.
		if (key === 'StartDate' || key === 'EndDate') {
			return new Date(value);
		}
		return value;
	}) as DeveloperSurveyConfig;

	const newState: DeveloperSurveyConfigState = {
		config: config,
		version: version,
		lastDateUpdated: now
	};

	updateGlobalState(DEVELOPER_SURVEY_CONFIG_STATE_KEY, JSON.stringify(newState));

	outputChannel.info(`Using fetched Go developer survey: ${newState.version}`);
	outputChannel.info(
		`Survey active from ${newState.config.StartDate.toDateString()} to ${newState.config.EndDate.toDateString()}`
	);
	return config;
}

/**
 * Fetches the latest survey config file from its Go module.
 * @returns A tuple containing the file content and the module version.
 *
 * This is defined as a const function expression rather than a function
 * declaration to allow it to be stubbed in tests. By defining it as a const,
 * it becomes a property on the module's exports object, which can be
 * replaced by test spies (e.g., using sandbox.stub).
 */
export const fetchRemoteSurveyConfig = async (): Promise<[string, string] | undefined> => {
	const SURVEY_MODULE_PATH = 'github.com/golang/vscode-go/survey';

	outputChannel.info('Fetching latest go developer survey');
	const goRuntimePath = getBinPath('go');
	if (!goRuntimePath) {
		console.warn('Failed to run "go mod download" as the "go" binary cannot be found');
		return;
	}

	const execFile = util.promisify(cp.execFile);

	try {
		const { stdout } = await execFile(goRuntimePath, ['mod', 'download', '-json', `${SURVEY_MODULE_PATH}@latest`]);

		/**
		 * Interface for the expected JSON output from `go mod download -json`.
		 * See https://go.dev/ref/mod#go-mod-download for details.
		 */
		interface DownloadModuleOutput {
			Path: string;
			Version: string;
			Dir: string;
		}
		const info = JSON.parse(stdout) as DownloadModuleOutput;
		return [fs.readFileSync(path.join(info.Dir, 'config.json')).toString(), info.Version];
	} catch (err) {
		outputChannel.error(
			`Failed to download the go developer survey module and parse "config.json": ${SURVEY_MODULE_PATH}:${err}`
		);
		return;
	}
};
