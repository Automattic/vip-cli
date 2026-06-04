export const PRODUCTION_API_HOST = 'https://api.wpvip.com';
export const API_HOST = process.env.API_HOST || PRODUCTION_API_HOST; // NOSONAR
export const API_URL = `${ API_HOST }/graphql`;
