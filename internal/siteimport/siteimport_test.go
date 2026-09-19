package siteimport

import "testing"

func TestIsSupportedApp(t *testing.T) {
	// DATABASE_APPLICATION_TYPE_IDS = [2, 6, 5, 8] (src/lib/constants/vipgo.ts:19)
	for id, want := range map[int64]bool{2: true, 6: true, 5: true, 8: true, 3: false, 0: false} {
		if got := IsSupportedApp(id); got != want {
			t.Errorf("IsSupportedApp(%d) = %v", id, got)
		}
	}
}

func TestSizeLimits(t *testing.T) {
	const gb = int64(1024 * 1024 * 1024)
	if SQLImportFileSizeLimit != 200*gb || SQLImportFileSizeLimitLaunched != 10*gb {
		t.Errorf("limits = %d / %d", SQLImportFileSizeLimit, SQLImportFileSizeLimitLaunched)
	}
}
