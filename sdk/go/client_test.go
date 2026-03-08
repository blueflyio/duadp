package duadp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResolveEndpointRelative(t *testing.T) {
	client := NewClient("https://node.example")
	client.manifest = &DuadpManifest{
		Endpoints: DuadpEndpoints{
			Skills:   "/api/v1/skills",
			Validate: "/api/v1/validate",
		},
	}

	skills, err := client.resolveEndpoint(context.Background(), "Skills")
	if err != nil {
		t.Fatalf("resolve skills endpoint: %v", err)
	}
	if skills != "https://node.example/api/v1/skills" {
		t.Fatalf("unexpected skills endpoint: %s", skills)
	}

	validate, err := client.resolveEndpoint(context.Background(), "Validate")
	if err != nil {
		t.Fatalf("resolve validate endpoint: %v", err)
	}
	if validate != "https://node.example/api/v1/validate" {
		t.Fatalf("unexpected validate endpoint: %s", validate)
	}
}

func TestResolveEndpointMissing(t *testing.T) {
	client := NewClient("https://node.example")
	client.manifest = &DuadpManifest{
		Endpoints: DuadpEndpoints{},
	}

	if _, err := client.resolveEndpoint(context.Background(), "Skills"); err == nil {
		t.Fatal("expected missing endpoint error, got nil")
	}
}

func TestListSkillsLoadsManifestAndQuery(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/.well-known/duadp.json", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"protocol_version": "v1",
			"node_name":        "test-node",
			"endpoints": map[string]any{
				"skills": "/api/v1/skills",
			},
		})
	})
	handler.HandleFunc("/api/v1/skills", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("search"); got != "review" {
			t.Fatalf("expected search=review, got %q", got)
		}
		if got := r.URL.Query().Get("page"); got != "2" {
			t.Fatalf("expected page=2, got %q", got)
		}
		if got := r.URL.Query().Get("limit"); got != "5" {
			t.Fatalf("expected limit=5, got %q", got)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{
				{
					"apiVersion": "ossa/v1",
					"kind":       "Skill",
					"metadata": map[string]any{
						"name": "code-review",
					},
				},
			},
			"meta": map[string]any{
				"total":     1,
				"page":      2,
				"limit":     5,
				"node_name": "test-node",
			},
		})
	})

	server := httptest.NewServer(handler)
	defer server.Close()

	client := NewClient(server.URL)
	resp, err := client.ListSkills(context.Background(), &ListParams{
		Search: "review",
		Page:   2,
		Limit:  5,
	})
	if err != nil {
		t.Fatalf("list skills: %v", err)
	}
	if resp.Meta.Total != 1 {
		t.Fatalf("expected total=1, got %d", resp.Meta.Total)
	}
	if len(resp.Data) != 1 || resp.Data[0].Metadata.Name != "code-review" {
		t.Fatalf("unexpected skills payload: %+v", resp.Data)
	}
}
