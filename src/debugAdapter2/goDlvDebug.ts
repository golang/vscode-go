/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/

// NOTE: This debug adapter is experimental, in-development code. If you
// actually need to debug Go code, please use the default adapter.

import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import net = require('net');
import * as os from 'os';
import * as path from 'path';

import {
	logger,
	Logger,
	LoggingDebugSession,
	OutputEvent,
	TerminatedEvent
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { envPath, expandFilePathInOutput, getBinPathWithPreferredGopathGoroot } from '../utils/pathUtils';
import { killProcessTree } from '../utils/processUtils';

import { DAPClient } from './dapClient';

interface LoadConfig {
	// FollowPointers requests pointers to be automatically dereferenced.
	followPointers: boolean;
	// MaxVariableRecurse is how far to recurse when evaluating nested types.
	maxVariableRecurse: number;
	// MaxStringLen is the maximum number of bytes read from a string
	maxStringLen: number;
	// MaxArrayValues is the maximum number of elements read from an array, a slice or a map.
	maxArrayValues: number;
	// MaxStructFields is the maximum number of fields read from a struct, -1 will read all fields.
	maxStructFields: number;
}

// This interface should always match the schema found in `package.json`.
interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	request: 'launch';
	[key: string]: any;
	program: string;
	stopOnEntry?: boolean;
	args?: string[];
	showLog?: boolean;
	logOutput?: string;
	cwd?: string;
	env?: { [key: string]: string };
	mode?: 'auto' | 'debug' | 'remote' | 'test' | 'exec';
	remotePath?: string;
	port?: number;
	host?: string;
	buildFlags?: string;
	init?: string;
	trace?: 'verbose' | 'log' | 'error';
	backend?: string;
	output?: string;
	/** Delve LoadConfig parameters */
	dlvLoadConfig?: LoadConfig;
	dlvToolPath: string;
	/** Delve Version */
	apiVersion: number;
	/** Delve maximum stack trace depth */
	stackTraceDepth: number;

	showGlobalVariables?: boolean;
	packagePathToGoModPathMap: { [key: string]: string };
}

interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	request: 'attach';
	processId?: number;
	stopOnEntry?: boolean;
	showLog?: boolean;
	logOutput?: string;
	cwd?: string;
	mode?: 'local' | 'remote';
	remotePath?: string;
	port?: number;
	host?: string;
	trace?: 'verbose' | 'log' | 'error';
	backend?: string;
	/** Delve LoadConfig parameters */
	dlvLoadConfig?: LoadConfig;
	dlvToolPath: string;
	/** Delve Version */
	apiVersion: number;
	/** Delve maximum stack trace depth */
	stackTraceDepth: number;

	showGlobalVariables?: boolean;
}

function logArgsToString(args: any[]): string {
	return args
		.map((arg) => {
			return typeof arg === 'string' ? arg : JSON.stringify(arg);
		})
		.join(' ');
}

function log(...args: any[]) {
	logger.warn(logArgsToString(args));
}

function logError(...args: any[]) {
	logger.error(logArgsToString(args));
}

// GoDlvDapDebugSession implements a DAP debug adapter to talk to the editor.
//
// This adapter serves as a DAP proxy between the editor and the DAP server
// inside Delve. It relies on functionality inherited from DebugSession to
// implement the server side interfacing the editor, and on DapClient to
// implement the client side interfacing Delve:
//
//      Editor                GoDlvDapDebugSession                 Delve
//  +------------+        +--------------+-----------+         +------------+
//  | DAP Client | <====> | DebugSession | DAPClient |  <====> | DAP Server |
//  +------------+        +--------------+-----------+         +------------+
export class GoDlvDapDebugSession extends LoggingDebugSession {
	private readonly DEFAULT_DELVE_HOST = '127.0.0.1';
	private readonly DEFAULT_DELVE_PORT = 42042;

	private logLevel: Logger.LogLevel = Logger.LogLevel.Error;

	private dlvClient: DelveClient = null;

	// Child process used to track debugee launched without debugging (noDebug
	// mode). Either debugProcess or dlvClient are null.
	private debugProcess: ChildProcess = null;

	public constructor() {
		super();

		// Invoke logger.init here because we want logging to work in 'inline'
		// DA mode. It's typically called in the start() method of our parent
		// class, but this method isn't called in 'inline' mode.
		logger.init((e) => this.sendEvent(e));

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	protected initializeRequest(
		response: DebugProtocol.InitializeResponse,
		args: DebugProtocol.InitializeRequestArguments,
		request?: DebugProtocol.Request
	): void {
		log('InitializeRequest');
		response.body.supportsConfigurationDoneRequest = true;

		// We respond to InitializeRequest here, because Delve hasn't been
		// launched yet. Delve will start responding to DAP requests after
		// LaunchRequest is received, which tell us how to start it.

		// TODO: we could send an InitializeRequest to Delve when
		// it launches, wait for its response and sanity check the capabilities
		// it reports. Once DAP support in Delve is complete, this can be part
		// of making sure that the "dlv" binary we find is sufficiently
		// up-to-date to talk DAP with us.
		this.sendResponse(response);
		log('InitializeResponse');
	}

	protected launchRequest(
		response: DebugProtocol.LaunchResponse,
		args: LaunchRequestArguments,
		request: DebugProtocol.Request
	): void {
		// Setup logger now that we have the 'trace' level passed in from
		// LaunchRequestArguments.
		this.logLevel =
			args.trace === 'verbose'
				? Logger.LogLevel.Verbose
				: args.trace === 'log'
					? Logger.LogLevel.Log
					: Logger.LogLevel.Error;
		const logPath =
			this.logLevel !== Logger.LogLevel.Error ? path.join(os.tmpdir(), 'vscode-godlvdapdebug.txt') : undefined;
		logger.setup(this.logLevel, logPath);
		log('launchRequest');

		// In noDebug mode with the 'debug' launch mode, we don't launch Delve
		// but run the debugee directly.
		// For other launch modes we currently still defer to Delve, for
		// compatibility with the old debugAdapter.
		// See https://github.com/golang/vscode-go/issues/336
		if (args.noDebug && args.mode === 'debug') {
			try {
				this.launchNoDebug(args);
			} catch (e) {
				logError(`launchNoDebug failed: "${e}"`);
				// TODO: define error constants
				// https://github.com/golang/vscode-go/issues/305
				this.sendErrorResponse(
					response,
					3000,
					`Failed to launch "${e}"`);
			}
			return;
		}

		if (!args.port) {
			args.port = this.DEFAULT_DELVE_PORT;
		}
		if (!args.host) {
			args.host = this.DEFAULT_DELVE_HOST;
		}

		this.dlvClient = new DelveClient(args);

		this.dlvClient.on('stdout', (str) => {
			log('dlv stdout:', str);
		});

		this.dlvClient.on('stderr', (str) => {
			log('dlv stderr:', str);
		});

		this.dlvClient.on('connected', () => {
			// Once the client is connected to Delve, forward it the launch
			// request to begin the actual debugging session.
			this.dlvClient.send(request);
		});

		this.dlvClient.on('close', (rc) => {
			if (rc !== 0) {
				// TODO: define error constants
				// https://github.com/golang/vscode-go/issues/305
				this.sendErrorResponse(
					response,
					3000,
					'Failed to continue: Check the debug console for details.');
			}
			log('Sending TerminatedEvent as delve is closed');
			this.sendEvent(new TerminatedEvent());
		});

		// Relay events and responses back to vscode. In the future we will
		// add middleware here to intercept specific kinds of responses/events
		// for special handling.
		this.dlvClient.on('event', (event) => {
			this.sendEvent(event);
		});

		this.dlvClient.on('response', (resp) => {
			this.sendResponse(resp);
		});
	}

	protected attachRequest(
		response: DebugProtocol.AttachResponse,
		args: AttachRequestArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected disconnectRequest(
		response: DebugProtocol.DisconnectResponse,
		args: DebugProtocol.DisconnectArguments,
		request?: DebugProtocol.Request
	): void {
		log('DisconnectRequest');
		// How we handle DisconnectRequest depends on whether Delve was launched
		// at all.
		// * In noDebug node, the Go program was spawned directly without
		//   debugging: this.debugProcess will be non-null, and this.dlvClient
		//   will be null.
		// * Otherwise, Delve was spawned: this.debugProcess will be null, and
		//   this.dlvClient will be non-null.
		if (this.debugProcess !== null) {
			log(`killing debugee (pid: ${this.debugProcess.pid})...`);

			// Kill the debugee and notify the client when the killing is
			// completed, to ensure a clean shutdown sequence.
			killProcessTree(this.debugProcess, log).then(() => {
				super.disconnectRequest(response, args);
				log('DisconnectResponse');
			});
		} else if (this.dlvClient !== null) {
			// Forward this DisconnectRequest to Delve.
			this.dlvClient.send(request);
		} else {
			logError(`both debug process and dlv client are null`);
			// TODO: define all error codes as constants
			// https://github.com/golang/vscode-go/issues/305
			this.sendErrorResponse(
				response,
				3000,
				'Failed to disconnect: Check the debug console for details.');
		}
	}

	protected terminateRequest(
		response: DebugProtocol.TerminateResponse,
		args: DebugProtocol.TerminateArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected restartRequest(
		response: DebugProtocol.RestartResponse,
		args: DebugProtocol.RestartArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setBreakPointsRequest(
		response: DebugProtocol.SetBreakpointsResponse,
		args: DebugProtocol.SetBreakpointsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setFunctionBreakPointsRequest(
		response: DebugProtocol.SetFunctionBreakpointsResponse,
		args: DebugProtocol.SetFunctionBreakpointsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setExceptionBreakPointsRequest(
		response: DebugProtocol.SetExceptionBreakpointsResponse,
		args: DebugProtocol.SetExceptionBreakpointsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected configurationDoneRequest(
		response: DebugProtocol.ConfigurationDoneResponse,
		args: DebugProtocol.ConfigurationDoneArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected continueRequest(
		response: DebugProtocol.ContinueResponse,
		args: DebugProtocol.ContinueArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected nextRequest(
		response: DebugProtocol.NextResponse,
		args: DebugProtocol.NextArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected stepInRequest(
		response: DebugProtocol.StepInResponse,
		args: DebugProtocol.StepInArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected stepOutRequest(
		response: DebugProtocol.StepOutResponse,
		args: DebugProtocol.StepOutArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected stepBackRequest(
		response: DebugProtocol.StepBackResponse,
		args: DebugProtocol.StepBackArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected reverseContinueRequest(
		response: DebugProtocol.ReverseContinueResponse,
		args: DebugProtocol.ReverseContinueArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected restartFrameRequest(
		response: DebugProtocol.RestartFrameResponse,
		args: DebugProtocol.RestartFrameArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected gotoRequest(
		response: DebugProtocol.GotoResponse,
		args: DebugProtocol.GotoArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected pauseRequest(
		response: DebugProtocol.PauseResponse,
		args: DebugProtocol.PauseArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected sourceRequest(
		response: DebugProtocol.SourceResponse,
		args: DebugProtocol.SourceArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected threadsRequest(
		response: DebugProtocol.ThreadsResponse,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected terminateThreadsRequest(
		response: DebugProtocol.TerminateThreadsResponse,
		args: DebugProtocol.TerminateThreadsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected stackTraceRequest(
		response: DebugProtocol.StackTraceResponse,
		args: DebugProtocol.StackTraceArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected scopesRequest(
		response: DebugProtocol.ScopesResponse,
		args: DebugProtocol.ScopesArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected variablesRequest(
		response: DebugProtocol.VariablesResponse,
		args: DebugProtocol.VariablesArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setVariableRequest(
		response: DebugProtocol.SetVariableResponse,
		args: DebugProtocol.SetVariableArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setExpressionRequest(
		response: DebugProtocol.SetExpressionResponse,
		args: DebugProtocol.SetExpressionArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected evaluateRequest(
		response: DebugProtocol.EvaluateResponse,
		args: DebugProtocol.EvaluateArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected stepInTargetsRequest(
		response: DebugProtocol.StepInTargetsResponse,
		args: DebugProtocol.StepInTargetsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected gotoTargetsRequest(
		response: DebugProtocol.GotoTargetsResponse,
		args: DebugProtocol.GotoTargetsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected completionsRequest(
		response: DebugProtocol.CompletionsResponse,
		args: DebugProtocol.CompletionsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected exceptionInfoRequest(
		response: DebugProtocol.ExceptionInfoResponse,
		args: DebugProtocol.ExceptionInfoArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected loadedSourcesRequest(
		response: DebugProtocol.LoadedSourcesResponse,
		args: DebugProtocol.LoadedSourcesArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected dataBreakpointInfoRequest(
		response: DebugProtocol.DataBreakpointInfoResponse,
		args: DebugProtocol.DataBreakpointInfoArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setDataBreakpointsRequest(
		response: DebugProtocol.SetDataBreakpointsResponse,
		args: DebugProtocol.SetDataBreakpointsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected readMemoryRequest(
		response: DebugProtocol.ReadMemoryResponse,
		args: DebugProtocol.ReadMemoryArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected disassembleRequest(
		response: DebugProtocol.DisassembleResponse,
		args: DebugProtocol.DisassembleArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected cancelRequest(
		response: DebugProtocol.CancelResponse,
		args: DebugProtocol.CancelArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected breakpointLocationsRequest(
		response: DebugProtocol.BreakpointLocationsResponse,
		args: DebugProtocol.BreakpointLocationsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	protected setInstructionBreakpointsRequest(
		response: DebugProtocol.SetInstructionBreakpointsResponse,
		args: DebugProtocol.SetInstructionBreakpointsArguments,
		request?: DebugProtocol.Request
	): void {
		this.dlvClient.send(request);
	}

	// Launch the debugee process without starting a debugger.
	// This implements the `Run > Run Without Debugger` functionality in vscode.
	// Note: this method currently assumes launchArgs.mode === 'debug'.
	private launchNoDebug(launchArgs: LaunchRequestArguments): void {
		if (launchArgs.mode !== 'debug') {
			throw new Error('launchNoDebug requires "debug" mode');
		}
		const {program, dirname, programIsDirectory} = parseProgramArgSync(launchArgs);
		const goRunArgs = ['run'];
		if (launchArgs.buildFlags) {
			goRunArgs.push(launchArgs.buildFlags);
		}

		if (programIsDirectory) {
			goRunArgs.push('.');
		} else {
			goRunArgs.push(program);
		}

		if (launchArgs.args) {
			goRunArgs.push(...launchArgs.args);
		}

		// launchArgs.env includes all the environment variables
		// including vscode-go's toolsExecutionEnvironment (PATH, GOPATH, ...),
		// and those read from .env files.
		const launchArgsEnv = launchArgs.env || {};
		const programEnv = Object.assign({}, process.env, launchArgsEnv);

		log(`Current working directory: ${dirname}`);
		const goExe = getBinPathWithPreferredGopathGoroot('go', []);
		log(`Running: ${goExe} ${goRunArgs.join(' ')}`);

		this.debugProcess = spawn(goExe, goRunArgs, {
			cwd: dirname,
			env: programEnv
		});
		this.debugProcess.stderr.on('data', (str) => {
			this.sendEvent(new OutputEvent(str.toString(), 'stderr'));
		});
		this.debugProcess.stdout.on('data', (str) => {
			this.sendEvent(new OutputEvent(str.toString(), 'stdout'));
		});
		this.debugProcess.on('close', (rc) => {
			this.sendEvent(new TerminatedEvent());
		});
	}
}

// DelveClient provides a DAP client to talk to a DAP server in Delve.
//
// After creation, it emits the following events:
//
//    'connected':            client is connected to delve
//    'request (request)':    delve sent request
//    'response (response)':  delve sent response
//    'event (event)':        delve sent event
//    'stdout' (str):         delve emitted str to stdout
//    'stderr' (str):         delve emitted str to stderr
//    'close' (rc):           delve exited with return code rc
class DelveClient extends DAPClient {
	private debugProcess: ChildProcess;
	private serverStarted: boolean = false;

	constructor(launchArgs: LaunchRequestArguments) {
		super();

		const launchArgsEnv = launchArgs.env || {};
		const env = Object.assign({}, process.env, launchArgsEnv);

		// Let users override direct path to delve by setting it in the env
		// map in launch.json; if unspecified, fall back to dlvToolPath.
		let dlvPath = launchArgsEnv['dlvPath'];
		if (!dlvPath) {
			dlvPath = launchArgs.dlvToolPath;
		}

		if (!fs.existsSync(dlvPath)) {
			log(
				`Couldn't find dlv at the Go tools path, ${process.env['GOPATH']}${
				env['GOPATH'] ? ', ' + env['GOPATH'] : ''
				} or ${envPath}`
			);
			throw new Error(
				`Cannot find Delve debugger. Install from https://github.com/go-delve/delve/ & ensure it is in your Go tools path, "GOPATH/bin" or "PATH".`
			);
		}

		const dlvArgs = new Array<string>();
		dlvArgs.push('dap');
		dlvArgs.push(`--listen=${launchArgs.host}:${launchArgs.port}`);
		if (launchArgs.showLog) {
			dlvArgs.push('--log=' + launchArgs.showLog.toString());
		}
		if (launchArgs.logOutput) {
			dlvArgs.push('--log-output=' + launchArgs.logOutput);
		}

		log(`Running: ${dlvPath} ${dlvArgs.join(' ')}`);

		const dir = parseProgramArgSync(launchArgs).dirname;
		this.debugProcess = spawn(dlvPath, dlvArgs, {
			cwd: dir,
			env
		});

		this.debugProcess.stderr.on('data', (chunk) => {
			let str = chunk.toString();
			str = expandFilePathInOutput(str, dir);
			this.emit('stderr', str);
		});

		this.debugProcess.stdout.on('data', (chunk) => {
			const str = chunk.toString();
			this.emit('stdout', str);

			if (!this.serverStarted) {
				this.serverStarted = true;
				this.connectSocketToServer(launchArgs.port, launchArgs.host);
			}
		});

		this.debugProcess.on('close', (rc) => {
			if (rc) {
				logError(`Process exiting with code: ${rc} signal: ${this.debugProcess.killed}`);
			} else {
				log(`Process exiting normally ${this.debugProcess.killed}`);
			}
			this.emit('close', rc);
		});

		this.debugProcess.on('error', (err) => {
			throw err;
		});
	}

	// Connect this client to the server. The server is expected to be listening
	// on host:port.
	private connectSocketToServer(port: number, host: string) {
		// Add a slight delay to ensure that Delve started up the server.
		setTimeout(() => {
			const socket = net.createConnection(
				port,
				host,
				() => {
					this.connect(socket, socket);
					this.emit('connected');
				});

			socket.on('error', (err) => {
				throw err;
			});
		}, 200);
	}
}

// Helper function to parse a program from LaunchRequestArguments. Returns:
// {
//    program: the program arg,
//    dirname: the directory containing the program (or 'program' itself if
//             it's already a directory),
//    programIsDirectory: is the program a directory?
// }
//
// The program argument is taken as-is from launchArgs. If the program path
// is relative, dirname will also be relative. If the program path is absolute,
// dirname will also be absolute.
//
// Throws an exception in case args.program is not a valid file or directory.
// This function can block because it calls a blocking fs function.
function parseProgramArgSync(launchArgs: LaunchRequestArguments
): { program: string, dirname: string, programIsDirectory: boolean } {
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
	if (!programIsDirectory && path.extname(program) !== '.go') {
		throw new Error('The program attribute must be a directory or .go file in debug mode');
	}
	const dirname = programIsDirectory ? program : path.dirname(program);
	return {program, dirname, programIsDirectory};
}
