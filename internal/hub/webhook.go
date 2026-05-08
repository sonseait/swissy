package hub

import "sync"

// WebhookEvent carries enough metadata for the SSE listener to know a new
// inbound request arrived; full body is fetched from the store on demand.
type WebhookEvent struct {
	ID           int64  `json:"id"`
	HookPublicID string `json:"hook_public_id"`
	Method       string `json:"method"`
	Path         string `json:"path"`
	Size         int64  `json:"size"`
	ReceivedAt   string `json:"received_at"`
}

type WebhookHub struct {
	mu   sync.Mutex
	subs map[string]map[chan WebhookEvent]struct{}
}

func NewWebhookHub() *WebhookHub {
	return &WebhookHub{subs: map[string]map[chan WebhookEvent]struct{}{}}
}

func (h *WebhookHub) Subscribe(hookID string) chan WebhookEvent {
	ch := make(chan WebhookEvent, 16)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[hookID] == nil {
		h.subs[hookID] = map[chan WebhookEvent]struct{}{}
	}
	h.subs[hookID][ch] = struct{}{}
	return ch
}

func (h *WebhookHub) Unsubscribe(hookID string, ch chan WebhookEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.subs[hookID]; m != nil {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, hookID)
		}
	}
	close(ch)
}

func (h *WebhookHub) Publish(ev WebhookEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[ev.HookPublicID] {
		select {
		case ch <- ev:
		default:
		}
	}
}
