/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

type LogLevel = 'off' | 'error' | 'info' | 'trace' | 'verbose';

const levels: { [key in LogLevel]: number } = {
	off: -1,
	error: 0,
	info: 1,
	trace: 2,
	verbose: 3
};
// TODO: consider 'warning' level.

function levelToString(level: number) {
	switch (level) {
		case levels.error:
			return 'Error';
		case levels.info:
			return 'Info';
		case levels.trace:
			return 'Trace';
		case levels.verbose:
			return 'Verbose';
	}
	return '';
}

interface outputChannelType {
	appendLine: (msg: string) => void;
}
// Logger outputs messages of the specified log levels to the vscode output channel or console.
export class Logger {
	protected minLevel: number;

	constructor(levelName: LogLevel, private outputChannel?: outputChannelType, private logToConsole?: boolean) {
		this.minLevel = levels[levelName] || levels.error;
	}

	protected log(msgLevel: number, msg: string) {
		if (this.minLevel < 0) {
			return; // logging is off.
		}
		if (this.minLevel < msgLevel) {
			return;
		}
		this.outputChannel?.appendLine(msg);
		if (this.logToConsole) console.log(msg);
	}

	error(msg: string) {
		this.log(levels.error, msg);
	}
	info(msg: string) {
		this.log(levels.info, msg);
	}
	trace(msg: string) {
		this.log(levels.trace, msg);
	}
	debug(msg: string) {
		this.log(levels.verbose, msg);
	}
}

// TimestampedLogger is a logger that prepends the timestamp to every log message.
export class TimestampedLogger extends Logger {
	log(msgLevel: number, msg: string) {
		const ts = new Date();
		const hhmmss = ts.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
		const msec = ts.getMilliseconds();
		super.log(msgLevel, `[${levelToString(msgLevel)} - ${hhmmss}.${msec}] ${msg}`);
	}
}

export interface LogConfig {
	level: LogLevel;
}

let defaultLogger: Logger;

export function setLogConfig(cfg: LogConfig) {
	defaultLogger = new Logger(cfg.level);
}

export function logVerbose(msg: string) {
	defaultLogger?.debug(msg);
}

export function logError(msg: string) {
	defaultLogger?.error(msg);
}

export function logInfo(msg: string) {
	defaultLogger?.info(msg);
}
