/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
import { getCurrentGoPath, getToolsGopath } from './util';

export function getToolsEnvironment(): NodeJS.Dict<string> {
	// http.proxy setting takes precedence over environment variables
	const httpProxy = vscode.workspace.getConfiguration('http', null).get('proxy');
	let envForTools = Object.assign({}, process.env);
	if (httpProxy) {
		envForTools = Object.assign({}, process.env, {
			http_proxy: httpProxy,
			HTTP_PROXY: httpProxy,
			https_proxy: httpProxy,
			HTTPS_PROXY: httpProxy
		});
	}

	// If the go.toolsGopath is set, use its value as the GOPATH for `go` processes.
	// Else use the Current Gopath
	let toolsGopath = getToolsGopath();
	if (toolsGopath) {
		// User has explicitly chosen to use toolsGopath, so ignore GOBIN.
		envForTools['GOBIN'] = '';
	} else {
		toolsGopath = getCurrentGoPath();
	}
	if (!toolsGopath) {
		const msg = 'Cannot install Go tools. Set either go.gopath or go.toolsGopath in settings.';
		vscode.window.showInformationMessage(msg, 'Open User Settings', 'Open Workspace Settings').then((selected) => {
			switch (selected) {
				case 'Open User Settings':
					vscode.commands.executeCommand('workbench.action.openGlobalSettings');
					break;
				case 'Open Workspace Settings':
					vscode.commands.executeCommand('workbench.action.openWorkspaceSettings');
					break;
			}
		});
		return;
	}

	const paths = toolsGopath.split(path.delimiter);
	envForTools['GOPATH'] = paths[0];

	return envForTools;
}
