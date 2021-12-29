/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');

// getGoConfig is declared as an exported const rather than a function, so it can be stubbbed in testing.
export const getGoConfig = (uri?: vscode.Uri) => {
	return getConfig('go', uri);
};

// getGoplsConfig returns the user's gopls configuration.
export function getGoplsConfig(uri?: vscode.Uri) {
	return getConfig('gopls', uri);
}

function getConfig(section: string, uri?: vscode.Uri) {
	if (!uri) {
		if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		} else {
			uri = null;
		}
	}
	return vscode.workspace.getConfiguration(section, uri);
}

// True if the extension is running in known cloud-based IDEs.
export const IsInCloudIDE =
	process.env.CLOUD_SHELL === 'true' || process.env.CODESPACES === 'true' || !!process.env.GITPOD_WORKSPACE_ID;
