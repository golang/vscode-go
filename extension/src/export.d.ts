/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { Uri } from 'vscode';
export { ToolAtVersion } from './goTools';

export interface CommandInvocation {
	binPath: string;
}

export interface ExtensionAPI {
	settings: {
		/**
		 * Returns the execution command corresponding to the specified resource, taking into account
		 * any workspace-specific settings for the workspace to which this resource belongs.
		 */
		getExecutionCommand(toolName: string, resource?: Uri): CommandInvocation | undefined;
	};
}
