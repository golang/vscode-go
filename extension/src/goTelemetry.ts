/*---------------------------------------------------------
 * Copyright 2023 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';

import { createHash } from 'crypto';
import { ExecuteCommandRequest } from 'vscode-languageserver-protocol';
import { daysBetween } from './goSurvey';
import { LanguageClient } from 'vscode-languageclient/node';
import * as cp from 'child_process';
import { getWorkspaceFolderPath } from './util';
import { toolExecutionEnvironment } from './goEnv';

// Name of the prompt telemetry command. This is also used to determine if the gopls instance supports telemetry.
// Exported for testing.
export const GOPLS_MAYBE_PROMPT_FOR_TELEMETRY = 'gopls.maybe_prompt_for_telemetry';

// Key for the global state that holds the very first time the telemetry-enabled gopls was observed.
// Exported for testing.
export const TELEMETRY_START_TIME_KEY = 'telemetryStartTime';

// Run our encode/decode function for the Date object, to be defensive
// from vscode Memento API behavior change.
// Exported for testing.
export function recordTelemetryStartTime(storage: vscode.Memento, date: Date) {
	storage.update(TELEMETRY_START_TIME_KEY, date.toJSON());
}

function readTelemetryStartTime(storage: vscode.Memento): Date | null {
	const value = storage.get<string | number | Date>(TELEMETRY_START_TIME_KEY);
	if (!value) {
		return null;
	}
	const telemetryStartTime = new Date(value);
	if (telemetryStartTime.toString() === 'Invalid Date') {
		return null;
	}
	return telemetryStartTime;
}

enum ReporterState {
	NOT_INITIALIZED,
	IDLE,
	STARTING,
	RUNNING
}

// exported for testing.
export class TelemetryReporter implements vscode.Disposable {
	private _state = ReporterState.NOT_INITIALIZED;
	private _counters: { [key: string]: number } = {};
	private _flushTimer: NodeJS.Timeout | undefined;
	private _tool = '';
	constructor(flushIntervalMs = 60_000, private counterFile: string = '') {
		if (flushIntervalMs > 0) {
			// periodically call flush.
			this._flushTimer = setInterval(this.flush.bind(this), flushIntervalMs);
		}
	}

	public setTool(tool: string) {
		// allow only once.
		if (tool === '' || this._state !== ReporterState.NOT_INITIALIZED) {
			return;
		}
		this._state = ReporterState.IDLE;
		this._tool = tool;
	}

	public add(key: string, value: number) {
		if (value <= 0) {
			return;
		}
		key = key.replace(/[\s\n]/g, '_');
		this._counters[key] = (this._counters[key] || 0) + value;
	}

	// flush is called periodically (by the callback set up in the constructor)
	// or when the extension is deactivated (with force=true).
	public async flush(force = false) {
		// If flush runs with force=true, ignore the state and skip state update.
		if (!force && this._state !== ReporterState.IDLE) {
			// vscgo is not installed yet or is running. flush next time.
			return 0;
		}
		if (!force) {
			this._state = ReporterState.STARTING;
		}
		try {
			await this.writeGoTelemetry();
		} catch (e) {
			console.log(`failed to flush telemetry data: ${e}`);
		} finally {
			if (!force) {
				this._state = ReporterState.IDLE;
			}
		}
	}

	private writeGoTelemetry() {
		const data = Object.entries(this._counters);
		if (data.length === 0) {
			return;
		}
		this._counters = {};

		let stderr = '';
		return new Promise<number | null>((resolve, reject) => {
			const env = toolExecutionEnvironment();
			if (this.counterFile !== '') {
				env['TELEMETRY_COUNTER_FILE'] = this.counterFile;
			}
			const p = cp.spawn(this._tool, ['inc_counters'], {
				cwd: getWorkspaceFolderPath(),
				env
			});

			p.stderr.on('data', (data) => {
				stderr += data;
			});

			// 'close' fires after exit or error when the subprocess closes all stdio.
			p.on('close', (exitCode, signal) => {
				if (exitCode > 0) {
					reject(`exited with code=${exitCode} signal=${signal} stderr=${stderr}`);
				} else {
					resolve(exitCode);
				}
			});
			// Stream key/value to the vscgo process.
			data.forEach(([key, value]) => {
				p.stdin.write(`${key} ${value}\n`);
			});
			p.stdin.end();
		});
	}

	public async dispose() {
		if (this._flushTimer) {
			clearInterval(this._flushTimer);
		}
		this._flushTimer = undefined;
		await this.flush(true); // flush any remaining data in buffer.
	}
}

// global telemetryReporter instance.
export const telemetryReporter = new TelemetryReporter();

// TODO(hyangah): consolidate the list of all the telemetries and bucketting functions.

export function addTelemetryEvent(name: string, count: number) {
	telemetryReporter.add(name, count);
}

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
		const telemetryStartTime = readTelemetryStartTime(globalState);
		if (!telemetryStartTime) {
			recordTelemetryStartTime(globalState, new Date());
		}
	}

	async promptForTelemetry(
		isPreviewExtension: boolean,
		isVSCodeTelemetryEnabled: boolean = vscode.env.isTelemetryEnabled,
		samplingInterval = 10 /* prompt N out of 1000. 10 = 1% */
	) {
		if (!this.active) return;

		// Do not prompt yet if the user disabled vscode's telemetry.
		// TODO(hyangah): remove this condition after we roll out to 100%. It's possible
		// users who don't want vscode's telemetry are still willing to opt in.
		if (!isVSCodeTelemetryEnabled) return;

		// Allow at least 7days for gopls to collect some data.
		const telemetryStartTime = readTelemetryStartTime(this.globalState);
		if (!telemetryStartTime) {
			return;
		}
		if (daysBetween(telemetryStartTime, new Date()) < 7) {
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
		return hashMachineID(salt);
	}
}

// Set telemetry env vars for gopls. See gopls/internal/server/prompt.go
// TODO(hyangah): add an integration testing after gopls v0.17 becomes available.
export function setTelemetryEnvVars(globalState: vscode.Memento, env: NodeJS.ProcessEnv) {
	if (!env['GOTELEMETRY_GOPLS_CLIENT_TOKEN']) {
		env['GOTELEMETRY_GOPLS_CLIENT_TOKEN'] = `${hashMachineID() + 1}`; // [1, 1000]
	}
	if (!env['GOTELEMETRY_GOPLS_CLIENT_START_TIME']) {
		const start = readTelemetryStartTime(globalState);
		if (start) {
			const unixSec = Math.floor(start.getTime() / 1000);
			env['GOTELEMETRY_GOPLS_CLIENT_START_TIME'] = `${unixSec}`;
		}
	}
}

// Map vscode.env.machineId to an integer in [0, 1000).
function hashMachineID(salt?: string): number {
	const hash = createHash('md5').update(`${vscode.env.machineId}${salt}`).digest('hex');
	return parseInt(hash.substring(0, 8), 16) % 1000;
}
