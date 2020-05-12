/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import path = require('path');
import vscode = require('vscode');
<<<<<<< HEAD
import { getCurrentGoPath, getGoConfig, getToolsGopath, resolvePath } from './util';

export function toolInstallationEnvironment(): NodeJS.Dict<string> {
	const env = newEnvironment();
=======
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
>>>>>>> 62c233ab1ae82dd96f06a984a6ab4e6c0b76282c

	// If the go.toolsGopath is set, use its value as the GOPATH for `go` processes.
	// Else use the Current Gopath
	let toolsGopath = getToolsGopath();
	if (toolsGopath) {
		// User has explicitly chosen to use toolsGopath, so ignore GOBIN.
<<<<<<< HEAD
		env['GOBIN'] = '';
=======
		envForTools['GOBIN'] = '';
>>>>>>> 62c233ab1ae82dd96f06a984a6ab4e6c0b76282c
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
<<<<<<< HEAD
	env['GOPATH'] = paths[0];

	return env;
}

export function toolExecutionEnvironment(): NodeJS.Dict<string> {
	const env = newEnvironment();
	const gopath = getCurrentGoPath();
	if (gopath) {
		env['GOPATH'] = gopath;
	}
	const toolsEnvVars = getGoConfig()['toolsEnvVars'];
	if (toolsEnvVars && typeof toolsEnvVars === 'object') {
		Object.keys(toolsEnvVars).forEach(
			(key) =>
				(env[key] =
					typeof toolsEnvVars[key] === 'string' ? resolvePath(toolsEnvVars[key]) : toolsEnvVars[key])
		);
	}
	return env;
}

function newEnvironment(): NodeJS.Dict<string> {
	const env = Object.assign({}, process.env);

	// The http.proxy setting takes precedence over environment variables.
	const httpProxy = vscode.workspace.getConfiguration('http', null).get('proxy');
	if (httpProxy && typeof httpProxy === 'string') {
		env['http_proxy'] = httpProxy;
		env['HTTP_PROXY'] = httpProxy;
		env['https_proxy'] = httpProxy;
		env['HTTPS_PROXY'] = httpProxy;
	}
	return env;
=======
	envForTools['GOPATH'] = paths[0];

	return envForTools;
>>>>>>> 62c233ab1ae82dd96f06a984a6ab4e6c0b76282c
}
