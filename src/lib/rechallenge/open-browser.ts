import debugLib from 'debug';

const debug = debugLib( '@automattic/vip:rechallenge:open-browser' );

/** Opens a URL in the default browser. Wraps the ESM-only `open` package. */
export async function openBrowser( url: string ): Promise< void > {
	const { default: open } = await import( 'open' );
	await open( url, { wait: false } ).catch( ( err: unknown ) => {
		debug( 'open() failed: %o', err );
	} );
}
