/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { Uri } from 'vscode';
export { ToolAtVersion } from './goTools';

export interface CommandInvocation {
	binPath: string;
}

/**
 * The API we expose to other extensions.
 *
 * @example
 * const Go = await vscode.extensions
 *     .getExtension<ExtensionAPI>('golang.go')
 *     .then(x => x.activate());
 *
 * console.log(`Go extension is a ${Go.isPreview ? 'preview' : 'release'} version`);
 */
export interface ExtensionAPI {
	/** True if the extension is running in preview mode (e.g. prerelease) */
	isPreview: boolean;

	settings: {
		/**
		 * Returns the execution command corresponding to the specified resource, taking into account
		 * any workspace-specific settings for the workspace to which this resource belongs.
		 */
		getExecutionCommand(toolName: string, resource?: Uri): CommandInvocation | undefined;
	};
}
