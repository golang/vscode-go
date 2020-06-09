/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// This file is for running the godlvdap debug adapter as a standalone program
// in a separate process (e.g. when working in --server mode).
 import {GoDlvDapDebugSession} from './goDlvDapDebug';

GoDlvDapDebugSession.run(GoDlvDapDebugSession);
