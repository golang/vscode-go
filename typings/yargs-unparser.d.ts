declare module 'yargs-unparser' {
	// Modified from './node_modules/@types/yargs-parser/index.d.ts'.
	namespace yargsUnparser {
		interface Arguments {
			/** Non-option arguments */
			_: string[];
			/** The script name or node command */
			$0: string;
			/** All remaining options */
			[argName: string]: any;
		}

		interface Options {
			alias?: { [key: string]: string | string[] };
			default?: { [key: string]: any };
			command?: string;
		}

		interface Unparser {
			(argv: Arguments, opts?: Options): string[];
		}
	}
	var yargsUnparser: yargsUnparser.Unparser;
	export = yargsUnparser;
}
