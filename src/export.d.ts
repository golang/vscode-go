import { Uri } from 'vscode';
export { ToolAtVersion } from './goTools';

export interface CommandInvocation {
	binPath: string;
	args?: string[];
	env?: Object;
	cwd?: string;
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
