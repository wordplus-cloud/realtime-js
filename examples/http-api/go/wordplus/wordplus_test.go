package wordplus

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
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
}

// Users whose ids are text: the label each takes, the user calls take, and what keys and proofs are made of, as the
// Node, PHP and Python packages make them.
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
