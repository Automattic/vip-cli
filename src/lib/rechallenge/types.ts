export const ELEVATED_PERMISSION_ERROR_CODE = 'elevated-permission-required';
export const RECHALLENGE_VERSION = 'v2';
export const CLIENT_TYPE = 'cli';

export type RechallengeStatus = 'pending' | 'verified' | 'expired' | 'failed' | 'cancelled';

/** Shape of `errors[0].extensions.rechallenge` from the API. */
export interface RechallengeExtension {
	version: string;
	createSessionPath: string;
	statusPathTemplate: string;
	exchangePathTemplate: string;
	elevatedHeaderName: string;
}

/** Response from POST {createSessionPath}. */
export interface RechallengeSession {
	challengeId: string;
	status: RechallengeStatus;
	verificationUrl: string;
	pollIntervalSeconds: number;
	expiresAt: string; // ISO-8601
}

/** Response from GET {statusPathTemplate}. */
export interface RechallengeSessionStatus {
	challengeId: string;
	status: RechallengeStatus;
	expiresAt: string;
	verifiedAt?: string;
	provider?: 'passkeys' | 'totp' | 'sso-saml' | 'unknown';
	pollIntervalSeconds: number;
	statusReason?: { code: string; message: string };
}

/** Response from POST {exchangePathTemplate}. */
export interface ElevatedTokenExchangeResponse {
	elevatedToken: ElevatedToken;
}

export interface ElevatedToken {
	token: string;
	expiresAt: string; // ISO-8601
	purpose: string;
}
