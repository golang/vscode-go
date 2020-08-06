/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This file is for running the godlvdap debug adapter as a standalone program
// in a separate process (e.g. when working in --server mode).
//
// NOTE: we must not include this file when we switch to the inline debug adapter
// launch mode. This installs a process-wide uncaughtException handler
// which can result in the extension host crash.

import { logger } from 'vscode-debugadapter';
import { GoDlvDapDebugSession } from './goDlvDebug';

process.on('uncaughtException', (err: any) => {
	const errMessage = err && (err.stack || err.message);
	logger.error(`Unhandled error in debug adapter: ${errMessage}`);
	throw err;
});

GoDlvDapDebugSession.run(GoDlvDapDebugSession);
