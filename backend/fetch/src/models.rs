use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AfadEvent {
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
