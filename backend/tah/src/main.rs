use axum::{Json, Router, extract::Query, routing::get};
use fetch::fetch_recent_events;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EarthquakeEvent {
    pub rms: String,
    #[serde(rename = "eventID")]
    pub event_id: String,
    pub location: String,
    pub latitude: String,
    pub longitude: String,
    pub depth: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub magnitude: String,
    pub country: Option<String>,
    pub province: Option<String>,
    pub district: Option<String>,
    pub neighborhood: Option<String>,
    pub date: String,
    pub is_event_update: bool,
    pub last_update_date: Option<String>,
}

#[derive(Debug, Serialize)]
struct RiskRequest {
    events: Vec<EarthquakeEvent>,
}

#[derive(Debug, Deserialize)]
struct RiskResponse {
    analysis: String,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    events: Vec<EarthquakeEvent>,
    ai_analysis: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Coordinate {
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HazardEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub location: String,
    pub severity: f64,
    pub latitude: f64,
    pub longitude: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NavigationRequest {
    pub route_type: String,
    pub hazard: HazardEvent,
    pub origin: Coordinate,
    pub destination: Coordinate,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct NavigationResponse {
    pub text_response: String,
    pub suggested_waypoints: Option<Vec<Coordinate>>,
}

#[derive(Deserialize)]
struct Params {
    min_mag: Option<f64>,
}

async fn get_ai_risk_assessment(events: &[fetch::models::AfadEvent]) -> Result<String, Error> {
    let mut mapped_events = Vec::new();
    // Send top 5 most recent/significant events to AI for context
    for e in events.iter().take(5) {
        mapped_events.push(EarthquakeEvent {
            rms: e.rms.clone(),
            event_id: e.event_id.clone(),
            location: e.location.clone(),
            latitude: e.latitude.clone(),
            longitude: e.longitude.clone(),
            depth: e.depth.clone(),
            event_type: e.event_type.clone(),
            magnitude: e.magnitude.clone(),
            country: e.country.clone(),
            province: e.province.clone(),
            district: e.district.clone(),
            neighborhood: e.neighborhood.clone(),
            date: e.date.clone(),
            is_event_update: e.is_event_update,
            last_update_date: e.last_update_date.clone(),
        });
    }

    let client = reqwest::Client::new();
    // This expects the Python llm-model server to be running
    let res = client
        .post("http://127.0.0.1:8000/predict/risk")
        .json(&RiskRequest {
            events: mapped_events,
        })
        .send()
        .await?;

    if res.status().is_success() {
        let risk_res: RiskResponse = res.json().await?;
        Ok(risk_res.analysis)
    } else {
        Err(format!("AI Server returned error: {}", res.status()).into())
    }
}

async fn get_navigation_route(
    Json(req): Json<NavigationRequest>,
) -> Result<Json<NavigationResponse>, String> {
    let client = reqwest::Client::new();

    let res = client
        .post("http://127.0.0.1:8000/predict/navigation")
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let nav_res: NavigationResponse = res.json().await.map_err(|e| e.to_string())?;
        Ok(Json(nav_res))
    } else {
        Err(format!("AI Server returned error: {}", res.status()))
    }
}

async fn get_earthquake_data(Query(params): Query<Params>) -> Json<ApiResponse> {
    let min_mag = params.min_mag.unwrap_or(3.0);

    match fetch_recent_events(min_mag, 24).await {
        Ok(events) => {
            let ai_analysis = get_ai_risk_assessment(&events).await.ok();

            let mapped_events = events
                .into_iter()
                .map(|e| EarthquakeEvent {
                    rms: e.rms,
                    event_id: e.event_id,
                    location: e.location,
                    latitude: e.latitude,
                    longitude: e.longitude,
                    depth: e.depth,
                    event_type: e.event_type,
                    magnitude: e.magnitude,
                    country: e.country,
                    province: e.province,
                    district: e.district,
                    neighborhood: e.neighborhood,
                    date: e.date,
                    is_event_update: e.is_event_update,
                    last_update_date: e.last_update_date,
                })
                .collect();

            Json(ApiResponse {
                events: mapped_events,
                ai_analysis,
            })
        }
        Err(_) => Json(ApiResponse {
            events: vec![],
            ai_analysis: Some("Failed to fetch earthquake data from AFAD.".to_string()),
        }),
    }
}

#[tokio::main]
async fn main() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/data", get(get_earthquake_data))
        .route("/api/navigation", axum::routing::post(get_navigation_route))
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    println!("Backend server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
