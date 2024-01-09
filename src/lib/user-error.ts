export default class UserError extends Error {
	constructor( message: string, options?: ErrorOptions ) {
		super( message, options );
		this.name = 'UserError';
	}
}
