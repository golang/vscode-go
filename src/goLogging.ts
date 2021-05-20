/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'trace' | 'verbose';

const levels: { [key in LogLevel]: number } = {
	off: -1,
	error: 0,
	warn: 1,
	info: 2,
	trace: 3,
	verbose: 4
};

function levelToString(level: number) {
	switch (level) {
		case levels.error:
			return 'Error';
		case levels.warn:
			return 'Warn';
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
	warn(msg: string) {
		this.log(levels.warn, msg);
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
	defaultLogger = new Logger(cfg.level, undefined, true);
}

export function logError(msg: string) {
	defaultLogger?.error(msg);
}

export function logWarn(msg: string) {
	defaultLogger?.warn(msg);
}

export function logInfo(msg: string) {
	defaultLogger?.info(msg);
}

export function logTrace(msg: string) {
	defaultLogger?.trace(msg);
}

export function logVerbose(msg: string) {
	defaultLogger?.debug(msg);
}
