// @flow
/**
 * External dependencies
 */
import debugLib from 'debug';
import gql from 'graphql-tag';

/**
 * Internal dependencies
*/
import API from 'lib/api';

const debug = debugLib( '@automattic/vip:lib:config:notifications' );

const addNotificationStreamMutation = gql`
    mutation AddNotificationStream(
        $appId: BigInt!
        $envId: BigInt!
        $streamValue: String!
        $description: String
        $meta: String
    ) {
       addNotificationStream(
            input: {
                applicationId: $appId
                environmentId: $envId
                streamValue: $streamValue
                description: $description
                meta: $meta
            }
       ) {
        nodes {
            notification_stream_id
            target_type
            target_id
            description
            stream_type
            stream_value
            active
            meta
            created_at
            updated_at
        }
        total
       }
    }
`;

const updateNotificationStreamMutation = gql`
    mutation UpdateNotificationStream(
        $notificationStreamId: BigInt!
        $appId: BigInt!
        $envId: BigInt!
        $streamType: String!
        $streamValue: String!
        $active: Boolean
        $description: String
        $meta: String
    ) {
       updateNotificationStream(
            input: {
                notificationStreamId: $notificationStreamId
                applicationId: $appId
                environmentId: $envId
                streamType: $streamType
                streamValue: $streamValue
                active: $active
                description: $description
                meta: $meta
            }
       ) {
        nodes {
            notification_stream_id
            target_type
            target_id
            description
            stream_type
            stream_value
            active
            meta
            created_at
            updated_at
        }
        total
       }
    }
`;

export async function addNotificationStream( appId: number, envId: number, streamValue: string, description: string, meta: any ) {
	const api = await API();

	const _meta = typeof meta === 'string' ? meta : JSON.stringify( meta );

	const variables = {
		appId,
		envId,
		streamValue,
		active: true,
		description,
		meta: _meta,
	};

	return api.mutate( { mutation: addNotificationStreamMutation, variables } );
}

export async function updateNotificationStream( appId: number, envId: number, notificationStreamId: number, streamType: string, streamValue: string, description: string, meta: string, active: boolean ) {
	const api = await API();

	const variables = {
		appId,
		envId,
		notificationStreamId,
		streamType,
		streamValue,
		active,
		description,
		meta,
	};

	variables.active = Boolean( variables.active );

	return api.mutate( { mutation: updateNotificationStreamMutation, variables } );
}

export const appQuery = `
    id,
    name,
    type,
    typeId,
    organization { id, name },
    environments{
        appId
        id
        name
        type
        uniqueLabel
        notificationStreams {
            nodes {
                notification_stream_id
                target_type
                target_id
                description
                stream_type
                stream_value
                active
                meta
                created_at
                updated_at
            }
            total
        }
    }
`;
