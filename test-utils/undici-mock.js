import { getGlobalDispatcher } from 'undici';

const asMockAgent = () => {
	const dispatcher = getGlobalDispatcher();

	if ( typeof dispatcher.get !== 'function' ) {
		throw new Error( 'Expected global dispatcher to be an undici MockAgent.' );
	}

	return dispatcher;
};

export const getUndiciMockPool = origin => asMockAgent().get( origin );

export const resetUndiciMockAgent = ( { assertNoPending = true } = {} ) => {
	const mockAgent = asMockAgent();

	if ( assertNoPending && typeof mockAgent.assertNoPendingInterceptors === 'function' ) {
		mockAgent.assertNoPendingInterceptors();
	}

	if ( typeof mockAgent.clearIntercepts === 'function' ) {
		mockAgent.clearIntercepts();
	}
};
