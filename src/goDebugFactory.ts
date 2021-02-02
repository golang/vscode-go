/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { ChildProcess } from 'child_process';
import getPort = require('get-port');
import { DebugConfiguration } from 'vscode';
import vscode = require('vscode');
import { spawnDapServerProcess as spawnDlvDapServerProcess } from './debugAdapter2/goDlvDebug';
import { logError, logInfo } from './goLogging';
import { killProcessTree } from './utils/processUtils';

export class GoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private dlvDapServer?: ChildProcess;

	public async createDebugAdapterDescriptor(
		session: vscode.DebugSession,
		executable: vscode.DebugAdapterExecutable | undefined
		): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		// The dlv-dap server currently receives certain flags and arguments on startup
		// and must be started in an appropriate folder for the program to be debugged.
		// In order to support this, we kill the current dlv-dap server, and start a
		// new one.
		await this.terminateDlvDapServerProcess();

		const {port, host} = await this.startDapServer(session.configuration);
		return new vscode.DebugAdapterServer(port, host);
	}

	public async dispose() {
		await this.terminateDlvDapServerProcess();
	}

	private async terminateDlvDapServerProcess() {
		if (this.dlvDapServer) {
			await killProcessTree(this.dlvDapServer);
			this.dlvDapServer = null;
		}
	}

	private async startDapServer(configuration: DebugConfiguration): Promise<{ port: number; host: string; }> {
		if (!configuration.host) {
			configuration.host = '127.0.0.1';
		}

		if (configuration.port) {
			// If a port has been specified, assume there is an already
			// running dap server to connect to.
			return {port: configuration.port, host: configuration.host};
		} else {
			configuration.port = await getPort();
		}

		this.dlvDapServer = spawnDlvDapServerProcess(configuration, logInfo, logError);
		// Wait to give dlv-dap a chance to start before returning.
		return await
			new Promise<{ port: number; host: string; }>((resolve) => setTimeout(() => {
				resolve({port: configuration.port, host: configuration.host});
			}, 500));
	}

}
