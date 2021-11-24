declare module 'json-rpc2' {
	export interface RPCConnection {
		call<T>(command: string, args: any[], callback: (err: Error, result: T) => void): void;
		on(event: 'connect' | 'end', cb: () => {}): this;
		on(event: 'error', cb: (err: Error) => {}): this;
		on(event: string, cb: Function): this;
	}

	export class Client {
		static $create(port: number, addr: string): Client;
		connectSocket(): RPCConnection;
	}
}
