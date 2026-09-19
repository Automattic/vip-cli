// Package defensivemode is the M3+M4 test surface for the rechallenge
// middleware. Two GraphQL mutations: UpdateDefensiveModeStatus and
// UpdateDefensiveModeConfig. Both require step-up auth on production
// environments — the rechallenge middleware in internal/gql handles that
// transparently. M4: ports the raw HTTP POST to genqlient.
package defensivemode

import (
	"context"
	"fmt"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// UpdateStatusInput is the Go side of AppEnvironmentDefensiveModeUpdateStatusInput.
// The Node wire format uses `id`/`environmentId`/`enabled` (NOT appId/envId);
// genqlient handles the on-the-wire field names from the schema.
type UpdateStatusInput struct {
	AppID   int64
	EnvID   int64
	Enabled bool
}

type UpdateConfigInput struct {
	AppID                         int64
	EnvID                         int64
	Enabled                       bool
	ChallengeType                 int
	ConnectionThresholdAbsolute   *int
	ConnectionThresholdPercentage *int
}

type MutationResult struct {
	Success bool
	Message string
}

func UpdateDefensiveModeStatus(ctx context.Context, client graphql.Client, in UpdateStatusInput) (*MutationResult, error) {
	input := &gql.AppEnvironmentDefensiveModeUpdateStatusInput{
		Enabled:       in.Enabled,
		EnvironmentId: in.EnvID,
		Id:            in.AppID,
	}
	resp, err := gql.UpdateDefensiveModeStatus(ctx, client, input)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.UpdateDefensiveModeStatus == nil {
		return nil, errMissingPayload("updateDefensiveModeStatus")
	}
	return &MutationResult{
		Success: resp.UpdateDefensiveModeStatus.Success,
		Message: resp.UpdateDefensiveModeStatus.Message,
	}, nil
}

func UpdateDefensiveModeConfig(ctx context.Context, client graphql.Client, in UpdateConfigInput) (*MutationResult, error) {
	input := &gql.AppEnvironmentDefensiveModeConfigInput{
		Enabled:       in.Enabled,
		EnvironmentId: in.EnvID,
		Id:            in.AppID,
		ChallengeType: int64(in.ChallengeType),
	}
	if in.ConnectionThresholdAbsolute != nil {
		v := int64(*in.ConnectionThresholdAbsolute)
		input.ConnectionThresholdAbsolute = &v
	}
	if in.ConnectionThresholdPercentage != nil {
		v := int64(*in.ConnectionThresholdPercentage)
		input.ConnectionThresholdPercentage = &v
	}
	resp, err := gql.UpdateDefensiveModeConfig(ctx, client, input)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.UpdateDefensiveModeConfig == nil {
		return nil, errMissingPayload("updateDefensiveModeConfig")
	}
	return &MutationResult{
		Success: resp.UpdateDefensiveModeConfig.Success,
		Message: resp.UpdateDefensiveModeConfig.Message,
	}, nil
}

func errMissingPayload(field string) error {
	return fmt.Errorf("%s response missing payload; the API may have rejected the request", field)
}
