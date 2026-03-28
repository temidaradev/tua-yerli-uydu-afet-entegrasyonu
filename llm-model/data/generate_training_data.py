"""
Fetches real earthquake data from AFAD and generates synthetic training data for path routing and risk analysis.
"""

import sys
import json
import random
import math
from pathlib import Path
from datetime import datetime, timedelta
import requests

# Add parent dir to path to import config
sys.path.append(str(Path(__file__).resolve().parent.parent))

from config import (
    AFAD_API_URL, MIN_MAGNITUDE_TRAINING, HOURS_BACK_DEFAULT,
    TRAIN_DATA_PATH, EVAL_DATA_PATH, TRAIN_SPLIT_RATIO,
    NUM_PATH_EXAMPLES, NUM_RISK_EXAMPLES
)
from inference.prompts import (
    PATH_SYSTEM_PROMPT, format_path_prompt,
    RISK_SYSTEM_PROMPT, format_risk_prompt,
    format_chat_item
)

def fetch_afad_events(hours_back=HOURS_BACK_DEFAULT, min_mag=MIN_MAGNITUDE_TRAINING):
    """Fetch real earthquake events from AFAD."""
    print(f"Fetching AFAD events for the last {hours_back} hours (Mag > {min_mag})...")
    
    now = datetime.now()
    start_time = now - timedelta(hours=hours_back)
    
    url = f"{AFAD_API_URL}?start={start_time.strftime('%Y-%m-%dT%H:%M:%S')}&end={now.strftime('%Y-%m-%dT%H:%M:%S')}&minmag={min_mag}&orderby=timedesc"
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        events = response.json()
        print(f"Fetched {len(events)} valid events.")
        return events
    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

def generate_synthetic_path(epicenter, is_safe=True):
    """
    Generates a synthetic path. 
    If epicenter is severe, path routes AROUND it.
    This is highly simplified logic to generate TRUTH targets for the model to learn.
    """
    try:
        epi_lat = float(epicenter['latitude'])
        epi_lon = float(epicenter['longitude'])
        mag = float(epicenter['magnitude'])
    except:
        return None, None, None
        
    # Generate random origin 10-50km away
    angle1 = random.uniform(0, 2 * math.pi)
    dist1 = random.uniform(0.1, 0.5)  # roughly 10-50km in degrees
    start_lat = epi_lat + dist1 * math.sin(angle1)
    start_lon = epi_lon + dist1 * math.cos(angle1)
    
    # Generate destination on the opposite side
    angle2 = angle1 + math.pi + random.uniform(-0.5, 0.5)
    dist2 = random.uniform(0.1, 0.5)
    end_lat = epi_lat + dist2 * math.sin(angle2)
    end_lon = epi_lon + dist2 * math.cos(angle2)
    
    # Define the route
    danger_radius = mag * 0.05  # arbitrary math: bigger mag = bigger avoid radius
    
    waypoints = []
    waypoints.append({"lat": round(start_lat, 4), "lon": round(start_lon, 4)})
    
    # Generate 3 intermediate points routing around the danger zone
    for i in range(1, 4):
        progress = i / 4.0
        # Direct line point
        direct_lat = start_lat + (end_lat - start_lat) * progress
        direct_lon = start_lon + (end_lon - start_lon) * progress
        
        # Push outward from epicenter to route around
        push_angle = math.atan2(direct_lat - epi_lat, direct_lon - epi_lon)
        safe_lat = epi_lat + (danger_radius + 0.02) * math.sin(push_angle)
        safe_lon = epi_lon + (danger_radius + 0.02) * math.cos(push_angle)
        
        # Use safe point if direct is too close, else use direct
        dist_to_epi = math.sqrt((direct_lat - epi_lat)**2 + (direct_lon - epi_lon)**2)
        if dist_to_epi < danger_radius:
            waypoints.append({"lat": round(safe_lat, 4), "lon": round(safe_lon, 4)})
        else:
            waypoints.append({"lat": round(direct_lat, 4), "lon": round(direct_lon, 4)})
            
    waypoints.append({"lat": round(end_lat, 4), "lon": round(end_lon, 4)})
    
    # Formatting the target response
    response_text = f"Based on the magnitude {mag} earthquake at {epicenter.get('location', 'the epicenter')}, "
    response_text += f"a direct route is unsafe. I have calculated a safe evacuation path routing around the {round(danger_radius*111, 1)}km hazard zone.\n\n"
    response_text += "WAYPOINTS:\n"
    for i, wp in enumerate(waypoints):
        response_text += f"{i+1}. Lat: {wp['lat']}, Lon: {wp['lon']}\n"
        
    return {"latitude": round(start_lat, 4), "longitude": round(start_lon, 4)}, \
           {"latitude": round(end_lat, 4), "longitude": round(end_lon, 4)}, \
           response_text

def generate_risk_analysis(event):
    """Generates synthetic risk analysis feedback based on magnitude and depth."""
    try:
        mag = float(event['magnitude'])
        depth = float(event['depth'])
    except:
        return None
        
    # Very basic rule-based risk generation to train the model to output similar text
    if mag >= 6.0:
        level = "CRITICAL"
        analysis = f"A major magnitude {mag} earthquake has occurred at a shallow depth of {depth}km. Severe structural damage and infrastructure collapse are highly likely in the immediate vicinity."
        recs = "- Initiate immediate full-scale search and rescue.\n- Dispatch heavy lifting equipment to damaged zones.\n- Evacuate surrounding unstable structures immediately.\n- Establish emergency medical triage centers outside the 20km radius."
    elif mag >= 5.0:
        level = "HIGH"
        analysis = f"A strong magnitude {mag} earthquake occurred. Moderate to heavy damage is expected to older buildings. The depth of {depth}km means ground shaking was widely felt."
        recs = "- Dispatch rapid assessment teams to the epicenter.\n- Inspect critical infrastructure (bridges, dams) for structural integrity.\n- Prepare local hospitals for casualty influx."
    elif mag >= 4.0:
        level = "MEDIUM"
        if depth < 10:
            analysis = f"A moderate magnitude {mag} earthquake occurred. Due to its shallow depth of {depth}km, significant shaking was likely felt, though widespread structural damage is unlikely."
            recs = "- Local emergency services should be on alert.\n- Advise public to stay away from unreinforced masonry."
        else:
            analysis = f"A moderate magnitude {mag} earthquake occurred at a depth of {depth}km. Risk of significant damage is low."
            recs = "- Monitor for localized aftershocks.\n- Standard public reassurance protocols."
    else:
        level = "LOW"
        analysis = f"A minor magnitude {mag} tremor occurred. No significant damage is expected."
        recs = "- No immediate action required. Log for seismic monitoring."
        
    response_text = f"RISK LEVEL: {level}\n\nANALYSIS:\n{analysis}\n\nRECOMMENDATIONS:\n{recs}"
    return response_text

def build_dataset(events):
    """Build the JSONL dataset holding instructions and targets."""
    dataset = []
    
    print("Generating Path Planning examples...")
    path_count = 0
    while path_count < NUM_PATH_EXAMPLES and len(events) > 0:
        event = random.choice(events)
        origin, dest, response = generate_synthetic_path(event)
        
        if response:
            user_prompt = format_path_prompt(event, origin, dest)
            text = format_chat_item(PATH_SYSTEM_PROMPT, user_prompt, response)
            dataset.append({"text": text})
            path_count += 1
            
    print("Generating Risk Analysis examples...")
    risk_count = 0
    while risk_count < NUM_RISK_EXAMPLES and len(events) > 0:
        # Pass a single event for targeted risk analysis (simulating a recent burst)
        event = random.choice(events)
        response = generate_risk_analysis(event)
        
        if response:
            user_prompt = format_risk_prompt([event])
            text = format_chat_item(RISK_SYSTEM_PROMPT, user_prompt, response)
            dataset.append({"text": text})
            risk_count += 1
            
    random.shuffle(dataset)
    return dataset

def main():
    events = fetch_afad_events()
    if not events:
        print("Failed to fetch events, using dummy fallback for demonstration.")
        # Fallback dummy event to ensure the pipeline builds
        events = [{
            "location": "Kahramanmaras (Pazarcik)", "latitude": "37.288", "longitude": "37.043",
            "magnitude": "7.7", "depth": "8.6", "date": "2023-02-06T04:17:00"
        }, {
            "location": "Izmir (Seferihisar)", "latitude": "37.888", "longitude": "26.777",
            "magnitude": "6.6", "depth": "16.5", "date": "2020-10-30T14:51:00"
        }, {
            "location": "Istanbul (Marmara Sea)", "latitude": "40.85", "longitude": "28.15",
            "magnitude": "4.2", "depth": "12.0", "date": "2024-01-15T10:00:00"
        }]
        
    dataset = build_dataset(events)
    
    split_idx = int(len(dataset) * TRAIN_SPLIT_RATIO)
    train_data = dataset[:split_idx]
    eval_data = dataset[split_idx:]
    
    # Ensure data directory exists
    TRAIN_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Writing {len(train_data)} examples to {TRAIN_DATA_PATH}")
    with open(TRAIN_DATA_PATH, 'w', encoding='utf-8') as f:
        for item in train_data:
            f.write(json.dumps(item) + '\n')
            
    print(f"Writing {len(eval_data)} examples to {EVAL_DATA_PATH}")
    with open(EVAL_DATA_PATH, 'w', encoding='utf-8') as f:
        for item in eval_data:
            f.write(json.dumps(item) + '\n')
            
    print("Done! Dataset is ready for training.")

if __name__ == "__main__":
    main()
