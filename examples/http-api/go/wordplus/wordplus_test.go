package wordplus

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The test values of the protocol: every implementation must reproduce each of them.
func vectors(t *testing.T, name string) map[string]any {
	raw, err := os.ReadFile("../../../../spec/" + name)
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]any
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestTheTestValues(t *testing.T) {
	v := vectors(t, "vectors.json")
	app := App{Site: v["site"].(string), Secret: v["secret"].(string), LocalKey: v["local_key"].(string)}
	same := func(what, got, want string) {
		if got != want {
			t.Errorf("%s: got %s, want %s", what, got, want)
		}
	}

	derived := v["derived"].(map[string]any)
	for label, name := range map[string]string{tokenLabel: "channels", callsLabel: "calls", publishLabel: "publish", webhookLabel: "webhook"} {
		same("the "+name+" key", hex.EncodeToString(mac([]byte(app.Secret), label)), derived[name].(string))
	}
	for _, k := range v["keys"].([]any) {
		key := k.(map[string]any)
		same("the key of "+key["label"].(string), app.Entry(key["label"].(string)), key["entry"].(string))
	}
	same("the profile hash key", hex.EncodeToString(app.Key("profile-hash")), v["profile_hash_key"].(string))

	call := v["call_key"].(map[string]any)
	same("a call key", app.CallKey(call["id"].(string), int64(call["caller"].(float64)), int64(call["callee"].(float64))), call["key"].(string))
	for _, m := range v["media"].([]any) {
		media := m.(map[string]any)
		same("a media key", app.MediaKey(media["what"].(string)), media["key"].(string))
	}
	for _, p := range v["proofs"].([]any) {
		proof := p.(map[string]any)
		same("a proof", app.Proof(proof["what"].(string)), proof["proof"].(string))
	}

	emit := v["emit"].(map[string]any)
	same("a request signature", app.Signature(emit["timestamp"].(string), emit["method"].(string), emit["path"].(string), []byte(emit["body"].(string))), emit["signature"].(string))

	jwt := v["jwt"].(map[string]any)
	input := jwt["input"].(string)
	same("a room token", b64.EncodeToString(mac(mac([]byte(app.Secret), tokenLabel), input)), jwt["signature"].(string))

	for _, s := range v["sealed"].([]any) {
		sealed := s.(map[string]any)
		nonce, _ := hex.DecodeString(sealed["nonce_hex"].(string))
		got, err := app.Seal(sealed["plain"].(string), sealed["label"].(string), nonce)
		if err != nil {
			t.Fatal(err)
		}
		same("a sealed value", got, sealed["sealed"].(string))
		plain, ok := app.Open(sealed["sealed"].(string))
		if !ok || plain != sealed["plain"].(string) {
			t.Errorf("opening %s: got %q", sealed["sealed"], plain)
		}
	}
}

// A webhook signed as the test values sign it is taken at its time, and refused once changed or stale.
func TestAWebhook(t *testing.T) {
	v := vectors(t, "vectors.json")
	app := App{Site: v["site"].(string), Secret: v["secret"].(string), LocalKey: v["local_key"].(string)}
	hook := v["webhook"].(map[string]any)
	stamp := hook["timestamp"].(string)
	body := []byte(hook["body"].(string))

	// Signed now, as the realtime server would: the same key and the same message.
	now := strconv.FormatInt(time.Now().Unix(), 10)
	key := mac([]byte(app.Secret), webhookLabel)
	header := http.Header{}
	header.Set("X-WordPlus-Site", app.Site)
	header.Set("X-WordPlus-Timestamp", now)
	header.Set("X-WordPlus-Signature", hex.EncodeToString(mac(key, now+"\nPOST\n"+hook["path"].(string)+"\n"+sha256Hex(body))))
	events, err := app.Webhook(header, hook["path"].(string), body)
	if err != nil || len(events) != 1 || events[0]["type"] != "room.occupied" {
		t.Fatalf("a webhook signed now: %v %v", events, err)
	}

	// The signature the test value carries, as computed at its time.
	if got := hex.EncodeToString(mac(key, stamp+"\nPOST\n"+hook["path"].(string)+"\n"+sha256Hex(body))); got != hook["signature"].(string) {
		t.Errorf("the webhook signature: got %s", got)
	}
	header.Set("X-WordPlus-Timestamp", stamp)
	if _, err := app.Webhook(header, hook["path"].(string), body); err == nil || err.Error() != "stale_signature" {
		t.Errorf("a stale webhook: %v", err)
	}
	header.Set("X-WordPlus-Timestamp", now)
	if _, err := app.Webhook(header, hook["path"].(string), append(body, ' ')); err == nil || err.Error() != "bad_signature" {
		t.Errorf("a changed webhook: %v", err)
	}
}

// The stream grants: the claims in the order of the protocol, with the audience in its place.
func TestTheStreamGrants(t *testing.T) {
	v := vectors(t, "stream-grants.json")
	app := App{Secret: v["secret"].(string)}
	order := []string{"iss", "aud", "str", "role", "sub", "name", "avatar", "chat", "mod", "src", "q", "stage", "offline", "links", "fresh", "people", "reactions", "org", "iat", "exp"}
	for _, c := range v["cases"].([]any) {
		test := c.(map[string]any)
		claims := test["claims"].(map[string]any)
		claims["aud"] = "easy-stream"
		parts := []string{}
		for _, name := range order {
			if value, ok := claims[name]; ok {
				var encoded bytes.Buffer
				encoder := json.NewEncoder(&encoded)
				encoder.SetEscapeHTML(false)
				_ = encoder.Encode(value)
				parts = append(parts, `"`+name+`":`+strings.TrimSpace(encoded.String()))
			}
		}
		if got := app.StreamGrantOf([]byte("{" + strings.Join(parts, ",") + "}")); got != test["token"].(string) {
			t.Errorf("%s: got %s", test["name"], got)
		}
	}

	// A grant StreamGrant signs: `stage` between `q` and `offline`, as the other languages put it.
	no := false
	token := app.StreamGrant(Stream{Name: "show:1", Role: "viewer", Quality: "720p", Stage: &no, Offline: "closed"})["token"].(string)
	payload, err := b64.DecodeString(strings.Split(token, ".")[1])
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(payload, []byte(`"q":"720p","stage":false,"offline":"closed"`)) {
		t.Errorf("the stage claim: %s", payload)
	}
}

// Users whose ids are text: the label each takes, the user calls take, and what keys and proofs are made of, as the
// Node, PHP and Python packages make them.
func TestACallToken(t *testing.T) {
	v := vectors(t, "vectors.json")
	app := App{Site: v["site"].(string), Secret: v["secret"].(string), LocalKey: v["local_key"].(string)}

	raw, err := b64.DecodeString(app.CallToken("42", "34", "audio", map[string]any{"name": "Ann"}))
	if err != nil {
		t.Fatal(err)
	}
	var made map[string]any
	if err := json.Unmarshal(raw, &made); err != nil {
		t.Fatal(err)
	}
	call, id := made["call"].(string), made["id"].(string)
	if call != "call:"+id || made["type"] != "audio" || made["to"] != float64(34) || made["token"] == "" || made["member"] == "" || made["media_key"] == "" {
		t.Fatalf("a token that holds %v", made)
	}

	// The proof the ring brings, for the one rung alone.
	ring := app.Proof("rung|" + call + "|" + id + "|42|34|34")
	if !app.ProvenSide(map[string]any{"ring": ring}, call, id, "callee", 34, 42) {
		t.Fatal("the person rung holds the proof")
	}
	if app.ProvenSide(map[string]any{"ring": ring}, call, id, "callee", 56, 42) || app.ProvenSide(map[string]any{"ring": ring}, call, id, "caller", 42, 34) {
		t.Fatal("nobody else does")
	}
	if app.ProvenSide(map[string]any{"ring": strings.Repeat("A", 43)}, call, id, "callee", 34, 42) || app.ProvenSide(map[string]any{}, call, id, "callee", 34, 42) {
		t.Fatal("a made-up proof is none")
	}

	// Its proof of being in the call, which renews a token that ran out, for its holder alone.
	if !app.ProvenSide(map[string]any{"member": made["member"]}, call, id, "caller", 42, 34) {
		t.Fatal("the caller holds the proof of being in it")
	}
	if app.ProvenSide(map[string]any{"member": made["member"]}, call, id, "caller", 42, 56) {
		t.Fatal("for that call alone")
	}
}

// A call with a name of the app's own, as callToken( me, to, { name } ) makes it in Node, PHP and Python: the chat it is in.
func TestANamedCallToken(t *testing.T) {
	v := vectors(t, "vectors.json")
	app := App{Site: v["site"].(string), Secret: v["secret"].(string), LocalKey: v["local_key"].(string)}

	raw, err := b64.DecodeString(app.NamedCallToken("42", "34", "chat:34:42", "video", nil))
	if err != nil {
		t.Fatal(err)
	}
	var made map[string]any
	if err := json.Unmarshal(raw, &made); err != nil {
		t.Fatal(err)
	}
	id, _ := made["id"].(string)
	if made["call"] != "chat:34:42" || id == "" || made["type"] != "video" || made["to"] != float64(34) {
		t.Fatalf("a token that holds %v", made)
	}
	// The name in the caller's call token, which the realtime server reads, and in its keys and proofs.
	payload, err := b64.DecodeString(strings.Split(made["token"].(string), ".")[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil || claims["call"] != "chat:34:42" || claims["id"] != id {
		t.Fatalf("the call token's claims %s", payload)
	}
	if made["media_key"] != app.MediaKey("call|chat:34:42|"+id+"|42|34") || made["key"] != app.CallKey(id, int64(42), int64(34)) {
		t.Fatalf("the keys of %v", made)
	}
	ring := app.Proof("rung|chat:34:42|" + id + "|42|34|34")
	if !app.ProvenSide(map[string]any{"ring": ring}, "chat:34:42", id, "callee", 34, 42) || !app.ProvenSide(map[string]any{"member": made["member"]}, "chat:34:42", id, "caller", 42, 34) {
		t.Fatal("the person rung and the caller hold the proofs of the call by its name")
	}
	if app.ProvenSide(map[string]any{"member": made["member"]}, "call:"+id, id, "caller", 42, 34) {
		t.Fatal("for that name alone")
	}

	// No name is call: and the id, as CallToken has it.
	raw, _ = b64.DecodeString(app.NamedCallToken("42", "34", "", "audio", nil))
	var unnamed map[string]any
	if err := json.Unmarshal(raw, &unnamed); err != nil || unnamed["call"] != "call:"+fmt.Sprint(unnamed["id"]) {
		t.Fatalf("a token with no name that holds %v", unnamed)
	}
}

func TestTheOtherTokens(t *testing.T) {
	v := vectors(t, "vectors.json")
	app := App{Site: v["site"].(string), Secret: v["secret"].(string), LocalKey: v["local_key"].(string)}
	opened := func(token string) map[string]any {
		raw, err := b64.DecodeString(token)
		if err != nil {
			t.Fatal(err)
		}
		var made map[string]any
		if err := json.Unmarshal(raw, &made); err != nil {
			t.Fatal(err)
		}
		return made
	}

	// Into a call: for someone in it, and the person rung answers with the proof.
	first := opened(app.CallToken("42", "34", "audio", nil))
	ref := b64.EncodeToString(jsonOf(map[string]any{"id": first["id"], "name": first["call"], "type": first["type"], "pair": first["pair"], "member": first["member"]}))
	token, err := app.AddToCallToken("42", "56", ref, nil)
	if err != nil {
		t.Fatal(err)
	}
	made := opened(token)
	if made["group"] != first["id"] || made["to"] != float64(56) || made["type"] != "audio" || made["ring"] == "" {
		t.Fatalf("a ring that holds %v", made)
	}
	if _, err := app.AddToCallToken("77", "56", ref, nil); err == nil {
		t.Fatal("someone not in the call adds nobody")
	}
	if _, err := app.AddToCallToken("42", "56", "nothing", nil); err == nil {
		t.Fatal("what is no ref adds nobody")
	}
	body := map[string]any{"group": first["id"], "pair": first["pair"], "ring": made["ring"]}
	call, id := first["call"].(string), made["id"].(string)
	answer, ok := app.ProvenRing(body, call, id, "audio", 56, 42, nil)
	if !ok || answer["media_key"] != first["media_key"] {
		t.Fatalf("the person rung answers, with the call's key: %v %v", ok, answer)
	}
	if _, ok := app.ProvenRing(body, call, id, "audio", 77, 42, nil); ok {
		t.Fatal("nobody else does")
	}

	// A group call: what they may do, and a host's proof.
	host := opened(app.GroupCallToken("42", "class:7", GroupPlace{Admin: true, Encrypt: true}))
	if host["room"] != "class:7" || host["media_key"] == nil || host["host"] == nil || host["recorder"] == nil {
		t.Fatalf("a host's token that holds %v", host)
	}
	if !app.HoldsHost("class:7", 42, host["host"]) || app.HoldsHost("class:7", 34, host["host"]) || app.HoldsHost("class:8", 42, host["host"]) || app.HoldsHost("class:7", 42, nil) {
		t.Fatal("the proof holds for its host and its call alone")
	}
	if !app.HoldsRecorder("class:7", 42, host["recorder"]) || app.HoldsRecorder("class:7", 42, host["host"]) {
		t.Fatal("the recorder's proof is its own")
	}
	listener := opened(app.GroupCallToken("34", "class:7", GroupPlace{Listener: true, Kind: "audio"}))
	if listener["host"] != nil || listener["media_key"] != nil || listener["type"] != "audio" {
		t.Fatalf("a listener's token that holds %v", listener)
	}

	// A stream.
	stream := opened(app.StreamToken(Stream{Name: "show:7", Role: "host", User: "42"}))
	if stream["name"] != "show:7" || stream["token"] == "" {
		t.Fatalf("a stream's token that holds %v", stream)
	}
}

func TestUsersWhoseIdsAreText(t *testing.T) {
	labels := map[string]string{
		"42": "42", "-7": "-7", "user_2abc": "user_2abc", "0b6f1c9e-8f5d-4c38": "0b6f1c9e-8f5d-4c38", "ann@shop.example": "ann@shop.example",
		"auth0|5f7c": "auth0=7C5f7c", "a=b": "a=3Db", "a=7Cb": "a=3D7Cb", "ann+news@shop.example": "ann=2Bnews@shop.example", "Zoë": "Zo=C3=AB",
		"ann smith": "", strings.Repeat("a", 65): "", "": "",
	}
	for id, want := range labels {
		if got := LabelUser(id); got != want {
			t.Errorf("LabelUser(%q) = %q, want %q", id, got, want)
		}
	}

	for _, test := range []struct {
		in   any
		want any
		ok   bool
	}{
		{"42", int64(42), true}, {float64(42), int64(42), true}, {"auth0|5f7c", "auth0|5f7c", true}, {"007", "007", true},
		{"0", nil, false}, {float64(0), int64(0), false}, {"ann smith", nil, false}, {nil, nil, false},
	} {
		got, ok := CallUser(test.in)
		if ok != test.ok || (ok && got != test.want) {
			t.Errorf("CallUser(%v) = %v, %v", test.in, got, ok)
		}
	}

	if got := IDPart("auth0|5f%7c"); got != "auth0%7C5f%257c" {
		t.Errorf("IDPart = %q", got)
	}
	if got := IDPart(int64(42)); got != "42" {
		t.Errorf("IDPart(42) = %q", got)
	}
}
