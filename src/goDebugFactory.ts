/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import { DebugConfiguration } from 'vscode';
import { getGoConfig } from './config';
import { logError, logInfo } from './goLogging';
import { envPath } from './utils/pathUtils';
import { killProcessTree } from './utils/processUtils';
import getPort = require('get-port');
import path = require('path');
import vscode = require('vscode');

export class GoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	private dlvDapServer?: ChildProcess;

	public async createDebugAdapterDescriptor(
		session: vscode.DebugSession,
		executable: vscode.DebugAdapterExecutable | undefined
	): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		const config = getGoConfig();
		if (config['useDlvDap']) {
			return this.createDebugAdapterDescriptorDlvDap(session.configuration);
		}
		// Terminate any running dlv dap server process.
		await this.terminateDlvDapServerProcess();
		return executable;
	}

	public async dispose() {
		await this.terminateDlvDapServerProcess();
	}

	private async createDebugAdapterDescriptorDlvDap(
		configuration: vscode.DebugConfiguration
	): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		// The dlv-dap server currently receives certain flags and arguments on startup
		// and must be started in an appropriate folder for the program to be debugged.
		// In order to support this, we kill the current dlv-dap server, and start a
		// new one.
		await this.terminateDlvDapServerProcess();

		const { port, host, dlvDapServer } = await startDapServer(configuration);
		this.dlvDapServer = dlvDapServer;
		return new vscode.DebugAdapterServer(port, host);
	}

	private async terminateDlvDapServerProcess() {
		if (this.dlvDapServer) {
			await killProcessTree(this.dlvDapServer);
			this.dlvDapServer = null;
		}
	}
}

export async function startDapServer(
	configuration: DebugConfiguration
): Promise<{ port: number; host: string; dlvDapServer?: ChildProcessWithoutNullStreams }> {
	if (!configuration.host) {
		configuration.host = '127.0.0.1';
	}

	if (configuration.port) {
		// If a port has been specified, assume there is an already
		// running dap server to connect to.
		return { port: configuration.port, host: configuration.host };
	} else {
		configuration.port = await getPort();
	}
	const dlvDapServer = spawnDlvDapServerProcess(configuration, logInfo, logError);
	// Wait to give dlv-dap a chance to start before returning.
	return await new Promise<{ port: number; host: string; dlvDapServer: ChildProcessWithoutNullStreams }>((resolve) =>
		setTimeout(() => resolve({ port: configuration.port, host: configuration.host, dlvDapServer }), 500)
	);
}

function spawnDlvDapServerProcess(
	launchArgs: DebugConfiguration,
	logFn: (...args: any[]) => void,
	logErrFn: (...args: any[]) => void
) {
	const launchArgsEnv = launchArgs.env || {};
	const env = Object.assign({}, process.env, launchArgsEnv);

	// Let users override direct path to delve by setting it in the env
	// map in launch.json; if unspecified, fall back to dlvToolPath.
	let dlvPath = launchArgsEnv['dlvPath'];
	if (!dlvPath) {
		dlvPath = launchArgs.dlvToolPath;
	}

	if (!fs.existsSync(dlvPath)) {
		logErrFn(
			`Couldn't find dlv at the Go tools path, ${process.env['GOPATH']}${
				env['GOPATH'] ? ', ' + env['GOPATH'] : ''
			} or ${envPath}`
		);
		throw new Error(
			'Cannot find Delve debugger. Install from https://github.com/go-delve/delve/ & ensure it is in your Go tools path, "GOPATH/bin" or "PATH".'
		);
	}

	const dlvArgs = new Array<string>();
	dlvArgs.push('dap');
	// add user-specified dlv flags first. When duplicate flags are specified,
	// dlv doesn't mind but accepts the last flag value.
	if (launchArgs.dlvFlags && launchArgs.dlvFlags.length > 0) {
		dlvArgs.push(...launchArgs.dlvFlags);
	}
	dlvArgs.push(`--listen=${launchArgs.host}:${launchArgs.port}`);
	if (launchArgs.showLog) {
		dlvArgs.push('--log=' + launchArgs.showLog.toString());
	}
	if (launchArgs.logOutput) {
		dlvArgs.push('--log-output=' + launchArgs.logOutput);
	}
	logFn(`Running: ${dlvPath} ${dlvArgs.join(' ')}`);

	const dir = parseProgramArgSync(launchArgs).dirname;
	return spawn(dlvPath, dlvArgs, {
		cwd: dir,
		env
	});
}

function parseProgramArgSync(
	launchArgs: DebugConfiguration
): { program: string; dirname: string; programIsDirectory: boolean } {
	const program = launchArgs.program;
	if (!program) {
		throw new Error('The program attribute is missing in the debug configuration in launch.json');
	}
	let programIsDirectory = false;
	try {
		programIsDirectory = fs.lstatSync(program).isDirectory();
	} catch (e) {
		throw new Error('The program attribute must point to valid directory, .go file or executable.');
	}
	if (!programIsDirectory && (path.extname(program) !== '.go' || launchArgs.mode === 'exec')) {
		throw new Error('The program attribute must be a directory or .go file in debug and test mode');
	}
	const dirname = programIsDirectory ? program : path.dirname(program);
	return { program, dirname, programIsDirectory };
}
