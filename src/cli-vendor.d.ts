declare module 'cli-columns' {
	function columns( values: string[] ): string;
	export = columns;
}

declare module 'socket.io-stream' {
	import type { Duplex } from 'node:stream';
	import type { Socket } from 'socket.io-client';

	interface StreamSocket {
		emit( event: 'cmd', data: Record< string, string | number >, stdin: Duplex, stdout: Duplex ): void;
		on( event: 'error', handler: ( error: Error ) => Error ): StreamSocket;
		off( event: 'error', handler: ( error: Error ) => Error ): StreamSocket;
	}

	interface StreamFactory {
		( socket: Socket ): StreamSocket;
		createStream(): Duplex;
	}

	const IOStream: StreamFactory;
	export = IOStream;
}
