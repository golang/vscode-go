/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { createHash } from 'crypto';
import { ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { daysBetween } from './goSurvey';
import { LanguageClient } from 'vscode-languageclient/node';

// Name of the prompt telemetry command. This is also used to determine if the gopls instance supports telemetry.
// Exported for testing.
export const GOPLS_MAYBE_PROMPT_FOR_TELEMETRY = 'gopls.maybe_prompt_for_telemetry';

// Key for the global state that holds the very first time the telemetry-enabled gopls was observed.
// Exported for testing.
export const TELEMETRY_START_TIME_KEY = 'telemetryStartTime';

// Go extension delegates most of the telemetry logic to gopls.
// TelemetryService provides API to interact with gopls's telemetry.
export class TelemetryService {
	private active = false;
	constructor(
		private languageClient: Pick<LanguageClient, 'sendRequest'> | undefined,
		private globalState: vscode.Memento,
		commands: string[] = []
	) {
		if (!languageClient || !commands.includes(GOPLS_MAYBE_PROMPT_FOR_TELEMETRY)) {
			// we are not backed by the gopls version that supports telemetry.
			return;
		}

		this.active = true;
		// record the first time we see the gopls with telemetry support.
		// The timestamp will be used to avoid prompting too early.
		const telemetryStartTime = globalState.get<Date>(TELEMETRY_START_TIME_KEY);
		if (!telemetryStartTime) {
			globalState.update(TELEMETRY_START_TIME_KEY, new Date());
		}
	}

	async promptForTelemetry(
		isPreviewExtension: boolean,
		isVSCodeTelemetryEnabled: boolean = vscode.env.isTelemetryEnabled,
		samplingInterval = 1 /* prompt N out of 1000. 1 = 0.1% */
	) {
		if (!this.active) return;

		// Do not prompt yet if the user disabled vscode's telemetry.
		// TODO(hyangah): remove this condition after we roll out to 100%. It's possible
		// users who don't want vscode's telemetry are still willing to opt in.
		if (!isVSCodeTelemetryEnabled) return;

		// Allow at least 7days for gopls to collect some data.
		const now = new Date();
		const telemetryStartTime = this.globalState.get<Date>(TELEMETRY_START_TIME_KEY, now);
		if (daysBetween(telemetryStartTime, now) < 7) {
			return;
		}

		// For official extension users, prompt only N out of 1000.
		if (!isPreviewExtension && this.hashMachineID() % 1000 >= samplingInterval) {
			return;
		}

		try {
			await this.languageClient?.sendRequest(ExecuteCommandRequest.type, {
				command: GOPLS_MAYBE_PROMPT_FOR_TELEMETRY
			});
		} catch (e) {
			console.log(`failed to send telemetry request: ${e}`);
		}
	}

	// exported for testing.
	public hashMachineID(salt?: string): number {
		const hash = createHash('md5').update(`${vscode.env.machineId}${salt}`).digest('hex');
		return parseInt(hash.substring(0, 8), 16);
	}
}
