// Package hub fan-outs new-mail events per mailbox.
package hub

import "sync"

type MailEvent struct {
	ID         int64  `json:"id"`
	Mailbox    string `json:"mailbox"`
	Sender     string `json:"sender"`
	Subject    string `json:"subject"`
	ReceivedAt string `json:"received_at"`
	Size       int64  `json:"size"`
}

type Hub struct {
	mu   sync.Mutex
	subs map[string]map[chan MailEvent]struct{}
}

func New() *Hub {
	return &Hub{subs: map[string]map[chan MailEvent]struct{}{}}
}

func (h *Hub) Subscribe(mailbox string) chan MailEvent {
	ch := make(chan MailEvent, 8)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[mailbox] == nil {
		h.subs[mailbox] = map[chan MailEvent]struct{}{}
	}
	h.subs[mailbox][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(mailbox string, ch chan MailEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.subs[mailbox]; m != nil {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, mailbox)
		}
	}
	close(ch)
}

func (h *Hub) Publish(ev MailEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[ev.Mailbox] {
		select {
		case ch <- ev:
		default:
		}
	}
}
