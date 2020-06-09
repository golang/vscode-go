/*---------------------------------------------------------
 * Copyright 2020 The Go Authors. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------*/
import net = require('net');
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
	logger,
	Logger,
	LoggingDebugSession,
	TerminatedEvent
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';

import { envPath } from '../goPath';
import { DapClient } from './dapClient';

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
	/** Optional path to .env file. */
	envFile?: string | string[];
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

process.on('uncaughtException', (err: any) => {
	const errMessage = err && (err.stack || err.message);
	logger.error(`Unhandled error in debug adapter: ${errMessage}`);
	throw err;
});

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
//  | DAP Client | <====> | DebugSession | DapClient |  <====> | DAP Server |
//  +------------+        +--------------+-----------+         +------------+
export class GoDlvDapDebugSession extends LoggingDebugSession {
	private readonly DEFAULT_DELVE_HOST = '127.0.0.1';
	private readonly DEFAULT_DELVE_PORT = 42042;

	private logLevel: Logger.LogLevel = Logger.LogLevel.Error;

	private dlvClient: DelveClient;

	public constructor() {
		super();

		// Invoke logger.init here because we want logging to work in 'inline'
		// DA mode. It's typically called in the start() method of our parent
		// class, but this method isn't called in 'inline' mode.
		logger.init(e => this.sendEvent(e));

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);
	}

	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments, request?: DebugProtocol.Request): void {
		log('InitializeRequest');
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsSetVariable = true;

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

	protected launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments, request: DebugProtocol.Request) {
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

		log("launchRequest");

		if (!args.port) {
			args.port = this.DEFAULT_DELVE_PORT;
		}
		if (!args.host) {
			args.host = this.DEFAULT_DELVE_HOST;
		}

		// TODO: if this is a noDebug launch request, don't launch Delve;
		// instead, run the program directly.

		this.dlvClient = new DelveClient(args);

		this.dlvClient.on('stdout', (str) => {
			log("dlv stdout:", str);
		});

		this.dlvClient.on('stderr', (str) => {
			log("dlv stderr:", str);
		});

		this.dlvClient.on('connected', () => {
			this.dlvClient.send(request);
		});

		this.dlvClient.on('close', (rc) => {
			if (rc !== 0) {
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

		this.dlvClient.on('response', (response) => {
			this.sendResponse(response);
		});
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setFunctionBreakPointsRequest(response: DebugProtocol.SetFunctionBreakpointsResponse, args: DebugProtocol.SetFunctionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected gotoRequest(response: DebugProtocol.GotoResponse, args: DebugProtocol.GotoArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected terminateThreadsRequest(response: DebugProtocol.TerminateThreadsResponse, args: DebugProtocol.TerminateThreadsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setExpressionRequest(response: DebugProtocol.SetExpressionResponse, args: DebugProtocol.SetExpressionArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected stepInTargetsRequest(response: DebugProtocol.StepInTargetsResponse, args: DebugProtocol.StepInTargetsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected gotoTargetsRequest(response: DebugProtocol.GotoTargetsResponse, args: DebugProtocol.GotoTargetsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected loadedSourcesRequest(response: DebugProtocol.LoadedSourcesResponse, args: DebugProtocol.LoadedSourcesArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected dataBreakpointInfoRequest(response: DebugProtocol.DataBreakpointInfoResponse, args: DebugProtocol.DataBreakpointInfoArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setDataBreakpointsRequest(response: DebugProtocol.SetDataBreakpointsResponse, args: DebugProtocol.SetDataBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected readMemoryRequest(response: DebugProtocol.ReadMemoryResponse, args: DebugProtocol.ReadMemoryArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected disassembleRequest(response: DebugProtocol.DisassembleResponse, args: DebugProtocol.DisassembleArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected cancelRequest(response: DebugProtocol.CancelResponse, args: DebugProtocol.CancelArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}

	protected setInstructionBreakpointsRequest(response: DebugProtocol.SetInstructionBreakpointsResponse, args: DebugProtocol.SetInstructionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.dlvClient.send(request);
	}
}

// DelveClient provides a DAP client to talk to a DAP server in Delve.
//
// After creation, it emits the following events:
//
//    'connected':            delve is connected to delve
//    'request (request)':    delve sent request
//    'response (response)':  delve sent response
//    'event (event)':        delve sent event
//    'stdout' (str):         delve emitted str to stdout
//    'stderr' (str):         delve emitted str to stderr
//    'close' (rc):           delve exited with return code rc
class DelveClient extends DapClient {
	private debugProcess: ChildProcess;

	constructor(launchArgs: LaunchRequestArguments) {
		super();

		const launchArgsEnv = launchArgs.env || {};
		let env = Object.assign({}, process.env, launchArgsEnv);

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

		this.debugProcess = spawn(dlvPath, dlvArgs, {
			cwd: path.dirname(launchArgs.program),
			env
		});

		this.debugProcess.stderr.on('data', (chunk) => {
			const str = chunk.toString();
			this.emit('stderr', str);
		});

		this.debugProcess.stdout.on('data', (chunk) => {
			const str = chunk.toString();
			this.emit('stdout', str);
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

		// Give the Delve DAP server some time to start up before connecting.
		// TODO: if this turns out to be flaky, we could wait for Delve to emit
		// its first text to stdout before doing this.
		setTimeout(() => {
			let socket = net.createConnection(
				launchArgs.port,
				launchArgs.host,
				() => {
					this.connect(socket, socket);
					this.emit('connected');
				});

			socket.on('error', (err) => {
				throw err;
			});
		}, 100);
	}
}
