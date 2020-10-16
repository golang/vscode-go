/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

// Our log level.
enum LogLevel {
	Off = 100,
	Error = 50,
	Info = 30,
	Verbose = 20,
	// TODO: Trace, Warn level
}

let currentLogLevel: LogLevel = LogLevel.Error;

const levelMap: { [k: string]: LogLevel } = {
	off: LogLevel.Off,
	error: LogLevel.Error,
	info: LogLevel.Info,
	verbose: LogLevel.Verbose,
};

function levelPrefix(l: LogLevel): string {
	switch (l) {
		case LogLevel.Off: return 'Go[O]:';
		case LogLevel.Error: return 'Go[E]:';
		case LogLevel.Info: return 'Go[I]:';
		case LogLevel.Verbose: return 'Go[V]:';
		default: return 'Go[?]:';
	}
}

export interface LogConfig {
	level: string;
}

export function setLogConfig(cfg: LogConfig) {
	const logLevel = cfg?.level || 'error';
	const l = levelMap[logLevel];
	if (l) {
		currentLogLevel = l;
		return;
	}
	logError(`setLogLevel requested with invalid log level ${logLevel}, ignoring...`);
}

// tslint:disable-next-line:no-any
function log(logLevel: LogLevel, ...args: any[]) {
	if (logLevel < currentLogLevel) {
		return;
	}
	const p = levelPrefix(logLevel);
	const a = Array.from(args);
	a.unshift(p);
	console.log(...a);
	// TODO: support logging in vscode output channel.
}

// tslint:disable-next-line:no-any
export function logVerbose(...args: any[]) {
	log(LogLevel.Verbose, ...args);
}

// tslint:disable-next-line:no-any
export function logError(...args: any[]) {
	log(LogLevel.Error, ...args);
}

// tslint:disable-next-line:no-any
export function logInfo(...args: any[]) {
	log(LogLevel.Info, ...args);
}
