use fetch::fetch_recent_events;
use serde::Deserialize;

type Error = Box<dyn std::error::Error>;

#[derive(Debug, Deserialize)]
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

#[derive(Debug, serde::Serialize)]
struct RiskRequest {
    events: Vec<EarthquakeEvent>,
}

#[derive(Debug, Deserialize)]
struct RiskResponse {
    analysis: String,
}

async fn get_ai_risk_assessment(events: &[fetch::models::AfadEvent]) -> Result<String, Error> {
    // Convert fetch::models::AfadEvent to EarthquakeEvent
    // In a real app we might unify these types, but here we'll map a few over
    let mut mapped_events = Vec::new();
    for e in events.iter().take(5) { // Send top 5 to AI
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
    let res = client
        .post("http://127.0.0.1:8000/predict/risk")
        .json(&RiskRequest { events: mapped_events })
        .send()
        .await?;

    if res.status().is_success() {
        let risk_res: RiskResponse = res.json().await?;
        Ok(risk_res.analysis)
    } else {
        Err(format!("AI Server returned error: {}", res.status()).into())
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    println!("Fetching events from fetch_recent_events...");
    let events = fetch_recent_events(3.0, 24).await?;
    println!("Fetched {} events.", events.len());
    
    if !events.is_empty() {
        println!("Sending top events to AI for risk assessment...");
        match get_ai_risk_assessment(&events).await {
            Ok(analysis) => {
                println!("\n=== AI RISK ASSESSMENT ===\n{}\n=========================\n", analysis);
            }
            Err(e) => {
                println!("Failed to get AI assessment: {}", e);
                println!("(Ensure the Python AI model server is running on port 8000)");
            }
        }
    }
    
    Ok(())
}
