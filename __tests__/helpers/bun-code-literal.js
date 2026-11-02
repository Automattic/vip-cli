import vm from 'node:vm';

import { javascriptString } from '../../helpers/bun-code-literal';

describe( 'Bun generated string literals', () => {
	it.each( [
		'vip-dev-env-list.js',
		'C:\\Users\\runner\\CLI with spaces\\commands',
		'quotes " and \' and backslashes \\',
		'</script><script>globalThis.injected = true</script>',
		'line\nreturn\rtab\tbackspace\bformfeed\fnull\0',
		'Unicode \u2028 separator \u2029 and emoji 😀',
		'"; globalThis.injected = true; //',
	] )( 'round trips %j without injecting code', value => {
		const literal = javascriptString( value );
		const context = {};
		expect( literal ).not.toMatch( /[<>\u2028\u2029]/ );
		expect( JSON.parse( literal ) ).toBe( value );
		expect( vm.runInNewContext( `(${ literal })`, context ) ).toBe( value );
		expect( context.injected ).toBeUndefined();
	} );
} );
