import { Response, onClientResponse } from '@automattic/vip-edge-workers-sdk';

export { alloc, on_client_response } from '@automattic/vip-edge-workers-sdk/assembly/index';

// Client response: runs before the response reaches the client.
onClientResponse( ( response: Response ): void => {} );

// Other available phases are intentionally inactive. To activate one, add its
// SDK type and hook to the import above, its host entrypoint to the export above,
// and its handler below. Do not export a phase without implementing its hook.
//
// Client request: Request, onClientRequest, on_client_request
// onClientRequest( ( request: Request ): void => {} );
//
// Origin request: Request, onOriginRequest, on_origin_request
// onOriginRequest( ( request: Request ): void => {} );
//
// Origin response: Response, onOriginResponse, on_origin_response
// onOriginResponse( ( response: Response ): void => {} );
