use axum::{
    extract::{Query, State},
    http::{header, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use reqwest::Client;
use rust_embed::RustEmbed;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::async_runtime::JoinHandle;
use tokio::{net::TcpListener, sync::Mutex};
use url::Url;

const META_TTL: Duration = Duration::from_secs(10 * 60);
const CONTENT_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const CONTENT_BUDGET: usize = 256 * 1024 * 1024;
const MAX_CONTENT_ENTRY: usize = 40 * 1024 * 1024;

#[derive(RustEmbed)]
#[folder = "../public/"]
struct Assets;

#[derive(Clone)]
struct AppState {
    client: Client,
    meta_cache: Arc<Mutex<BodyCache>>,
    content_cache: Arc<Mutex<BodyCache>>,
}

#[derive(Default)]
struct BodyCache {
    entries: HashMap<String, CacheEntry>,
    bytes: usize,
}

struct CacheEntry {
    inserted_at: Instant,
    expires_at: Instant,
    content_type: String,
    body: Vec<u8>,
}

impl BodyCache {
    fn get(&mut self, key: &str) -> Option<(Vec<u8>, String)> {
        let entry = self.entries.get(key)?;
        if entry.expires_at <= Instant::now() {
            self.remove(key);
            return None;
        }
        Some((entry.body.clone(), entry.content_type.clone()))
    }

    fn insert(&mut self, key: String, body: Vec<u8>, content_type: String, ttl: Duration) {
        if body.len() > MAX_CONTENT_ENTRY {
            return;
        }
        self.remove(&key);
        while self.bytes + body.len() > CONTENT_BUDGET && !self.entries.is_empty() {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.inserted_at)
                .map(|(key, _)| key.clone());
            if let Some(oldest) = oldest {
                self.remove(&oldest);
            }
        }
        self.bytes += body.len();
        self.entries.insert(
            key,
            CacheEntry {
                inserted_at: Instant::now(),
                expires_at: Instant::now() + ttl,
                content_type,
                body,
            },
        );
    }

    fn remove(&mut self, key: &str) {
        if let Some(entry) = self.entries.remove(key) {
            self.bytes = self.bytes.saturating_sub(entry.body.len());
        }
    }
}

#[derive(serde::Deserialize)]
struct ContentQuery {
    url: Option<String>,
}

fn response<R: IntoResponse>(status: StatusCode, content_type: &str, body: R) -> Response {
    let mut response = (status, body).into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(content_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

async fn upstream(client: &Client, target: &str, timeout: Duration) -> Result<reqwest::Response, reqwest::Error> {
    let request = || {
        client
            .get(target)
            .timeout(timeout)
            .header("User-Agent", "Artemis/1.0 (personal reader)")
            .header("Connection", "close")
            .send()
    };
    match request().await {
        Ok(response) => Ok(response),
        Err(_) => request().await,
    }
}

async fn health(State(state): State<AppState>) -> Response {
    let cache_bytes = state.content_cache.lock().await.bytes;
    response(
        StatusCode::OK,
        "application/json; charset=utf-8",
        format!("{{\"ok\":true,\"cacheMB\":{}}}", cache_bytes / 1_048_576),
    )
}

async fn meta(State(state): State<AppState>, uri: Uri) -> Response {
    let suffix = uri
        .path()
        .strip_prefix("/api/gutendex")
        .filter(|path| !path.is_empty() && *path != "/")
        .unwrap_or("/books");
    let query = uri.query().map(|value| format!("?{value}")).unwrap_or_default();
    let target = format!("https://gutendex.com{suffix}{query}");

    if let Some((body, content_type)) = state.meta_cache.lock().await.get(&target) {
        return response(StatusCode::OK, &content_type, body);
    }

    let upstream = match upstream(&state.client, &target, Duration::from_secs(30)).await {
        Ok(upstream) => upstream,
        Err(error) => {
            return response(
                StatusCode::BAD_GATEWAY,
                "application/json; charset=utf-8",
                format!("{{\"detail\":\"gutendex unreachable: {error}\"}}"),
            )
        }
    };
    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json; charset=utf-8")
        .to_string();
    let body = match upstream.bytes().await {
        Ok(body) => body.to_vec(),
        Err(error) => return response(StatusCode::BAD_GATEWAY, "text/plain; charset=utf-8", error.to_string()),
    };
    if status.is_success() {
        state
            .meta_cache
            .lock()
            .await
            .insert(target, body.clone(), content_type.clone(), META_TTL);
    }
    response(status, &content_type, body)
}

async fn content(State(state): State<AppState>, Query(params): Query<ContentQuery>) -> Response {
    let Some(raw_url) = params.url else {
        return response(StatusCode::BAD_REQUEST, "text/plain; charset=utf-8", "missing url");
    };
    let target = match Url::parse(&raw_url) {
        Ok(target) => target,
        Err(_) => return response(StatusCode::BAD_REQUEST, "text/plain; charset=utf-8", "invalid url"),
    };
    let allowed = matches!(target.host_str(), Some("www.gutenberg.org") | Some("gutenberg.org"));
    if target.scheme() != "https" || !allowed {
        return response(StatusCode::FORBIDDEN, "text/plain; charset=utf-8", "host not allowed");
    }
    let target = target.to_string();

    if let Some((body, content_type)) = state.content_cache.lock().await.get(&target) {
        return response(StatusCode::OK, &content_type, body);
    }

    let upstream = match upstream(&state.client, &target, Duration::from_secs(120)).await {
        Ok(upstream) => upstream,
        Err(error) => return response(StatusCode::BAD_GATEWAY, "text/plain; charset=utf-8", error.to_string()),
    };
    if !upstream.status().is_success() {
        let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        return response(status, "text/plain; charset=utf-8", format!("upstream {status}"));
    }
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let body = match upstream.bytes().await {
        Ok(body) => body.to_vec(),
        Err(error) => return response(StatusCode::BAD_GATEWAY, "text/plain; charset=utf-8", error.to_string()),
    };
    state
        .content_cache
        .lock()
        .await
        .insert(target, body.clone(), content_type.clone(), CONTENT_TTL);
    response(StatusCode::OK, &content_type, body)
}

async fn static_file(uri: Uri) -> Response {
    let requested = uri.path().trim_start_matches('/');
    let key = if requested.is_empty() || Assets::get(requested).is_none() {
        "index.html"
    } else {
        requested
    };
    let Some(file) = Assets::get(key) else {
        return response(StatusCode::NOT_FOUND, "text/plain; charset=utf-8", "not found");
    };
    let content_type = mime_guess::from_path(key).first_or_octet_stream().to_string();
    response(StatusCode::OK, &content_type, file.data.into_owned())
}

pub async fn start() -> Result<(SocketAddr, JoinHandle<()>), Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::builder().build()?;
    let state = AppState {
        client,
        meta_cache: Arc::new(Mutex::new(BodyCache::default())),
        content_cache: Arc::new(Mutex::new(BodyCache::default())),
    };
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/gutendex", get(meta))
        .route("/api/gutendex/{*path}", get(meta))
        .route("/api/content", get(content))
        .fallback(static_file)
        .with_state(state);
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let address = listener.local_addr()?;
    let task = tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, app).await {
            eprintln!("Artemis local server stopped: {error}");
        }
    });
    Ok((address, task))
}
