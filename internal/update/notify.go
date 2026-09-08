package update

import (
	"context"
	"errors"
	"sync"
	"time"
)

type Notifier struct {
	State     State
	Installed string
	Platform  Platform
	Now       func() time.Time
	Fetch     func(context.Context) ([]Release, error)
}
type Notice struct {
	Version string
	Channel Channel
}

func (n Notifier) Start(parent context.Context) func() *Notice {
	if n.Now == nil {
		n.Now = time.Now
	}
	pref, err := n.State.ReadChannel()
	if err != nil {
		return func() *Notice { return nil }
	}
	ch, err := EffectiveChannel(n.Installed, pref)
	if err != nil {
		return func() *Notice { return nil }
	}
	cached, err := n.State.ReadCache(ch, n.Platform)
	if err != nil {
		cached = Cache{}
	}
	selectNotice := func(c Cache) *Notice {
		candidate, err := Select(n.Installed, ch, n.Platform, c.Releases)
		if err != nil || candidate == nil {
			return nil
		}
		return &Notice{Version: candidate.Version, Channel: ch}
	}
	if !Due(cached, n.Now()) {
		return func() *Notice { return selectNotice(cached) }
	}
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	result := make(chan Cache, 1)
	go func() {
		rs, err := n.Fetch(ctx)
		if errors.Is(ctx.Err(), context.Canceled) {
			return
		}
		c := cached
		c.Schema = 1
		c.Channel = ch
		c.Platform = n.Platform
		if err == nil {
			if _, e := Select(n.Installed, ch, n.Platform, rs); e != nil {
				err = e
			}
		}
		if err == nil {
			c.Releases = rs
			c.LastCheckedAt = n.Now()
			c.LastFailedAt = time.Time{}
		} else {
			c.LastFailedAt = n.Now()
		}
		if errors.Is(ctx.Err(), context.Canceled) {
			return
		}
		_ = n.State.WriteCache(c) // Optional cache failures never affect commands.
		result <- c
	}()
	var once sync.Once
	var notice *Notice
	return func() *Notice {
		once.Do(func() {
			cancel()
			select {
			case c := <-result:
				notice = selectNotice(c)
			default:
				notice = selectNotice(cached)
			}
		})
		return notice
	}
}
