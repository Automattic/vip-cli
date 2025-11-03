import * as Types from '../graphqlTypes';

export type SiteUrlsQueryQueryVariables = Types.Exact< {
	appId: Types.Scalars[ 'Int' ][ 'input' ];
	environmentId: Types.Scalars[ 'Int' ][ 'input' ];
	after?: Types.InputMaybe< Types.Scalars[ 'String' ][ 'input' ] >;
	first: Types.Scalars[ 'Int' ][ 'input' ];
} >;

export type SiteUrlsQueryQuery = {
	__typename?: 'Query';
	app?: {
		__typename?: 'App';
		environments?: Array< {
			__typename?: 'AppEnvironment';
			wpSitesSDS?: {
				__typename?: 'WPSiteList';
				total?: number | null;
				nextCursor?: string | null;
				nodes?: Array< {
					__typename?: 'WPSite';
					id?: number | null;
					blogId?: number | null;
					homeUrl?: string | null;
					siteUrl?: string | null;
				} | null > | null;
			} | null;
		} | null > | null;
	} | null;
};
