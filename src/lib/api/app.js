// @flow

const API = require( '../api' );
module.exports = async function( app: string | number ): Promise<any> {
	const api = await API();

	if ( isNaN( parseInt( app ) ) ) {
		const res = await api
			.query( {
				query: `{limit:1,apps(name:"${ app }"){
					id,name,environments{id,name,defaultDomain,branch,datacenter}
				}}`
			} )
			.catch( err => console.log( err ) );

		if ( ! res || ! res.data || ! res.data.apps || ! res.data.apps.length ) {
			return {};
		}

		return res.data.apps[ 0 ];
	}

	const res = await api
		.query( {
			query: `{app(id:${ app }){
				id,name,environments{id,name,defaultDomain,branch,datacenter}
			}}`
		} )
		.catch( err => console.log( err ) );

	if ( ! res || ! res.data || ! res.data.app ) {
		return {};
	}

	return res.data.app;
};
