const fs = require( 'fs' );
const path = require( 'path' );
const crypto = require( 'crypto' );
const forge = require( 'node-forge' );
const xdgBaseDir = require( 'xdg-basedir' );

function checkVipDir( vipDir ) {
	const stat = fs.lstatSync( vipDir, { throwIfNoEntry: false } );
	if ( ! stat ) {
		fs.mkdirSync( vipDir, { recursive: true } );
	} else if ( ! stat.isDirectory() ) {
		throw new Error( `${ vipDir } is not a directory` );
	}
}

function checkCaFilesExist( vipDir ) {
	const keyFile = path.join( vipDir, 'lndo.site.key' );
	const certFile = path.join( vipDir, 'lndo.site.pem' );
	const kStat = fs.lstatSync( keyFile, { throwIfNoEntry: false } );
	const cStat = fs.lstatSync( certFile, { throwIfNoEntry: false } );

	if ( kStat && cStat && kStat.isFile() && cStat.isFile() ) {
		return true;
	}

	if ( kStat && ! kStat.isFile() ) {
		throw new Error( `${ keyFile } is not a file` );
	}

	if ( cStat && ! cStat.isFile() ) {
		throw new Error( `${ certFile } is not a file` );
	}

	return false;
}

/**
 * @param {number} bits Key size in bits
 * @returns {Promise<forge.pki.rsa.KeyPair>} The generated key pair
 */
function generateKeyPair( bits ) {
	return new Promise( ( resolve, reject ) => {
		forge.pki.rsa.generateKeyPair( { bits }, ( err, keypair ) => {
			if ( err ) {
				reject( err );
			} else {
				resolve( keypair );
			}
		} );
	} );
}

function verifyCaFiles( vipDir ) {
	const keyFile = path.join( vipDir, 'lndo.site.key' );
	const certFile = path.join( vipDir, 'lndo.site.pem' );

	let key, cert;
	try {
		key = forge.pki.privateKeyFromPem( fs.readFileSync( keyFile ) );
		cert = forge.pki.certificateFromPem( fs.readFileSync( certFile ) );
	} catch ( err ) {
		console.warn( 'Error reading the CA data' );
		return false;
	}

	const publicKey = forge.pki.setRsaPublicKey( key.n, key.e );
	if ( forge.pki.getPublicKeyFingerprint( publicKey, { encoding: 'hex', delimiter: ':' } ) !== forge.pki.getPublicKeyFingerprint( cert.publicKey, { encoding: 'hex', delimiter: ':' } ) ) {
		console.warn( 'CA private key does not match the certificate' );
		return false;
	}

	if ( cert.validity.notAfter.getTime() - Date.now() <= 0 ) {
		console.warn( 'CA certificate has expired' );
		return false;
	}

	return true;
}

( async () => {
	if ( xdgBaseDir.data ) {
		try {
			console.log( 'Checking for existing CA data...' );
			const vipDir = path.join( xdgBaseDir.data, 'vip' );
			checkVipDir( vipDir );
			if ( checkCaFilesExist( vipDir ) && verifyCaFiles( vipDir ) ) {
				console.log( 'CA files exist and are valid.' );
				process.exit( 0 );
			}

			const keyPair = await generateKeyPair( 2048 );
			const cert = forge.pki.createCertificate();
			cert.publicKey = keyPair.publicKey;
			cert.validity.notBefore = new Date();
			cert.validity.notAfter = new Date();
			cert.validity.notAfter.setFullYear( cert.validity.notBefore.getFullYear() + 9 );
			cert.serialNumber = `00${ crypto.randomUUID().replace( /-/g, '' ) }`;

			const attributes = [
				{
					name: 'commonName',
					value: 'VIP Dev Env Local CA',
				},
				{
					name: 'countryName',
					value: 'US',
				},
				{
					shortName: 'ST',
					value: 'California',
				},
				{
					name: 'localityName',
					value: 'San Francisco',
				},
				{
					name: 'organizationName',
					value: 'Automattic',
				},
				{
					shortName: 'OU',
					value: 'VIP',
				},
			];

			cert.setSubject( attributes );
			cert.setIssuer( attributes );
			cert.setExtensions( [
				{
					name: 'basicConstraints',
					cA: true,
					critical: true,
				},
				{
					name: 'keyUsage',
					keyCertSign: true,
					digitalSignature: true,
					nonRepudiation: true,
					keyEncipherment: true,
					dataEncipherment: true,
				},
				{
					name: 'subjectKeyIdentifier',
				},
				{
					name: 'authorityKeyIdentifier',
					keyIdentifier: cert.generateSubjectKeyIdentifier().getBytes(),
				},
			] );

			cert.sign( keyPair.privateKey, forge.md.sha256.create() );

			const certFile = path.join( vipDir, 'lndo.site.pem' );
			const keyFile = path.join( vipDir, 'lndo.site.key' );
			fs.writeFileSync( certFile, forge.pki.certificateToPem( cert ) );
			fs.writeFileSync( keyFile, forge.pki.privateKeyToPem( keyPair.privateKey ) );
			console.log( 'Successfully generated CA data.' );
			console.log( `Certificate Authority file: ${ certFile }` );
		} catch ( err ) {
			console.error( err );
			process.exit( 0 );
		}
	} else {
		console.warn( 'No XDG data directory found' );
		process.exit( 0 );
	}
} )();
