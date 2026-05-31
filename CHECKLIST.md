# CHECKLIST — Projekt Kubernetes: Product Shop

> Aplikacja wieloserwisowa uruchamiana w Kubernetes z pipeline CI/CD w GitHub Actions.  
> Sprawdzenie zajmuje ok. 20 minut. Wszystkie komendy działają na **kind**, **minikube** i **k3d**.

---

## Architektura

```
                    ┌─────────────────────────────────────────────┐
                    │            Namespace: shop                   │
                    │                                             │
Internet ──► Ingress──► frontend (Nginx, 1 replika)              │
                    │      │  proxy /api/ ──► backend (2 repliki) │
                    │      │                     │    │           │
                    │      │              postgres    redis        │
                    │      │           (StatefulSet) (Deployment)  │
                    │      │                               ▲       │
                    │      │                          worker       │
                    │      │                       (1 replika)     │
                    └─────────────────────────────────────────────┘
```

**Serwisy:**
| Serwis | Technologia | Repliki | Port |
|--------|-------------|---------|------|
| frontend | Nginx 1.25-alpine | 1 (dev) / 1 (prod) | 8080 |
| backend | Node.js 20 + Express | 2 (dev: 1, prod: 3) | 3000 |
| worker | Node.js 20 | 1 | — |
| postgres | PostgreSQL 15-alpine | 1 (StatefulSet) | 5432 |
| redis | Redis 7-alpine | 1 | 6379 |

---

## Zasoby Kubernetes

```
k8s/
├── base/
│   ├── namespace.yaml          # Namespace: shop
│   ├── configmap.yaml          # ConfigMap: shop-config
│   ├── secret.yaml             # Secret: shop-secret (base64)
│   ├── migration-configmap.yaml# ConfigMap: db-migration (SQL)
│   ├── postgres/
│   │   ├── statefulset.yaml    # StatefulSet: postgres (PVC 1Gi RWO)
│   │   └── service.yaml        # Service: postgres (ClusterIP)
│   ├── redis/
│   │   ├── deployment.yaml     # Deployment: redis
│   │   └── service.yaml        # Service: redis (ClusterIP)
│   ├── backend/
│   │   ├── deployment.yaml     # Deployment: backend (2 repliki, rolling update)
│   │   └── service.yaml        # Service: backend (ClusterIP)
│   ├── frontend/
│   │   ├── deployment.yaml     # Deployment: frontend
│   │   └── service.yaml        # Service: frontend (ClusterIP)
│   ├── worker/
│   │   └── deployment.yaml     # Deployment: worker
│   ├── ingress.yaml            # Ingress: shop-ingress
│   ├── migration-job.yaml      # Job: db-migrate (initContainer + psql)
│   ├── networkpolicy.yaml      # NetworkPolicy x4 (bonus)
│   └── pdb.yaml                # PodDisruptionBudget: backend (bonus)
└── overlays/
    ├── dev/                    # Kustomize overlay: dev (1 replika backendu)
    └── prod/                   # Kustomize overlay: prod (3 repliki backendu)
```

---

## Uruchomienie lokalne — kind

### Krok 1: Utwórz klaster

```bash
kind create cluster --name shop

# Weryfikacja
kubectl config current-context
# kind-shop
```

### Krok 2: Zainstaluj Ingress NGINX controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Czekaj aż kontroler będzie gotowy
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### Krok 3: Zbuduj i załaduj obrazy do kind

> W środowisku bez CI/CD — zbuduj lokalne obrazy i załaduj do klastra kind

```bash
# Zbuduj obrazy lokalnie
docker build -t ghcr.io/olaborucka/shop/backend:latest ./backend
docker build -t ghcr.io/olaborucka/shop/frontend:latest ./frontend
docker build -t ghcr.io/olaborucka/shop/worker:latest ./worker

# Załaduj obrazy do klastra kind (bez push do rejestru)
kind load docker-image ghcr.io/olaborucka/shop/backend:latest --name shop
kind load docker-image ghcr.io/olaborucka/shop/frontend:latest --name shop
kind load docker-image ghcr.io/olaborucka/shop/worker:latest --name shop
```

### Krok 4: Zastosuj manifesty (overlay dev)

```bash
kubectl apply -k k8s/overlays/dev

# Sprawdź zasoby
kubectl get all -n shop
```

### Krok 5: Poczekaj na gotowość podów

```bash
kubectl wait --for=condition=ready pod \
  -l app=postgres -n shop --timeout=120s

kubectl wait --for=condition=ready pod \
  -l app=backend -n shop --timeout=120s

kubectl wait --for=condition=ready pod \
  -l app=frontend -n shop --timeout=120s
```

### Krok 6: Port-forward i test

```bash
# Otwórz aplikację webową
kubectl port-forward svc/frontend 8080:8080 -n shop &

# Otwórz w przeglądarce: http://localhost:8080
```

---

## Komendy kubectl — weryfikacja zasobów

```bash
# Wszystkie zasoby w namespace shop
kubectl get all -n shop

# Przykładowy wynik:
# NAME                            READY   STATUS    RESTARTS   AGE
# pod/backend-7d4f9b8c6-abc12     1/1     Running   0          5m
# pod/backend-7d4f9b8c6-def34     1/1     Running   0          5m
# pod/frontend-6c8b5d9f7-ghi56    1/1     Running   0          5m
# pod/postgres-0                  1/1     Running   0          5m
# pod/redis-5f6c7d8e9-jkl78       1/1     Running   0          5m
# pod/worker-4e5f6a7b8-mno90      1/1     Running   0          5m
#
# NAME               TYPE        CLUSTER-IP      PORT(S)
# service/backend    ClusterIP   10.96.1.10      3000/TCP
# service/frontend   ClusterIP   10.96.1.11      8080/TCP
# service/postgres   ClusterIP   10.96.1.12      5432/TCP
# service/redis      ClusterIP   10.96.1.13      6379/TCP
#
# NAME                       READY   UP-TO-DATE   AVAILABLE
# deployment.apps/backend    2/2     2            2
# deployment.apps/frontend   1/1     1            1
# deployment.apps/redis      1/1     1            1
# deployment.apps/worker     1/1     1            1
#
# NAME                                  READY   AGE
# statefulset.apps/postgres             1/1     5m

# Deploymenty z replikami
kubectl get deploy -n shop

# Rolling update status
kubectl rollout status deployment/backend -n shop
# deployment "backend" successfully rolled out

# StatefulSet bazy danych
kubectl get statefulset -n shop
kubectl describe statefulset postgres -n shop

# PersistentVolumeClaim (trwałość danych)
kubectl get pvc -n shop
# NAME                               STATUS   VOLUME   CAPACITY   ACCESS MODES
# postgres-data-postgres-0           Bound    ...      1Gi        RWO

# Ingress
kubectl get ingress -n shop

# ConfigMap i Secret
kubectl get configmap shop-config -n shop -o yaml
kubectl get secret shop-secret -n shop

# NetworkPolicy (bonus)
kubectl get networkpolicy -n shop

# PodDisruptionBudget (bonus)
kubectl get pdb -n shop
# NAME          MIN AVAILABLE   MAX UNAVAILABLE   ALLOWED DISRUPTIONS
# backend-pdb   1               N/A               1

# Proby i zasoby — opis poda
kubectl describe pod -l app=backend -n shop | grep -A5 "Liveness\|Readiness\|Requests\|Limits"
```

---

## Przykładowe komendy curl z wynikami

> Przed testem: `kubectl port-forward svc/frontend 8080:8080 -n shop`

### GET /api/health — liveness check

```bash
curl http://localhost:8080/api/health
```
```json
{"status":"ok","service":"backend-api","version":"1.0.0"}
```

### GET /api/ready — readiness check (DB + Redis)

```bash
curl http://localhost:8080/api/ready
```
```json
{"status":"ready"}
```

### GET /api/products — lista produktów (z cache Redis)

```bash
curl http://localhost:8080/api/products
```
```json
[
  {"id":1,"name":"Kawa Arabica 250g","price":29.99,"description":"Kawa ziarnista z Etiopii","in_stock":true,"created_at":"2026-01-15 10:00:00"},
  {"id":2,"name":"Herbata Earl Grey 100g","price":15.5,"description":"Czarna herbata z bergamotką","in_stock":true,"created_at":"2026-01-15 10:00:00"}
]
```

### POST /api/products — dodaj nowy produkt

```bash
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Czekolada Mleczna","price":7.99,"description":"Tabliczka 100g","in_stock":true}'
```
```json
{"id":6,"name":"Czekolada Mleczna","price":7.99,"description":"Tabliczka 100g","in_stock":true,"created_at":"2026-01-15 12:34:56"}
```

### GET /api/products/1 — jeden produkt

```bash
curl http://localhost:8080/api/products/1
```
```json
{"id":1,"name":"Kawa Arabica 250g","price":29.99,"description":"Kawa ziarnista z Etiopii","in_stock":true,"created_at":"2026-01-15 10:00:00"}
```

### GET /api/metrics — metryki Prometheus (obserwow alność, bonus)

```bash
curl -s http://localhost:8080/api/metrics | head -20
```
```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/products",status_code="200"} 3
http_requests_total{method="POST",route="/products",status_code="201"} 1
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.123456
```

### Weryfikacja Nginx cache (X-Cache-Status)

```bash
# Pierwsze żądanie — MISS (pobrane z backendu)
curl -s -I http://localhost:8080/api/products | grep X-Cache-Status
# X-Cache-Status: MISS

# Drugie żądanie — HIT (z cache Nginx)
curl -s -I http://localhost:8080/api/products | grep X-Cache-Status
# X-Cache-Status: HIT
```

---

## Test trwałości danych — restart poda PostgreSQL

> Weryfikuje wymaganie: "Dane pozostają dostępne po restarcie poda bazy"

```bash
# Krok 1: dodaj produkt testowy
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"PRODUKT TESTOWY TRWALOSCI","price":1.00,"in_stock":true}'

# Krok 2: sprawdź że produkt jest widoczny
curl http://localhost:8080/api/products | grep "TESTOWY"

# Krok 3: usuń pod bazy danych (StatefulSet automatycznie go odtworzy)
kubectl delete pod postgres-0 -n shop

# Krok 4: czekaj aż pod się odtworzy
kubectl wait --for=condition=ready pod/postgres-0 -n shop --timeout=60s

# Krok 5: sprawdź czy dane są nadal dostępne
curl http://localhost:8080/api/products | grep "TESTOWY"
# {"id":6,"name":"PRODUKT TESTOWY TRWALOSCI",...}  ← dane przeżyły restart!
```

---

## Dowód działania workera (Redis stats)

```bash
# Sprawdź logi workera — powinny pokazywać co 60s aktualizację statystyk
kubectl logs -l app=worker -n shop --tail=20
# [2026-01-15T10:05:00.000Z] Statystyki zaktualizowane: {"total_products":5,"in_stock":4,...}

# Sprawdź klucz Redis bezpośrednio przez exec w podzie redis
kubectl exec -it deploy/redis -n shop -- redis-cli GET stats:products
# {"total_products":5,"in_stock":4,"out_of_stock":1,"avg_price":17.17,...,"worker_ts":1736935500}

# Alternatywnie przez pod workera (ma dostęp do Redis przez NetworkPolicy)
kubectl exec -it deploy/worker -n shop -- sh -c \
  'node -e "const r=require(\"redis\").createClient({socket:{host:\"redis\",port:6379}});r.connect().then(()=>r.get(\"stats:products\")).then(v=>{console.log(v);r.quit()})"'
```

---

## Rolling update — weryfikacja

```bash
# Symulacja aktualizacji obrazu (rolling update)
kubectl set image deployment/backend backend=ghcr.io/olaborucka/shop/backend:latest -n shop

# Obserwuj rolling update w czasie rzeczywistym
kubectl rollout status deployment/backend -n shop
# Waiting for deployment "backend" rollout to finish: 1 out of 2 new replicas have been updated...
# Waiting for deployment "backend" rollout to finish: 1 old replicas are pending termination...
# deployment "backend" successfully rolled out

# Cofnij rollout (rollback)
kubectl rollout undo deployment/backend -n shop
```

---

## GitHub Actions CI/CD

**Link do ostatniego udanego workflow:**  
`https://github.com/olaborucka/shop-kubernetes/actions`

> Zastąp `olaborucka/shop-kubernetes` nazwą swojego repozytorium GitHub.

### Konfiguracja wymagana przed pierwszym uruchomieniem

1. **Utwórz repozytorium na GitHub** i push kodu
2. **Dodaj Secret** do repozytorium:  
   `Settings → Secrets and variables → Actions → New repository secret`  
   - Nazwa: `KUBECONFIG_B64`  
   - Wartość: `cat ~/.kube/config | base64`
3. **Włącz GitHub Packages** (domyślnie aktywne dla każdego repo)
4. **Push na branch `main`** — workflow uruchomi się automatycznie

### Przebieg pipeline (2 joby)

```
push → main
  │
  ├── Job: build-and-push (matrix: backend, frontend, worker)
  │     ├── docker/setup-buildx-action     # BuildKit + multi-platform
  │     ├── docker/login-action            # ghcr.io via GITHUB_TOKEN
  │     ├── build --target test            # etap testowy z Dockerfile
  │     └── build-push --platform amd64,arm64 → ghcr.io  # obraz produkcyjny
  │
  └── Job: deploy (needs: build-and-push, tylko main)
        ├── kustomize edit set image       # zaktualizuj tagi SHA
        ├── kubectl apply -k overlays/prod # zastosuj manifesty
        ├── kubectl rollout status backend # weryfikacja rollout
        ├── kubectl rollout status frontend
        └── kubectl rollout status worker
```

---

## Sprzątanie po sprawdzeniu

```bash
# Usuń wszystkie zasoby z namespace shop
kubectl delete -k k8s/overlays/dev

# Usuń klaster kind
kind delete cluster --name shop
```

---

## Wymagania spełnione

| Wymaganie | Zasób | Status |
|-----------|-------|--------|
| Namespace | `namespace.yaml` | ✅ |
| Deployment (frontend, backend, worker) | `*/deployment.yaml` | ✅ |
| Backend ≥2 repliki + rolling update | `backend/deployment.yaml` | ✅ |
| StatefulSet (baza danych) | `postgres/statefulset.yaml` | ✅ |
| PersistentVolumeClaim | `volumeClaimTemplates` w StatefulSet | ✅ |
| Service (ClusterIP) | `*/service.yaml` | ✅ |
| Ingress | `ingress.yaml` | ✅ |
| ConfigMap | `configmap.yaml` | ✅ |
| Secret | `secret.yaml` | ✅ |
| readinessProbe + livenessProbe | wszystkie Deploymenty | ✅ |
| resources.requests + limits | wszystkie kontenery | ✅ |
| securityContext (non-root) | wszystkie kontenery | ✅ |
| initContainer | backend, worker, migration-job | ✅ |
| CI/CD GitHub Actions | `.github/workflows/ci-cd.yaml` | ✅ |
| NetworkPolicy | `networkpolicy.yaml` | ✅ bonus |
| PodDisruptionBudget | `pdb.yaml` | ✅ bonus |
| Kustomize (dev + prod) | `k8s/overlays/` | ✅ bonus |
| Obserwowalność `/metrics` | `server.js` + Prometheus annotations | ✅ bonus |
