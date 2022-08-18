function UserError( message ) {
	this.message = message;
}

UserError.prototype = new Error;

export default UserError;
