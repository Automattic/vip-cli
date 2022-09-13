// 

/**
 * Internal dependencies
 */

export default class Secure {
	getPassword( service ) {
		return new Promise( resolve => {
			const password = window.localStorage.getItem( service );
			return resolve( password );
		} );
	}

	setPassword( service, password ) {
		return new Promise( resolve => {
			const set = !! window.localStorage.setItem( service, password );
			return resolve( set );
		} );
	}

	deletePassword( service ) {
		return new Promise( resolve => {
			const del = !! window.localStorage.removeItem( service );
			return resolve( del );
		} );
	}
}
