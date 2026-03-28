import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from ..core.config import settings

# A curated dataset of Turkish geography to bake map knowledge into the LLM during fine-tuning.
# Training on these explicit coordinates and routes teaches the AI the topology of Türkiye.
TURKEY_GEOGRAPHY = {
    "cities": {
        "Istanbul": {"lat": 41.0082, "lon": 28.9784},
        "Ankara": {"lat": 39.9334, "lon": 32.8597},
        "Izmir": {"lat": 38.4237, "lon": 27.1428},
        "Antalya": {"lat": 36.8969, "lon": 30.7133},
        "Adana": {"lat": 37.0000, "lon": 35.3213},
        "Hatay": {"lat": 36.2000, "lon": 36.1500},
        "Kahramanmaras": {"lat": 37.5753, "lon": 36.9228},
        "Gaziantep": {"lat": 37.0662, "lon": 37.3833},
        "Malatya": {"lat": 38.3552, "lon": 38.3095},
        "Diyarbakir": {"lat": 37.0662, "lon": 37.3833},
        "Erzurum": {"lat": 39.9000, "lon": 41.2700},
        "Trabzon": {"lat": 39.9000, "lon": 39.7167},
        "Samsun": {"lat": 41.2867, "lon": 36.3300},
        "Bursa": {"lat": 40.1828, "lon": 29.0667},
        "Kayseri": {"lat": 38.7312, "lon": 35.4787},
    },
    "highways": [
        "O-4 Motorway",
        "D400 Coastal Highway",
        "E80 European Route",
        "D750",
        "D300",
        "O-52",
    ],
    "features": [
        "Taurus Mountains (Toroslar)",
        "North Anatolian Fault Zone (NAFZ)",
        "East Anatolian Fault Zone (EAFZ)",
        "Kizilirmak River",
        "Lake Van",
    ],
    "hazards": ["seismic", "wildfire", "flood", "landslide"],
}


class DataProcessor:
    """
    Generalized DataProcessor for TUA Disaster AI.
    1. Fetches live AFAD seismic data.
    2. Generates synthetic map-aware training data specifically detailing Turkish
       geography, highways, fault lines, and NASA/TUA simulated satellite telemetry.
    """

    def __init__(self):
        self.data_dir = settings.DATA_DIR
        self.train_path = self.data_dir / "train.jsonl"
        self.valid_path = self.data_dir / "valid.jsonl"

        self.data_dir.mkdir(parents=True, exist_ok=True)

    # --- Live Data Ingestion ---

    def fetch_seismic_data(
        self, hours_back: int = 720, min_mag: float = 3.0
    ) -> List[Dict[str, Any]]:
        """Fetch real earthquake events from AFAD API to combine with map training."""
        end_date = datetime.now()
        start_date = end_date - timedelta(hours=hours_back)

        params = {
            "start": start_date.strftime("%Y-%m-%dT%H:%M:%S"),
            "end": end_date.strftime("%Y-%m-%dT%H:%M:%S"),
            "minmag": min_mag,
        }

        print(
            f"Fetching AFAD seismic data: {start_date.date()} to {end_date.date()}..."
        )
        try:
            response = requests.get(settings.AFAD_API_URL, params=params, timeout=30)
            response.raise_for_status()
            events = response.json()
            return [{**e, "type": "seismic"} for e in events]
        except Exception as e:
            print(f"Warning: Could not fetch live AFAD data: {e}")
            return []

    # --- Formatting ---

    def format_chatml(self, system: str, user: str, assistant: str) -> Dict[str, Any]:
        """Formats data into ChatML/Qwen training format."""
        return {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
                {"role": "assistant", "content": assistant},
            ]
        }

    def generate_waypoints(
        self,
        start_lat: float,
        start_lon: float,
        end_lat: float,
        end_lon: float,
        steps: int = 3,
    ) -> str:
        """Generates a structured string of XML-style waypoints between two coordinates."""
        waypoints_str = ""
        for i in range(1, steps + 1):
            fraction = i / (steps + 1)
            # Add slight curvature/noise to simulate routing around obstacles
            w_lat = (
                start_lat + (end_lat - start_lat) * fraction + random.uniform(-0.1, 0.1)
            )
            w_lon = (
                start_lon + (end_lon - start_lon) * fraction + random.uniform(-0.1, 0.1)
            )
            waypoints_str += (
                f"\n<waypoint>{round(w_lat, 4)}, {round(w_lon, 4)}</waypoint>"
            )
        return waypoints_str

    # --- Training Data Generators (Map of Türkiye) ---

    def generate_turkey_map_training_data(
        self, num_samples: int = 1000
    ) -> List[Dict[str, Any]]:
        """
        Creates a massive dataset of routing scenarios across Turkey.
        This forces the LLM to learn Turkish cities, highways, and output structured waypoints.
        """
        print(
            f"Generating {num_samples} synthetic geographic training samples for the map of Türkiye..."
        )
        dataset = []
        cities = list(TURKEY_GEOGRAPHY["cities"].keys())

        system_prompt = (
            "You are the TUA Satellite Analysis & Disaster Routing AI. Your task is to process simulated "
            "satellite imagery and disaster data to draw the safest, most efficient rescue route for emergency teams.\n"
            "1. Explain what the satellite imagery reveals about the hazard zone and Turkish geography.\n"
            "2. Provide a safe routing strategy mentioning specific Turkish highways or terrain.\n"
            "3. Output the exact route waypoints. You MUST wrap each coordinate in <waypoint>LAT, LON</waypoint> tags."
        )

        for _ in range(num_samples):
            # Pick random origin, destination, and hazard location
            origin_name, dest_name, hazard_name = random.sample(cities, 3)
            origin = TURKEY_GEOGRAPHY["cities"][origin_name]
            dest = TURKEY_GEOGRAPHY["cities"][dest_name]
            hazard = TURKEY_GEOGRAPHY["cities"][hazard_name]

            hazard_type = random.choice(TURKEY_GEOGRAPHY["hazards"])
            highway = random.choice(TURKEY_GEOGRAPHY["highways"])
            terrain = random.choice(TURKEY_GEOGRAPHY["features"])
            severity = round(random.uniform(4.0, 8.5), 1)

            user_prompt = (
                f"Hazard Detected: {hazard_type} at {hazard_name} (Severity {severity}). "
                f"Epicenter: ({hazard['lat']}, {hazard['lon']}).\n"
                f"Rescue Team Origin: {origin_name} ({origin['lat']}, {origin['lon']}).\n"
                f"Target Destination: {dest_name} ({dest['lat']}, {dest['lon']}).\n"
                f"Analyze the NASA/TUA satellite data and provide the safest waypoints."
            )

            # Constructing a rich, map-aware response
            assistant_response = (
                f"Satellite telemetry indicates severe structural disruption within a {severity * 4}km radius of {hazard_name}. "
                f"Thermal and SAR (Synthetic Aperture Radar) imaging confirms the primary {hazard_type} hazard is expanding towards the {terrain}. "
                f"To ensure the safety of the rescue convoy traveling from {origin_name} to {dest_name}, direct routes through the epicenter must be avoided.\n\n"
                f"Routing Strategy: The team will be diverted via the {highway} corridor. This bypasses the active hazard zone while maintaining logistical speed over stable terrain.\n\n"
                f"Approved Safest Waypoints:"
                f"\n<waypoint>{origin['lat']}, {origin['lon']}</waypoint>"
                f"{self.generate_waypoints(origin['lat'], origin['lon'], dest['lat'], dest['lon'])}"
                f"\n<waypoint>{dest['lat']}, {dest['lon']}</waypoint>"
            )

            dataset.append(
                self.format_chatml(system_prompt, user_prompt, assistant_response)
            )

        return dataset

    def create_strategic_analysis_example(
        self, events: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Generates strategic assessment incorporating Turkish fault lines."""
        if not events:
            return {}

        system = (
            "You are a TUA Strategic Satellite Analyst. Analyze the list of recent emergency "
            "events and simulated satellite telemetry to provide a concise risk assessment and rescue team safety recommendations."
        )

        summary = "\n".join(
            [
                f"- {e.get('type', 'seismic')} in {e.get('location', 'Turkey')} (Severity: {e.get('magnitude', 5.0)})"
                for e in events[:4]
            ]
        )
        user = f"Analyze the following concurrent hazard events from the latest satellite pass:\n{summary}"

        fault_line = random.choice(
            ["North Anatolian Fault Zone (NAFZ)", "East Anatolian Fault Zone (EAFZ)"]
        )

        assistant = (
            f"Consolidated Satellite Assessment: Telemetry reveals clustering along the {fault_line}. "
            "InSAR displacement maps show significant ground deformation. "
            "Priority 1: Reroute civilian traffic away from compromised viaducts and state highways near the epicenters. "
            "Priority 2: Deploy heavy aerial observation drones over the affected region to continuously map secondary hazards. "
            "Rescue teams must rely on the provided <waypoint> coordinates to bypass blocked infrastructure."
        )

        return self.format_chatml(system, user, assistant)

    # --- Orchestration ---

    def process_and_save(self, train_split: float = 0.9):
        """Builds the combined dataset (Live AFAD + Synthetic Map Data) and saves it."""
        dataset = []

        # 1. Inject Massive Topographical Training Data (Türkiye Map)
        dataset.extend(self.generate_turkey_map_training_data(num_samples=800))

        # 2. Add Live AFAD Real-world Events
        live_events = self.fetch_seismic_data()

        # Convert live events into strategic analyses
        for i in range(0, len(live_events), 4):
            group = live_events[i : i + 4]
            if len(group) > 1:
                dataset.append(self.create_strategic_analysis_example(group))

        # Shuffle to mix synthetic geographic data with live strategic data
        random.shuffle(dataset)
        split_idx = int(len(dataset) * train_split)

        train_data = dataset[:split_idx]
        valid_data = dataset[split_idx:]

        self._write_jsonl(train_data, self.train_path)
        self._write_jsonl(valid_data, self.valid_path)

        print(f"Dataset generated and saved successfully!")
        print(
            f" - {len(train_data)} training examples (teaching Türkiye Geography & Routing)."
        )
        print(f" - {len(valid_data)} validation examples.")

    def _write_jsonl(self, data: List[Dict[str, Any]], path: Path):
        with open(path, "w", encoding="utf-8") as f:
            for entry in data:
                if entry:
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    processor = DataProcessor()
    processor.process_and_save()
