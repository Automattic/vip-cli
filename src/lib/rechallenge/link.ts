import { ApolloLink, Observable } from '@apollo/client/core';
import debugLib from 'debug';
import { Kind, OperationTypeNode } from 'graphql';

import { isInteractiveContext, runRechallenge, shouldWaitForRechallenge } from './flow';
import tokenCache from './token-cache';
import { ELEVATED_PERMISSION_ERROR_CODE } from './types';

import type { ElevatedToken, RechallengeExtension } from './types';
import type { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

const debug = debugLib( '@automattic/vip:rechallenge:link' );

function operationDefinition( doc: DocumentNode ): OperationDefinitionNode | undefined {
	return doc.definitions.find(
		( def ): def is OperationDefinitionNode => def.kind === Kind.OPERATION_DEFINITION
	);
}

function isMutation( doc: DocumentNode ): boolean {
	return operationDefinition( doc )?.operation === OperationTypeNode.MUTATION;
}

function primaryMutationFieldName( doc: DocumentNode ): string | null {
	const op = operationDefinition( doc );
	if ( ! op || op.operation !== OperationTypeNode.MUTATION ) {
		return null;
	}
	const first = op.selectionSet.selections.find(
		( sel ): sel is FieldNode => sel.kind === Kind.FIELD
	);
	return first?.name.value ?? null;
}

interface ElevatedPermissionPayload {
	rechallenge: RechallengeExtension;
}

function extractElevatedPermission( result: ApolloLink.Result ): ElevatedPermissionPayload | null {
	const errors = result.errors ?? [];
	for ( const err of errors ) {
		const ext = ( err.extensions ?? {} ) as Record< string, unknown >;
		if ( ext.code !== ELEVATED_PERMISSION_ERROR_CODE ) {
			continue;
		}
		const rechallenge = ext.rechallenge as RechallengeExtension | undefined;
		if (
			rechallenge &&
			typeof rechallenge.createSessionPath === 'string' &&
			typeof rechallenge.statusPathTemplate === 'string' &&
			typeof rechallenge.exchangePathTemplate === 'string' &&
			typeof rechallenge.elevatedHeaderName === 'string'
		) {
			return { rechallenge };
		}
	}
	return null;
}

function attachElevatedHeader(
	operation: ApolloLink.Operation,
	headerName: string,
	token: ElevatedToken
): void {
	const ctx = operation.getContext() as {
		headers?: Record< string, string >;
	};
	const headers = { ...ctx.headers };
	headers[ headerName ] = token.token;
	operation.setContext( { ...ctx, headers } );
}

const DEFAULT_HEADER = 'x-elevated-token';

export default function createRechallengeLink(): ApolloLink {
	return new ApolloLink( ( operation, forward ) => {
		const scope = primaryMutationFieldName( operation.query );
		const eligible = isMutation( operation.query ) && Boolean( scope );

		return new Observable< ApolloLink.Result >( observer => {
			let retrying = false;
			let cancelled = false;
			let firstSub: { unsubscribe(): void } | null = null;
			let retrySub: { unsubscribe(): void } | null = null;
			const abortController = new AbortController();

			const preflight = async () => {
				if ( ! eligible || ! scope ) {
					return;
				}
				const cached = await tokenCache.get( scope );
				if ( cached ) {
					attachElevatedHeader( operation, cached.headerName || DEFAULT_HEADER, cached );
				}
			};

			const handleRetry = async (
				result: ApolloLink.Result,
				elevated: ElevatedPermissionPayload
			): Promise< void > => {
				retrying = true;
				const headerName = elevated.rechallenge.elevatedHeaderName || DEFAULT_HEADER;

				let token: ElevatedToken;
				try {
					token = await runRechallenge( {
						requestedOperation: scope as string,
						rechallenge: elevated.rechallenge,
						interactive: isInteractiveContext(),
						wait: shouldWaitForRechallenge(),
						signal: abortController.signal,
					} );
				} catch ( err ) {
					debug( 'rechallenge flow failed: %o', err );
					if ( cancelled || observer.closed ) {
						return;
					}
					// Surface the original elevated-permission error to upstream
					// so errorLink and consumers see it.
					observer.next( result );
					observer.complete();
					return;
				}

				if ( cancelled || observer.closed ) {
					return;
				}

				attachElevatedHeader( operation, headerName, token );
				try {
					retrySub = forward( operation ).subscribe( {
						next: res => observer.next( res ),
						error: err => observer.error( err ),
						complete: () => observer.complete(),
					} );
				} catch ( err ) {
					if ( cancelled || observer.closed ) {
						return;
					}
					observer.error( err );
				}
			};

			const start = async (): Promise< void > => {
				try {
					await preflight();
				} catch ( err ) {
					debug( 'preflight error: %o', err );
				}

				if ( cancelled || observer.closed ) {
					return;
				}

				try {
					firstSub = forward( operation ).subscribe( {
						next: result => {
							if ( retrying || ! eligible || ! scope ) {
								observer.next( result );
								return;
							}
							const elevated = extractElevatedPermission( result );
							if ( ! elevated ) {
								observer.next( result );
								return;
							}

							void handleRetry( result, elevated );
						},
						error: err => observer.error( err ),
						complete: () => {
							if ( ! retrying ) {
								observer.complete();
							}
						},
					} );
				} catch ( err ) {
					if ( cancelled || observer.closed ) {
						return;
					}
					observer.error( err );
				}
			};

			void start().catch( err => {
				if ( cancelled || observer.closed ) {
					return;
				}
				observer.error( err );
			} );

			return () => {
				cancelled = true;
				// Abort any in-flight rechallenge polling so the loop, its tracking
				// events, and the token-cache write stop instead of running to expiry.
				abortController.abort();
				firstSub?.unsubscribe();
				retrySub?.unsubscribe();
			};
		} );
	} );
}
