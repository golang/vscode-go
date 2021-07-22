import { Uri } from 'vscode';
import { CommandInvocation, ExtensionAPI } from './export';
import { getBinPathWithExplanation } from './util';

const api: ExtensionAPI = {
	settings: {
		getExecutionCommand(toolName: string, resource?: Uri): CommandInvocation | undefined {
			const { binPath } = getBinPathWithExplanation(toolName, true, resource);
			return { binPath };
		}
	}
};

export default api;
