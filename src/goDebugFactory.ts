/* eslint-disable @typescript-eslint/no-explicit-any */
/*---------------------------------------------------------
 * Copyright 2021 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

import { ChildProcess, ChildProcessWithoutNullStreams, spawn } from 'child_process';
import stream = require('stream');
import vscode = require('vscode');
import { OutputEvent, TerminatedEvent } from 'vscode-debugadapter';
import getPort = require('get-port');
import path = require('path');
import * as fs from 'fs';
import * as net from 'net';
import { getTool } from './goTools';
import { Logger, TimestampedLogger } from './goLogging';
import { DebugProtocol } from 'vscode-debugprotocol';
import { getWorkspaceFolderPath } from './util';
import { toolExecutionEnvironment } from './goEnv';

export class GoDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(private outputChannel?: vscode.OutputChannel) {}

	public createDebugAdapterDescriptor(
		session: vscode.DebugSession,
		executable: vscode.DebugAdapterExecutable | undefined
	): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		if (session.configuration.debugAdapter === 'dlv-dap') {
			return this.createDebugAdapterDescriptorDlvDap(session.configuration);
		}
		return executable;
	}

	public async dispose() {
		console.log('GoDebugAdapterDescriptorFactory.dispose');
	}

	private async createDebugAdapterDescriptorDlvDap(
		configuration: vscode.DebugConfiguration
	): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		const logger = new TimestampedLogger(configuration.trace, this.outputChannel);
		logger.debug(`Config: ${JSON.stringify(configuration)}`);
		const d = new DelveDAPOutputAdapter(configuration, logger);
		return new vscode.DebugAdapterInlineImplementation(d);
	}
}

export class GoDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
	constructor(private outputChannel: vscode.OutputChannel) {}

	createDebugAdapterTracker(session: vscode.DebugSession) {
		const level = session.configuration?.trace;
		if (!level || level === 'off') {
			return null;
		}
		const logger = new TimestampedLogger(session.configuration?.trace || 'off', this.outputChannel);
		return {
			onWillStartSession: () =>
				logger.debug(`session ${session.id} will start with ${JSON.stringify(session.configuration)}\n`),
			onWillReceiveMessage: (message: any) => logger.trace(`client -> ${JSON.stringify(message)}\n`),
			onDidSendMessage: (message: any) => logger.trace(`client  <- ${JSON.stringify(message)}\n`),
			onError: (error: Error) => logger.error(`error: ${error}\n`),
			onWillStopSession: () => logger.debug(`session ${session.id} will stop\n`),
			onExit: (code: number | undefined, signal: string | undefined) =>
				logger.info(`debug adapter exited: (code: ${code}, signal: ${signal})\n`)
		};
	}

	dispose() {}
}

const TWO_CRLF = '\r\n\r\n';

// Proxies DebugProtocolMessage exchanges between VSCode and a remote
// process or server connected through a duplex stream, after its
// start method is called.
export class ProxyDebugAdapter implements vscode.DebugAdapter {
	private messageEmitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
	// connection from/to server (= dlv dap)
	private readable?: stream.Readable;
	private writable?: stream.Writable;
	protected logger?: Logger;
	private terminated = false;

	constructor(logger: Logger) {
		this.logger = logger;
		this.onDidSendMessage = this.messageEmitter.event;
	}

	// Implement vscode.DebugAdapter (VSCodeDebugAdapter) interface.
	// Client will call handleMessage to send messages, and
	// listen on onDidSendMessage to receive messages.
	onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage>;
	async handleMessage(message: vscode.DebugProtocolMessage): Promise<void> {
		await this.sendMessageToServer(message);
	}

	// Methods for proxying.
	protected sendMessageToClient(msg: vscode.DebugProtocolMessage) {
		this.messageEmitter.fire(msg);
	}
	protected sendMessageToServer(message: vscode.DebugProtocolMessage): void {
		const json = JSON.stringify(message) ?? '';
		if (this.writable) {
			this.writable.write(
				`Content-Length: ${Buffer.byteLength(json, 'utf8')}${TWO_CRLF}${json}`,
				'utf8',
				(err) => {
					if (err) {
						this.logger?.error(`error sending message: ${err}`);
						this.sendMessageToClient(new TerminatedEvent());
					}
				}
			);
		} else {
			this.logger?.error(`stream is closed; dropping ${json}`);
		}
	}

	public async start(readable: stream.Readable, writable: stream.Writable) {
		if (this.readable || this.writable) {
			throw new Error('start was called more than once');
		}
		this.readable = readable;
		this.writable = writable;
		this.readable.on('data', (data: Buffer) => {
			this.handleDataFromServer(data);
		});
		this.readable.once('close', () => {
			this.readable = undefined;
		});
		this.readable.on('error', (err) => {
			if (this.terminated) {
				return;
			}
			this.terminated = true;

			if (err) {
				this.logger?.error(`connection error: ${err}`);
				this.sendMessageToClient(new OutputEvent(`connection error: ${err}\n`, 'console'));
			}
			this.sendMessageToClient(new TerminatedEvent());
		});
	}

	async dispose() {
		this.writable?.end(); // no more write.
	}

	private rawData = Buffer.alloc(0);
	private contentLength = -1;
	// Implements parsing of the DAP protocol. We cannot use ProtocolClient
	// from the vscode-debugadapter package, because it's not exported and
	// is not meant for external usage.
	// See https://github.com/microsoft/vscode-debugadapter-node/issues/232
	private handleDataFromServer(data: Buffer): void {
		this.rawData = Buffer.concat([this.rawData, data]);

		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (this.contentLength >= 0) {
				if (this.rawData.length >= this.contentLength) {
					const message = this.rawData.toString('utf8', 0, this.contentLength);
					this.rawData = this.rawData.slice(this.contentLength);
					this.contentLength = -1;
					if (message.length > 0) {
						const rawMessage = JSON.parse(message);
						this.sendMessageToClient(rawMessage);
					}
					continue; // there may be more complete messages to process
				}
			} else {
				const idx = this.rawData.indexOf(TWO_CRLF);
				if (idx !== -1) {
					const header = this.rawData.toString('utf8', 0, idx);
					const lines = header.split('\r\n');
					for (const line of lines) {
						const pair = line.split(/: +/);
						if (pair[0] === 'Content-Length') {
							this.contentLength = +pair[1];
						}
					}
					this.rawData = this.rawData.slice(idx + TWO_CRLF.length);
					continue;
				}
			}
			break;
		}
	}
}

// DelveDAPOutputAdapter is a ProxyDebugAdapter that proxies between
// VSCode and a dlv dap process spawned and managed by this adapter.
// It turns the process's stdout/stderrr into OutputEvent.
export class DelveDAPOutputAdapter extends ProxyDebugAdapter {
	constructor(private configuration: vscode.DebugConfiguration, logger?: Logger) {
		super(logger);
		this.connected = this.startAndConnectToServer();
	}

	private connected: Promise<{ connected: boolean; reason?: any }>;
	private dlvDapServer: ChildProcess;
	private port: number;
	private socket: net.Socket;
	private terminatedOnError = false;

	protected async sendMessageToServer(message: vscode.DebugProtocolMessage): Promise<void> {
		const { connected, reason } = await this.connected;
		if (connected) {
			super.sendMessageToServer(message);
			return;
		}
		const errMsg = `Couldn't start dlv dap:\n${reason}`;
		if (this.terminatedOnError) {
			this.terminatedOnError = true;
			this.outputEvent('stderr', errMsg);
			this.sendMessageToClient(new TerminatedEvent());
		}
		if ((message as any).type === 'request') {
			const req = message as DebugProtocol.Request;
			this.sendMessageToClient({
				seq: 0,
				type: 'response',
				request_seq: req.seq,
				success: false,
				command: req.command,
				message: errMsg
			});
		}
	}

	async dispose(timeoutMS?: number) {
		// NOTE: OutputEvents from here may not show up in DEBUG CONSOLE
		// because the debug session is terminating.
		await super.dispose();
		if (!this.dlvDapServer) {
			return;
		}
		if (this.connected === undefined) {
			return;
		}
		this.connected = undefined;

		if (timeoutMS === undefined || timeoutMS < 0) {
			timeoutMS = 1_000;
		}
		const dlvDapServer = this.dlvDapServer;
		this.dlvDapServer = undefined;
		if (!dlvDapServer) {
			return;
		}
		if (dlvDapServer.exitCode !== null) {
			this.logger?.info(
				`dlv dap process(${dlvDapServer.pid}) already exited (exit code: ${dlvDapServer.exitCode})`
			);
			return;
		}
		await new Promise<void>((resolve) => {
			const exitTimeoutToken = setTimeout(() => {
				this.logger?.error(`dlv dap process (${dlvDapServer.pid}) isn't responding. Killing...`);
				dlvDapServer.kill('SIGINT'); // Don't use treekill but let dlv handle cleaning up the child processes.
			}, timeoutMS);
			dlvDapServer.on('exit', (code, signal) => {
				clearTimeout(exitTimeoutToken);
				if (code || signal) {
					this.logger?.error(
						`dlv dap process(${dlvDapServer.pid}) exited (exit code: ${code} signal: ${signal})`
					);
				}
				resolve();
			});
		});
	}

	private async startAndConnectToServer() {
		try {
			const { port, host, dlvDapServer } = await startDapServer(
				this.configuration,
				(msg) => this.outputEvent('stdout', msg),
				(msg) => this.outputEvent('stderr', msg),
				(msg) => {
					this.outputEvent('console', msg);
					// Some log messages generated after vscode stops the debug session
					// may not appear in the DEBUG CONSOLE. For easier debugging, log
					// the messages through the logger that prints to Go Debug output
					// channel.
					this.logger?.info(msg);
				}
			);
			const socket = await new Promise<net.Socket>((resolve, reject) => {
				// eslint-disable-next-line prefer-const
				let timer: NodeJS.Timeout;
				const s = net.createConnection(port, host, () => {
					clearTimeout(timer);
					resolve(s);
				});
				timer = setTimeout(() => {
					reject('connection timeout');
					s?.destroy();
				}, 1000);
			});

			this.dlvDapServer = dlvDapServer;
			this.port = port;
			this.socket = socket;
			this.start(this.socket, this.socket);
		} catch (err) {
			return { connected: false, reason: err };
		}
		this.logger?.debug(`Running dlv dap server: port=${this.port} pid=${this.dlvDapServer.pid}\n`);
		return { connected: true };
	}

	private outputEvent(dest: string, output: string, data?: any) {
		this.sendMessageToClient(new OutputEvent(output, dest, data));
	}
}

async function startDapServer(
	configuration: vscode.DebugConfiguration,
	log: (msg: string) => void,
	logErr: (msg: string) => void,
	logConsole: (msg: string) => void
): Promise<{ port: number; host: string; dlvDapServer?: ChildProcessWithoutNullStreams }> {
	const host = configuration.host || '127.0.0.1';

	if (configuration.port) {
		// If a port has been specified, assume there is an already
		// running dap server to connect to.
		return { port: configuration.port, host };
	}
	const port = await getPort();
	const dlvDapServer = await spawnDlvDapServerProcess(configuration, host, port, log, logErr, logConsole);
	return { dlvDapServer, port, host };
}

function spawnDlvDapServerProcess(
	launchAttachArgs: vscode.DebugConfiguration,
	host: string,
	port: number,
	log: (msg: string) => void,
	logErr: (msg: string) => void,
	logConsole: (msg: string) => void
): Promise<ChildProcess> {
	const launchArgsEnv = launchAttachArgs.env || {};
	const goToolsEnvVars = toolExecutionEnvironment();
	// launchArgsEnv is user-requested env vars (envFiles + env).
	const env = Object.assign(goToolsEnvVars, launchArgsEnv);

	const dlvPath = launchAttachArgs.dlvToolPath ?? getTool('dlv-dap');

	if (!fs.existsSync(dlvPath)) {
		const envPath = process.env['PATH'] || (process.platform === 'win32' ? process.env['Path'] : null);
		logErr(
			`Couldn't find dlv-dap at the Go tools path, ${process.env['GOPATH']}${
				env['GOPATH'] ? ', ' + env['GOPATH'] : ''
			} or ${envPath}\n` +
				'Follow the setup instruction in https://github.com/golang/vscode-go/blob/master/docs/debugging.md#getting-started.\n'
		);
		throw new Error('Cannot find Delve debugger (dlv dap)');
	}
	let dir = getWorkspaceFolderPath();
	if (launchAttachArgs.request === 'launch' && launchAttachArgs['__buildDir']) {
		// __buildDir is the directory determined during resolving debug config
		dir = launchAttachArgs['__buildDir'];
	}

	const dlvArgs = new Array<string>();
	dlvArgs.push('dap');
	// When duplicate flags are specified,
	// dlv doesn't mind but accepts the last flag value.
	// Add user-specified dlv flags first except
	//  --check-go-version that we want to disable by default but allow users to override.
	dlvArgs.push('--check-go-version=false');
	if (launchAttachArgs.dlvFlags && launchAttachArgs.dlvFlags.length > 0) {
		dlvArgs.push(...launchAttachArgs.dlvFlags);
	}
	dlvArgs.push(`--listen=${host}:${port}`);
	if (launchAttachArgs.showLog) {
		dlvArgs.push('--log=' + launchAttachArgs.showLog.toString());
		// Only add the log output flag if we have already added the log flag.
		// Otherwise, delve complains.
		if (launchAttachArgs.logOutput) {
			dlvArgs.push('--log-output=' + launchAttachArgs.logOutput);
		}
	}

	const onWindows = process.platform === 'win32';

	if (!onWindows) {
		dlvArgs.push('--log-dest=3');
	}

	const logDest = launchAttachArgs.logDest;
	if (typeof logDest === 'number') {
		logErr(`Using a file descriptor for 'logDest' (${logDest}) is not allowed.\n`);
		throw new Error('Using a file descriptor for `logDest` is not allowed.');
	}
	if (logDest && !path.isAbsolute(logDest)) {
		logErr(
			`Using a relative path for 'logDest' (${logDest}) is not allowed.\nSee https://code.visualstudio.com/docs/editor/variables-reference if you want workspace-relative path.\n`
		);
		throw new Error('Using a relative path for `logDest` is not allowed');
	}
	if (logDest && onWindows) {
		logErr(
			'Using `logDest` or `--log-dest` is not supported on windows yet. See https://github.com/golang/vscode-go/issues/1472.'
		);
		throw new Error('Using `logDest` on windows is not allowed');
	}

	const logDestStream = logDest ? fs.createWriteStream(logDest) : undefined;

	logConsole(`Starting: ${dlvPath} ${dlvArgs.join(' ')} from ${dir}\n`);

	// TODO(hyangah): In module-module workspace mode, the program should be build in the super module directory
	// where go.work (gopls.mod) file is present. Where dlv runs determines the build directory currently. Two options:
	//  1) launch dlv in the super-module module directory and adjust launchArgs.cwd (--wd).
	//  2) introduce a new buildDir launch attribute.
	return new Promise<ChildProcess>((resolve, reject) => {
		const p = spawn(dlvPath, dlvArgs, {
			cwd: dir,
			env,
			stdio: onWindows ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe', 'pipe'] // --log-dest=3 if !onWindows.
		});
		let started = false;
		const timeoutToken: NodeJS.Timer = setTimeout(() => {
			logConsole(`Delve DAP server (PID: ${p.pid}) is not responding`);
			reject(new Error('timed out while waiting for DAP server to start'));
		}, 30_000);

		const stopWaitingForServerToStart = () => {
			clearTimeout(timeoutToken);
			started = true;
			resolve(p);
		};

		p.stdout.on('data', (chunk) => {
			const msg = chunk.toString();
			if (!started && msg.startsWith('DAP server listening at:')) {
				stopWaitingForServerToStart();
			}
			log(msg);
		});
		p.stderr.on('data', (chunk) => {
			logErr(chunk.toString());
		});
		p.stdio[3]?.on('data', (chunk) => {
			const msg = chunk.toString();
			if (!started && msg.startsWith('DAP server listening at:')) {
				stopWaitingForServerToStart();
			}
			if (logDestStream) {
				// always false on windows.
				// write to the specified file.
				logDestStream?.write(chunk, (err) => {
					if (err) {
						logConsole(`Error writing to ${logDest}: ${err}, log may be incomplete.`);
					}
				});
			} else {
				logConsole(msg);
			}
		});
		p.stdio[3]?.on('close', () => {
			// always false on windows.
			logDestStream?.end();
		});

		p.on('close', (code, signal) => {
			// TODO: should we watch 'exit' instead?

			// NOTE: log messages here may not appear in DEBUG CONSOLE if the termination of
			// the process was triggered by debug adapter's dispose when dlv dap doesn't
			// respond to disconnect on time. In that case, it's possible that the session
			// is in the middle of teardown and DEBUG CONSOLE isn't accessible. Check
			// Go Debug output channel.
			if (typeof code === 'number') {
				// The process exited on its own.
				logConsole(`dlv dap (${p.pid}) exited with code: ${code}\n`);
			} else if (code === null && signal) {
				logConsole(`dlv dap (${p.pid}) was killed by signal: ${signal}\n`);
			} else {
				logConsole(`dlv dap (${p.pid}) terminated with code: ${code} signal: ${signal}\n`);
			}
		});
		p.on('error', (err) => {
			if (err) {
				logConsole(`Error: ${err}\n`);
			}
		});
	});
}

export function parseProgramArgSync(
	launchAttachArgs: vscode.DebugConfiguration
): { program: string; dirname: string; programIsDirectory: boolean } {
	// attach request:
	//   irrelevant
	if (launchAttachArgs.request !== 'launch') return;

	const mode = launchAttachArgs.mode || 'debug';
	const program = launchAttachArgs.program;

	if (!program) {
		throw new Error('The program attribute is missing in the debug configuration in launch.json');
	}

	// debug, test, auto mode in launch request:
	//   program ends with .go file -> file, otherwise -> programIsDirectory.
	// exec mode
	//   program should be executable.
	// other modes:
	//   not relevant
	if (['debug', 'test', 'auto'].includes(mode)) {
		// `auto` shouldn't happen other than in testing.
		const ext = path.extname(program);
		if (ext === '') {
			// the last path element doesn't have . or the first char is .
			// Treat this like a directory.
			return { program, dirname: program, programIsDirectory: true };
		}
		if (ext === '.go') {
			return { program, dirname: path.dirname(program), programIsDirectory: false };
		} else {
			throw new Error('The program attribute must be a directory or .go file in debug and test mode');
		}
	}
	// Otherwise, let delve handle.
	return { program, dirname: '', programIsDirectory: false };
}
