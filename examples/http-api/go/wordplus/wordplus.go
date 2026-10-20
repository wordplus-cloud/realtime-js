// Package wordplus is the realtime protocol of WordPlus Cloud for a server in Go, written from the public docs of the
// HTTP API (docs.wordplus.cloud/api/): what the server of an app does for the browser SDK and against the realtime
// server, with no package of ours. Every value here is checked against the test values of the protocol
// (spec/vectors.json, spec/stream-grants.json).
package wordplus

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/chacha20poly1305"
)

// The labels the keys of the app are derived with, from its secret and from its local key.
const (
	tokenLabel    = "wordplus-realtime channels v1"
	publishLabel  = "wordplus-realtime publish v1"
	webhookLabel  = "wordplus-realtime webhook v1"
	callsLabel    = "wordplus-realtime calls v1"
	streamLabel   = "easy-stream grant v1"
	keyDerive     = "wordplus-realtime key v1|"
	mediaDerive   = "wordplus-realtime media v1|"
	proofDerive   = "wordplus-realtime proof v1|"
	callKeyLabel  = "wordplus-realtime call key v1"
	DefaultAPI    = "https://rest.wordplus.cloud"
	DefaultServer = "https://ws.wordplus.cloud"
)

// App is one app on WordPlus Cloud: its key and secret from the account, and the local key only its servers know.
type App struct {
	Site     string // WORDPLUS_SITE
	Secret   string // WORDPLUS_SECRET
	LocalKey string // WORDPLUS_LOCAL_KEY, 64 hex characters
	API      string // https://rest.wordplus.cloud
}

// HMAC-SHA256 of message under key. The secret and the local key are keys as the text they are, not decoded.
func mac(key []byte, message string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(message))
	return h.Sum(nil)
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

var b64 = base64.RawURLEncoding

// jsonOf is JSON as a browser writes it: <, > and & as they are.
func jsonOf(value any) []byte {
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
	return bytes.TrimRight(out.Bytes(), "\n")
}

// --- Signing a request to the realtime server ------------------------------------------------------------------------

// Signature of a request to the realtime server: hex HMAC-SHA256, under the publish key, of
// "{timestamp}\n{METHOD}\n{path with query, as sent}\n{sha256 hex of the body}".
func (a App) Signature(timestamp, method, pathWithQuery string, body []byte) string {
	key := mac([]byte(a.Secret), publishLabel)
	return hex.EncodeToString(mac(key, timestamp+"\n"+method+"\n"+pathWithQuery+"\n"+sha256Hex(body)))
}

// Refusal is the answer of the realtime server to a request it did not take: { "ok": false, "error": code }.
type Refusal struct {
	Status int
	Code   string
}

func (r Refusal) Error() string { return fmt.Sprintf("wordplus: %d %s", r.Status, r.Code) }

// Request sends a signed request to the realtime server and answers its JSON.
func (a App) Request(method, path string, body any) (map[string]any, error) {
	api := a.API
	if api == "" {
		api = DefaultAPI
	}
	target, err := url.Parse(strings.TrimRight(api, "/") + path)
	if err != nil {
		return nil, err
	}

	var raw []byte
	if body != nil {
		raw = jsonOf(body)
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	signed := target.EscapedPath()
	if target.RawQuery != "" {
		signed += "?" + target.RawQuery
	}

	request, err := http.NewRequest(method, target.String(), bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-WordPlus-Site", a.Site)
	request.Header.Set("X-WordPlus-Timestamp", timestamp)
	request.Header.Set("X-WordPlus-Signature", a.Signature(timestamp, method, signed, raw))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)

	var answer map[string]any
	_ = json.Unmarshal(data, &answer)
	if response.StatusCode != 200 || answer["ok"] != true {
		code, _ := answer["error"].(string)
		return nil, Refusal{response.StatusCode, code}
	}
	return answer, nil
}

// --- Keys, and sealing ------------------------------------------------------------------------------------------------

// Key is the key a label names: HMAC-SHA256(local key, "wordplus-realtime key v1|" + label).
func (a App) Key(label string) []byte { return mac([]byte(a.LocalKey), keyDerive+label) }

// Entry is a key as the browser takes it: "{label}:{64 hex}".
func (a App) Entry(label string) string { return label + ":" + hex.EncodeToString(a.Key(label)) }

// Day is the UTC day since 1970, as the day keys are named: d:{day}.
func Day(at time.Time) int64 { return at.Unix() / 86400 }

func DayLabel(day int64) string    { return "d:" + strconv.FormatInt(day, 10) }
func UserLabel(user string) string { return "u:" + LabelUser(user) + ":1" }
func RoomLabel(room string) string { return "ch:" + room + ":1" }
func (a App) dayToday() string     { return DayLabel(Day(time.Now())) }
func (a App) userEntries(user string) []string {
	today := Day(time.Now())
	return []string{a.Entry(UserLabel(user)), a.Entry(DayLabel(today - 1)), a.Entry(DayLabel(today)), a.Entry(DayLabel(today + 1))}
}

// Seal seals text with the key a label names: "{label}:1.{base64url(nonce + ciphertext and tag)}", XChaCha20-Poly1305
// with the label as associated data and a random 24-byte nonce (nil for a random one).
func (a App) Seal(text, label string, nonce []byte) (string, error) {
	aead, err := chacha20poly1305.NewX(a.Key(label))
	if err != nil {
		return "", err
	}
	if nonce == nil {
		nonce = make([]byte, chacha20poly1305.NonceSizeX)
		if _, err := rand.Read(nonce); err != nil {
			return "", err
		}
	}
	sealed := aead.Seal(append([]byte{}, nonce...), nonce, []byte(text), []byte(label))
	return label + ":1." + b64.EncodeToString(sealed), nil
}

// SealJSON seals a value as its JSON.
func (a App) SealJSON(value any, label string) (string, error) {
	return a.Seal(string(jsonOf(value)), label, nil)
}

// Open opens a value this app sealed, or answers false.
func (a App) Open(value string) (string, bool) {
	at := strings.LastIndex(value, ":1.")
	if at <= 0 {
		return "", false
	}
	label := value[:at]
	raw, err := b64.DecodeString(value[at+3:])
	if err != nil || len(raw) < chacha20poly1305.NonceSizeX+16 {
		return "", false
	}
	aead, err := chacha20poly1305.NewX(a.Key(label))
	if err != nil {
		return "", false
	}
	plain, err := aead.Open(nil, raw[:chacha20poly1305.NonceSizeX], raw[chacha20poly1305.NonceSizeX:], []byte(label))
	if err != nil {
		return "", false
	}
	return string(plain), true
}

// --- Tokens for the browser -------------------------------------------------------------------------------------------

// JWT is an HS256 JSON Web Token of claims, which may be a map or JSON already in its order.
func JWT(claims any, key []byte) string {
	payload, ok := claims.([]byte)
	if !ok {
		payload = jsonOf(claims)
	}
	input := b64.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." + b64.EncodeToString(payload)
	return input + "." + b64.EncodeToString(mac(key, input))
}

// Room is a room as a token names it: what the room keeps and allows (`p`, `c`, `h`, `e`, `w`) and, for this user,
// read only (`ro`).
type Room struct {
	Presence bool     // p: its members listed, each with their info
	Count    bool     // c: a live count, with no list
	History  int      // h: how many of its last events are kept, for 5 minutes
	Emit     []string // e: the events pages may send to it, or ["*"]
	Webhook  []string // w: those the server of the app gets too
	ReadOnly bool     // ro: this user sends nothing
	Sealed   bool     // its events and its members' info sealed with its key (not in the token)
	Info     any      // what the others in a presence room see of this user
}

func (r Room) short() map[string]any {
	out := map[string]any{}
	if r.Presence {
		out["p"] = 1
	} else if r.Count {
		out["c"] = 1
	}
	if r.History > 0 {
		out["h"] = []any{r.History, 5.0 / (24 * 60)}
	}
	if list := names(r.Emit); list != nil {
		out["e"] = list
	}
	if list := names(r.Webhook); list != nil {
		out["w"] = list
	}
	if r.ReadOnly {
		out["ro"] = 1
	}
	return out
}

func names(list []string) any {
	if len(list) == 1 && list[0] == "*" {
		return "*"
	}
	if len(list) == 0 {
		return nil
	}
	return list
}

// Grant is what the auth route answers for the rooms a page asked: one token for those it may join, the keys of the
// sealed ones, and why each other was refused.
type Grant struct {
	Token  string            `json:"token,omitempty"`
	Exp    int64             `json:"exp,omitempty"`
	Keys   []string          `json:"keys,omitempty"`
	Denied map[string]string `json:"denied"`
}

// RoomGrant signs the token for the rooms a user may join (an empty user for a visitor who is not signed in).
func (a App) RoomGrant(user string, rooms map[string]Room, denied map[string]string) Grant {
	if len(rooms) == 0 {
		return Grant{Denied: denied}
	}
	now := time.Now().Unix()
	exp := now + 6*3600
	claims := map[string]any{"iss": a.Site, "aud": "wordplus-realtime", "iat": now, "exp": exp}
	if user != "" {
		claims["sub"] = user
	}
	r, infos, keys := map[string]any{}, map[string]any{}, []string{}
	var plainInfo any
	hasPlain := false
	for name, room := range rooms {
		r[name] = room.short()
		if room.Sealed {
			keys = append(keys, a.Entry(RoomLabel(name)))
		}
		if !room.Presence {
			continue
		}
		if room.Sealed {
			sealed, _ := a.SealJSON(room.Info, RoomLabel(name))
			infos[name] = sealed
		} else {
			plainInfo, hasPlain = room.Info, true
		}
	}
	claims["r"] = r
	if len(infos) > 0 {
		claims["infos"] = infos
	}
	if hasPlain {
		claims["info"] = plainInfo
	}
	return Grant{Token: JWT(claims, mac([]byte(a.Secret), tokenLabel)), Exp: exp, Keys: keys, Denied: denied}
}

// PublicGrant is a token for public rooms by pattern, which names no user: the same for every visitor.
func (a App) PublicGrant(patterns map[string]Room) map[string]any {
	now := time.Now().Unix()
	exp := now + 6*3600
	r, list := map[string]any{}, []string{}
	for pattern, room := range patterns {
		r[pattern] = room.short()
		list = append(list, pattern)
	}
	claims := map[string]any{"iss": a.Site, "aud": "wordplus-realtime", "iat": now, "exp": exp, "r": r}
	return map[string]any{"token": JWT(claims, mac([]byte(a.Secret), tokenLabel)), "exp": exp, "rooms": list}
}

// Identity is a user as the realtime server knows them, with their entry in the directory of the app: every text of their
// profile sealed with the key of today.
func (a App) Identity(user string, profile map[string]any, hidden bool) map[string]any {
	day := a.dayToday()
	pd := map[string]any{"user_id": user}
	for field, value := range profile {
		pd[field] = a.sealedValue(value, day)
	}
	full := map[string]any{"user_id": user}
	for field, value := range profile {
		full[field] = value
	}
	now := time.Now().Unix()
	exp := now + 6*3600
	claims := map[string]any{
		"iss": a.Site, "aud": "wordplus-realtime identity", "iat": now, "exp": exp, "sub": user,
		"pd": pd, "pdh": hex.EncodeToString(mac(a.Key("profile-hash"), string(jsonOf(full)))),
	}
	if hidden {
		claims["hid"] = true
	}
	return map[string]any{"token": JWT(claims, mac([]byte(a.Secret), tokenLabel)), "exp": exp}
}

func (a App) sealedValue(value any, label string) any {
	switch v := value.(type) {
	case string:
		if v == "" {
			return v
		}
		sealed, _ := a.Seal(v, label, nil)
		return sealed
	case map[string]any:
		out := map[string]any{}
		for key, item := range v {
			out[key] = a.sealedValue(item, label)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = a.sealedValue(item, label)
		}
		return out
	default:
		return v
	}
}

// Keys is what the keys route answers with no labels asked: the keys a user starts with, and their identity.
func (a App) Keys(user string, profile map[string]any) map[string]any {
	if user == "" {
		return map[string]any{"keys": []string{}}
	}
	return map[string]any{"keys": a.userEntries(user), "identity": a.Identity(user, profile, false)}
}

// --- Calls, group calls and live streams ------------------------------------------------------------------------------

func (a App) callsToken(claims map[string]any) map[string]any {
	now := time.Now().Unix()
	exp := now + 6*3600
	claims["iss"], claims["iat"], claims["exp"] = a.Site, now, exp
	return map[string]any{"token": JWT(claims, mac([]byte(a.Secret), callsLabel)), "exp": exp}
}

// callInfo is what the others see of a user in a call, sealed with the day key: everyone the app knows opens it.
func (a App) callInfo(info any) any {
	if info == nil {
		return nil
	}
	sealed, _ := a.SealJSON(info, a.dayToday())
	return sealed
}

// LabelUser is a user id as a label carries it: as it is when every character is one labels take (A-Z a-z 0-9 _ - @ , . ; :),
// else each other character, = among them, as = and the hex of its UTF-8 bytes (auth0|5f7c is auth0=7C5f7c), so no
// two ids share a label. Empty for an id of more than 64 characters, or with a space or a control character.
func LabelUser(user string) string {
	if user == "" || utf8.RuneCountInString(user) > 64 || strings.IndexFunc(user, func(r rune) bool { return unicode.IsSpace(r) || r < 0x20 || r == 0x7f }) >= 0 {
		return ""
	}
	var out strings.Builder
	for _, r := range user {
		if r < 0x80 && (unicode.IsLetter(r) || unicode.IsDigit(r) || strings.ContainsRune("_-@,.;:", r)) {
			out.WriteRune(r)
			continue
		}
		for _, b := range []byte(string(r)) {
			fmt.Fprintf(&out, "=%02X", b)
		}
	}
	return out.String()
}

// CallUser is a user as calls take them: an int64 for an id of digits ("42" is 42), else the id of text as it is, up to
// 64 characters with no space or control character. ok is false for nobody, 0, or an id calls refuse.
func CallUser(user any) (id any, ok bool) {
	const safe = 1<<53 - 1
	switch u := user.(type) {
	case float64:
		n := int64(u)
		return n, float64(n) == u && n != 0 && n <= safe && n >= -safe
	case int64:
		return u, u != 0 && u <= safe && u >= -safe
	case string:
		if LabelUser(u) == "" || u == "0" {
			return nil, false
		}
		if digits.MatchString(u) {
			if n, err := strconv.ParseInt(u, 10, 64); err == nil && n <= safe && n >= -safe {
				return n, true
			}
		}
		return u, true
	}
	return nil, false
}

var digits = regexp.MustCompile(`^-?[1-9][0-9]*$`)

// IDPart is a user in what this server joins with | to make a key or a proof: a number as its digits, and an id of text
// with its % and | escaped as %25 and %7C, so no two pairs of people make the same string.
func IDPart(user any) string {
	if s, ok := user.(string); ok {
		return strings.NewReplacer("%", "%25", "|", "%7C").Replace(s)
	}
	return fmt.Sprint(user)
}

// Line is the token of a page that holds the line of its user, where their calls ring.
func (a App) Line(user any) map[string]any {
	return a.callsToken(map[string]any{"aud": "wordplus-realtime line", "sub": user})
}

// CallKey is the key the two browsers of a call seal their negotiation with.
func (a App) CallKey(id string, caller, callee any) string {
	return hex.EncodeToString(mac([]byte(a.LocalKey), fmt.Sprintf("%s|%s|%s|%s", callKeyLabel, id, IDPart(caller), IDPart(callee))))
}

// MediaKey is the key the rooms of a call, or the room of a group call, encrypt their media with: base64url.
func (a App) MediaKey(what string) string {
	return b64.EncodeToString(mac([]byte(a.LocalKey), mediaDerive+what))
}

// Proof is a proof only this server makes: that a user is in a call (member|…), or was rung into it (rung|…).
func (a App) Proof(what string) string {
	return b64.EncodeToString(mac([]byte(a.LocalKey), proofDerive+what))
}

// CallSide is the calls route answer for one side of a call between two people, its rule having said yes: `me` placing it
// to `other` (role caller) or answering it from them (role callee). info is what the other side sees of `me`.
func (a App) CallSide(call, id, role, kind string, me, other any, info any) map[string]any {
	sealedInfo := a.callInfo(info)
	claims := map[string]any{"aud": "wordplus-realtime call", "call": call, "id": id, "sub": me, "role": role, "type": kind, "info": sealedInfo}
	caller, callee := other, me
	if role == "caller" {
		claims["to"] = other
		caller, callee = me, other
	}
	answer := a.callsToken(claims)
	answer["key"] = a.CallKey(id, caller, callee)
	answer["media_key"] = a.MediaKey(fmt.Sprintf("call|%s|%s|%s|%s", call, id, IDPart(caller), IDPart(callee)))
	answer["pair"] = []any{caller, callee}
	answer["member"] = a.Proof(fmt.Sprintf("member|%s|%s|%s|%s|%s", call, id, IDPart(caller), IDPart(callee), IDPart(me)))
	return answer
}

// GroupCall is the answer of the calls route for a place in a group call, its rule having said yes, with what this user
// may do in it. Encrypted adds the key its media is encrypted with end to end.
func (a App) GroupCall(room, kind string, me any, info any, publish, subscribe, admin, hidden, encrypted bool) map[string]any {
	sealedInfo := a.callInfo(info)
	answer := a.callsToken(map[string]any{
		"aud": "wordplus-realtime room", "room": room, "sub": me, "type": kind, "info": sealedInfo,
		"publish": publish, "subscribe": subscribe, "admin": admin, "hidden": hidden,
	})
	if encrypted {
		answer["media_key"] = a.MediaKey("room|" + room)
	}
	return answer
}

// Stream is the place of one person in a live stream: their role, and what the rule lets them do.
type Stream struct {
	Name    string   // str
	Role    string   // host or viewer
	User    string   // sub, empty for a visitor
	Display string   // name, as everyone sees them
	Avatar  string   // an https:// address
	Chat    string   // write or read
	Mod     bool     // keeps the chat
	Src     []string // what a host may send: camera, microphone, screen
	Quality string   // q: 720p or 1080p
	Offline string   // the chat while not live: open or closed
	Links   *bool    // false: links only from those who keep the chat
	Fresh   *bool    // true: the chat emptied each time it goes live
	People  string   // who sees who is watching: mods or all
	React   *bool    // whether it takes reactions
}

// StreamGrant is the grant of a live stream: an HS256 JWT keyed with HMAC(secret, "easy-stream grant v1"), its claims in
// the order of the protocol, those left unset left out. It lives ten minutes.
func (a App) StreamGrant(s Stream) map[string]any {
	now := time.Now().Unix()
	exp := now + 600
	claims := orderedClaims{}
	claims.add("iss", a.Site)
	claims.add("aud", "easy-stream")
	claims.add("str", s.Name)
	claims.add("role", s.Role)
	if s.User != "" {
		claims.add("sub", s.User)
	}
	if s.Display != "" {
		claims.add("name", s.Display)
	}
	if s.Avatar != "" {
		claims.add("avatar", s.Avatar)
	}
	if s.Chat != "" {
		claims.add("chat", s.Chat)
	}
	if s.Mod {
		claims.add("mod", true)
	}
	if len(s.Src) > 0 {
		claims.add("src", s.Src)
	}
	if s.Quality != "" {
		claims.add("q", s.Quality)
	}
	if s.Offline != "" {
		claims.add("offline", s.Offline)
	}
	if s.Links != nil {
		claims.add("links", *s.Links)
	}
	if s.Fresh != nil {
		claims.add("fresh", *s.Fresh)
	}
	if s.People != "" {
		claims.add("people", s.People)
	}
	if s.React != nil {
		claims.add("reactions", *s.React)
	}
	claims.add("iat", now)
	claims.add("exp", exp)
	return map[string]any{"token": JWT(claims.json(), mac([]byte(a.Secret), streamLabel)), "exp": exp}
}

// StreamGrantOf signs claims given as JSON in the order of the protocol, as the test values give them.
func (a App) StreamGrantOf(claimsJSON []byte) string {
	return JWT(claimsJSON, mac([]byte(a.Secret), streamLabel))
}

type orderedClaims struct{ parts [][]byte }

func (c *orderedClaims) add(name string, value any) {
	c.parts = append(c.parts, append(append(jsonOf(name), ':'), jsonOf(value)...))
}

func (c *orderedClaims) json() []byte {
	return append(append([]byte("{"), bytes.Join(c.parts, []byte(","))...), '}')
}

// --- Webhooks -----------------------------------------------------------------------------------------------------------

// WebhookEvent is one event of a webhook: room.occupied, room.vacated, member.joined, member.left, user.online,
// user.offline, stream.live, stream.ended, or emit (an event of a page that the rule of its room names in `webhook`, its
// data opened).
type WebhookEvent map[string]any

// Webhook checks a webhook as it came (its body as sent, and the path it came to with its query) and answers its events,
// their data opened.
func (a App) Webhook(header http.Header, pathWithQuery string, raw []byte) ([]WebhookEvent, error) {
	timestamp := header.Get("X-WordPlus-Timestamp")
	if header.Get("X-WordPlus-Site") != a.Site || timestamp == "" {
		return nil, errors.New("missing_signature")
	}
	at, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || abs(time.Now().Unix()-at) > 300 {
		return nil, errors.New("stale_signature")
	}
	key := mac([]byte(a.Secret), webhookLabel)
	expected := hex.EncodeToString(mac(key, timestamp+"\nPOST\n"+pathWithQuery+"\n"+sha256Hex(raw)))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(header.Get("X-WordPlus-Signature"))) != 1 {
		return nil, errors.New("bad_signature")
	}

	var body struct {
		Events []WebhookEvent `json:"events"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, errors.New("bad_request")
	}
	for _, event := range body.Events {
		if sealed, ok := event["data"].(string); ok && event["type"] == "emit" {
			if plain, opened := a.Open(sealed); opened {
				var data any
				if json.Unmarshal([]byte(plain), &data) == nil {
					event["data"] = data
				}
			}
		}
	}
	return body.Events, nil
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

// --- Sending ------------------------------------------------------------------------------------------------------------

// Emit sends an event to rooms, the data of each sealed with the key of its room. History is how many of its last events a
// room keeps, as its rule says (0 for none). Answers the ids of the kept events, by room.
func (a App) Emit(room string, event string, data any, sealed bool, history int) (map[string]any, error) {
	payload := any(data)
	if sealed {
		value, err := a.SealJSON(data, RoomLabel(room))
		if err != nil {
			return nil, err
		}
		payload = value
	}
	body := map[string]any{"rooms": []string{room}, "event": event, "data": payload}
	if history > 0 {
		body["history"] = map[string]any{room: []any{history, 5.0 / (24 * 60)}}
	}
	answer, err := a.Request("POST", "/wordplus/realtime/emit", body)
	if err != nil {
		return nil, err
	}
	ids, _ := answer["ids"].(map[string]any)
	return ids, nil
}

// EmitToUser sends an event to a user, every tab and device they have open, sealed with their own key.
func (a App) EmitToUser(user string, event string, data any) error {
	sealed, err := a.SealJSON(data, UserLabel(user))
	if err != nil {
		return err
	}
	_, err = a.Request("POST", "/wordplus/realtime/emit", map[string]any{"users": []string{user}, "event": event, "data": sealed})
	return err
}
