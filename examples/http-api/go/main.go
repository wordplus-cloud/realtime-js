// An app server in Go on WordPlus Cloud, with no package of ours: its rules, the routes the browser SDK asks
// (/api/realtime/config, auth, calls, keys) and the webhook, as docs.wordplus.cloud/api/ describes them, on the wordplus
// package beside it. The page is any page that runs @wordplus/realtime: connect( await fetch( '/api/realtime/config' ) ).
//
//	WORDPLUS_SITE=… WORDPLUS_SECRET=… WORDPLUS_LOCAL_KEY=… go run .
//
// Who the user is comes from the X-User header here, so the example runs on its own: a real app takes them from its
// session. The routes under /check/ are for the end-to-end check of the example, not for an app.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"example.com/wordplus-realtime-go/wordplus"
)

var app = wordplus.App{
	Site:     os.Getenv("WORDPLUS_SITE"),
	Secret:   os.Getenv("WORDPLUS_SECRET"),
	LocalKey: os.Getenv("WORDPLUS_LOCAL_KEY"),
	API:      env("WORDPLUS_API", wordplus.DefaultAPI),
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

// pattern turns a room pattern such as order:{id} into its regexp: a {part} is one or more characters but : and .
func pattern(p string) *regexp.Regexp {
	quoted := regexp.QuoteMeta(p)
	return regexp.MustCompile("^" + regexp.MustCompile(`\\\{[a-z]+\\\}`).ReplaceAllString(quoted, `([^:.]+)`) + "$")
}

var (
	orders   = pattern("order:{id}")
	chats    = pattern("chat:{a}:{b}")
	products = pattern("product:{id}")
	support  = pattern("support:{a}:{b}")
	meetings = pattern("meeting:{id}")
	shows    = pattern("show:{id}")
)

func profile(user string) map[string]any { return map[string]any{"name": "User " + user} }

// The rooms' rules: whether this user may join the room, and what it keeps and allows. Nil for no.
func roomRule(room, user string) (*wordplus.Room, string) {
	if m := orders.FindStringSubmatch(room); m != nil {
		if user == "" || user != m[1] {
			return nil, "forbidden"
		}
		return &wordplus.Room{History: 10, Sealed: true}, ""
	}
	if m := chats.FindStringSubmatch(room); m != nil {
		if user == "" || (user != m[1] && user != m[2]) {
			return nil, "forbidden"
		}
		return &wordplus.Room{Presence: true, Emit: []string{"message", "typing", "read"}, Webhook: []string{"message"}, Sealed: true, Info: profile(user)}, ""
	}
	if products.MatchString(room) {
		return &wordplus.Room{Count: true}, ""
	}
	return nil, "no_rule"
}

// --- The routes the browser asks -------------------------------------------------------------------------------------

func config(w http.ResponseWriter, r *http.Request) {
	user := r.Header.Get("X-User")
	headers := map[string]string{}
	if user != "" {
		headers["X-User"] = user
	}
	keys := map[string]any{"endpoint": "/api/realtime/keys", "headers": headers, "entries": []string{}}
	if user != "" {
		answer := app.Keys(user, profile(user))
		keys["entries"], keys["identity"] = answer["keys"], answer["identity"]
	}
	reply(w, map[string]any{
		"server": env("WORDPLUS_SERVER", wordplus.DefaultServer),
		"path":   "/websocket",
		"site":   app.Site,
		"api":    app.API,
		"rooms":  "/realtime-rooms.min.js",
		"grants": []any{app.PublicGrant(map[string]wordplus.Room{"product:{id}": {Count: true}})},
		"auth":   map[string]any{"endpoint": "/api/realtime/auth", "headers": headers},
		"calls":  map[string]any{"endpoint": "/api/realtime/calls", "headers": headers},
		"keys":   keys,
	})
}

func auth(w http.ResponseWriter, r *http.Request, user string) {
	var body struct {
		Rooms []string `json:"rooms"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.Rooms == nil {
		w.WriteHeader(400)
		reply(w, map[string]string{"code": "bad_request"})
		return
	}
	allowed, denied := map[string]wordplus.Room{}, map[string]string{}
	for _, room := range body.Rooms {
		if rule, refusal := roomRule(room, user); rule != nil {
			allowed[room] = *rule
		} else {
			denied[room] = refusal
		}
	}
	reply(w, app.RoomGrant(user, allowed, denied))
}

func keys(w http.ResponseWriter, r *http.Request, user string) {
	var body struct {
		Labels []string `json:"labels"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.Labels) == 0 {
		reply(w, app.Keys(user, profile(user)))
		return
	}
	given := []string{}
	today := wordplus.Day(time.Now())
	for _, label := range body.Labels {
		switch {
		case strings.HasPrefix(label, "ch:") && strings.HasSuffix(label, ":1"):
			if rule, _ := roomRule(strings.TrimSuffix(strings.TrimPrefix(label, "ch:"), ":1"), user); rule != nil && rule.Sealed {
				given = append(given, app.Entry(label))
			}
		case strings.HasPrefix(label, "d:") && user != "":
			if day, err := strconv.ParseInt(label[2:], 10, 64); err == nil && day <= today+1 {
				given = append(given, app.Entry(label))
			}
		case user != "" && label == wordplus.UserLabel(user):
			given = append(given, app.Entry(label))
		}
	}
	reply(w, map[string]any{"keys": given})
}

func calls(w http.ResponseWriter, r *http.Request, user string) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)

	// A live stream: user 42 hosts the shows, everyone else watches them, a visitor who is not signed in too.
	if name, ok := body["stream"].(string); ok {
		if !shows.MatchString(name) {
			reply(w, map[string]string{"denied": "forbidden"})
			return
		}
		role := "viewer"
		if user == "42" {
			role = "host"
		}
		display := ""
		if user != "" {
			display = "User " + user
		}
		reply(w, app.StreamGrant(wordplus.Stream{Name: name, Role: role, User: user, Display: display}))
		return
	}

	// Any user id: a number for an id of digits, else the id of text as it is.
	me, ok := wordplus.CallUser(user)
	if !ok {
		reply(w, map[string]string{"denied": "no_user"})
		return
	}
	if body["line"] == true {
		reply(w, app.Line(me))
		return
	}
	kind := "video"
	if body["type"] == "audio" {
		kind = "audio"
	}
	if room, ok := body["room"].(string); ok {
		if !meetings.MatchString(room) {
			reply(w, map[string]string{"denied": "forbidden"})
			return
		}
		reply(w, app.GroupCall(room, kind, me, profile(user), true, true, false, false, true))
		return
	}

	call, _ := body["call"].(string)
	id, _ := body["id"].(string)
	role, _ := body["role"].(string)
	otherOf := map[string]string{"caller": "to", "callee": "from"}[role]
	other, found := wordplus.CallUser(body[otherOf])
	m := support.FindStringSubmatch(call)
	if m == nil || id == "" || !found || other == me || body["group"] != nil {
		reply(w, map[string]string{"denied": "bad_request"})
		return
	}
	// The rule: both people of the call are the two it names.
	pair := map[string]bool{m[1]: true, m[2]: true}
	if !pair[fmt.Sprint(me)] || !pair[fmt.Sprint(other)] {
		reply(w, map[string]string{"denied": "forbidden"})
		return
	}
	reply(w, app.CallSide(call, id, role, kind, me, other, profile(user)))
}

// --- The webhook, and what the check asks for -----------------------------------------------------------------------

var (
	heard   []wordplus.WebhookEvent
	heardMu sync.Mutex
)

func webhook(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	events, err := app.Webhook(r.Header, r.URL.RequestURI(), raw)
	if err != nil {
		w.WriteHeader(401)
		reply(w, map[string]string{"code": err.Error()})
		return
	}
	heardMu.Lock()
	heard = append(heard, events...)
	heardMu.Unlock()
	w.WriteHeader(204)
}

func check(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	var answer any
	var err error
	switch r.URL.Path {
	case "/check/emit":
		answer, err = app.Emit(body["room"].(string), body["event"].(string), body["data"], body["sealed"] == true, int(number(body["history"])))
	case "/check/emit-user":
		err = app.EmitToUser(body["user"].(string), body["event"].(string), body["data"])
	case "/check/request":
		var payload any
		if body["body"] != nil {
			payload = body["body"]
		}
		answer, err = app.Request(body["method"].(string), body["path"].(string), payload)
	case "/check/webhooks":
		heardMu.Lock()
		answer = heard
		heardMu.Unlock()
	}
	if err != nil {
		w.WriteHeader(502)
		reply(w, map[string]string{"error": err.Error()})
		return
	}
	reply(w, answer)
}

func number(value any) float64 {
	n, _ := value.(float64)
	return n
}

func reply(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(value)
}

func main() {
	static, assets := env("STATIC", "static"), env("ASSETS", "assets")
	routes := map[string]func(http.ResponseWriter, *http.Request, string){"auth": auth, "calls": calls, "keys": keys}

	http.HandleFunc("/api/realtime/", func(w http.ResponseWriter, r *http.Request) {
		action := strings.TrimPrefix(r.URL.Path, "/api/realtime/")
		switch {
		case action == "config":
			config(w, r)
		case action == "webhook" && r.Method == "POST":
			webhook(w, r)
		case routes[action] != nil && r.Method == "POST":
			routes[action](w, r, r.Header.Get("X-User"))
		default:
			w.WriteHeader(404)
		}
	})
	http.HandleFunc("/check/", check)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(r.URL.Path)
		if strings.HasPrefix(name, "realtime-") {
			http.ServeFile(w, r, filepath.Join(assets, name))
			return
		}
		if r.URL.Path == "/" {
			name = "index.html"
		}
		http.ServeFile(w, r, filepath.Join(static, name))
	})

	address := "127.0.0.1:" + env("PORT", "8080")
	log.Println("listening on http://" + address)
	log.Fatal(http.ListenAndServe(address, nil))
}
