import { App } from '../../graphqlTypes';
import { WORDPRESS_SITE_TYPE_IDS } from '../../lib/constants/vipgo';

export function currentUserCanDeployForApp( app: App ): boolean {
	// TODO: implement
	return Boolean( app );
}

export function isSupportedApp( app: App ): boolean {
	return WORDPRESS_SITE_TYPE_IDS.includes( app.typeId as number );
}
