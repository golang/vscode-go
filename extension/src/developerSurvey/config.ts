/*---------------------------------------------------------
 * Copyright 2025 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

/**
 * DeveloperSurveyConfig holds the configuration for the Go Developer survey.
 */
export interface DeveloperSurveyConfig {
	/** The start date for the survey promotion. The survey will not be prompted before this date. */
	Start: Date;
	/** The end date for the survey promotion. The survey will not be prompted after this date. */
	End: Date;
	/** The URL for the survey. */
	URL: string;
}

export const latestSurveyConfig: DeveloperSurveyConfig = {
	Start: new Date('Sep 9 2024 00:00:00 GMT'),
	End: new Date('Sep 23 2024 00:00:00 GMT'),
	URL: 'https://google.qualtrics.com/jfe/form/SV_ei0CDV2K9qQIsp8?s=p'
};
