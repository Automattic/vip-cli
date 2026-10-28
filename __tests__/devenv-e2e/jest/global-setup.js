const { randomBytes } = require( 'node:crypto' );

module.exports = async () => {
	process.env.VIP_DEVENV_E2E_INVOCATION_ID = randomBytes( 8 ).toString( 'hex' );
};
