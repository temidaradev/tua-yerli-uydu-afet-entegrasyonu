pub mod models;

use crate::models::AfadEvent;

const AFAD_URL: &str = "https://deprem.afad.gov.tr/apiv2/event/filter";

pub async fn fetch_recent_events(
    min_magnitude: f64,
    hours_back: u32,
) -> Result<Vec<AfadEvent>, reqwest::Error> {
    let client = reqwest::Client::new();

    let now = chrono::Utc::now();
    let from = now - chrono::Duration::hours(hours_back as i64);

    let url = format!(
        "{}?start={}&end={}&minmag={}&orderby=timedesc",
        AFAD_URL,
        from.format("%Y-%m-%dT%H:%M:%S"),
        now.format("%Y-%m-%dT%H:%M:%S"),
        min_magnitude,
    );

    let response = client
        .get(&url)
        .header("User-Agent", "deprem-core/0.1")
        .send()
        .await?
        .json::<Vec<AfadEvent>>()
        .await?;

    Ok(response)
}
