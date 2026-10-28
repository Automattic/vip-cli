import { randomBytes } from 'node:crypto';

export function invocationId() {
	const value = process.env.VIP_DEVENV_E2E_INVOCATION_ID;
	if ( ! value || ! /^[a-f0-9]{16}$/.test( value ) ) {
		throw new Error( 'Missing or invalid dev-env E2E invocation ID' );
	}
	return value;
}

export function getProjectSlug() {
	const worker = `${ Number( process.env.JEST_WORKER_ID || '1' ) }`.padStart( 4, '0' );
	return `dev-env-${ invocationId() }-${ worker }-${ randomBytes( 4 ).toString( 'hex' ) }`;
}

export function ownsProject( project ) {
	const prefix = `dev-env-${ invocationId() }-`;
	return (
		project.startsWith( prefix ) && /^\d{4}-[a-f0-9]{8}$/.test( project.slice( prefix.length ) )
	);
}
