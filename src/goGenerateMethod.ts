import vscode = require('vscode');
import { CommandFactory } from './commands';

const CommandTitle = 'Generate method';
const Command = 'go.generate.method';

export const goGenerateMethod: CommandFactory = () => (
	uncommontypeName: string,
	needPtrReceiver: boolean,
	endPos: vscode.Position
) => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage('No active editor found.');
		return;
	}
	const receiverName = getReceiverName(uncommontypeName);
	let methodTpl = `\n\nfunc ($\{1:${receiverName}} *${uncommontypeName}) $\{2:methodName}($3) $4 {\n\t$5\n}$0`;
	if (!needPtrReceiver) {
		methodTpl = `\n\nfunc ($\{1:${receiverName}} ${uncommontypeName}) $\{2:methodName}($3) $4 {\n\t$5\n}$0`;
	}
	editor.insertSnippet(new vscode.SnippetString(methodTpl), endPos);
};

export class MethodGenerationProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [vscode.CodeActionKind.Refactor];

	async provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {
		const lineText = document.lineAt(range.start.line).text;
		// TODO(sslime336): support the uncommontypes defined in type block.
		const uncommontypeName = await this.getUncommontypeName(lineText);

		if (uncommontypeName === '') {
			return;
		}

		let documentSymbols: vscode.DocumentSymbol[] = [];
		await vscode.commands
			.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri)
			.then((symbols) => {
				documentSymbols = symbols.filter((symbol) => {
					const res = symbol.name === uncommontypeName;
					return res;
				});
			});

		if (documentSymbols.length === 0) {
			return;
		}

		const endPos = documentSymbols[0].range.end;

		const genPointerReceiverMethod = new vscode.CodeAction(
			'generate method with pointer receiver',
			vscode.CodeActionKind.Refactor
		);
		genPointerReceiverMethod.command = {
			title: CommandTitle,
			command: Command,
			arguments: [uncommontypeName, true, endPos]
		};

		const genValueReceiverMethod = new vscode.CodeAction(
			'generate method with value receiver',
			vscode.CodeActionKind.Refactor
		);
		genValueReceiverMethod.command = {
			title: CommandTitle,
			command: Command,
			arguments: [uncommontypeName, false, endPos]
		};

		return [genPointerReceiverMethod, genValueReceiverMethod];
	}

	resolveCodeAction?(
		_codeAction: vscode.CodeAction,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.CodeAction> {
		return;
	}

	// getUncommontypeName returns the user defined type's name from type definitions
	// that starts with single keyword type.
	// The types defined in the type definition block will not satisfied the regexp.
	private async getUncommontypeName(lineText: string): Promise<string> {
		const regexp = /type ([^0-9]\w+) [^0-9]\w+/;
		const matches = lineText.match(regexp);
		if (!matches) {
			return '';
		}
		return matches[1];
	}
}

// getReceiverName returns the default receiver name which is constructed with uppercase
// characters picked from the structName, it will return the first character in lowercase if
// the structName contains no uppercased character.
function getReceiverName(structName: string): string {
	let res = '';
	structName
		.split('')
		.filter((ch) => isUpperCase(ch))
		.forEach((ch) => (res += ch.toLowerCase()));
	if (res === '') {
		res = structName.charAt(0);
	}
	return res;
}

const isUpperCase = (ch: string): boolean => {
	const c = ch.charCodeAt(0);
	return 65 <= c && c <= 90;
};
