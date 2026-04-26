// Subset of Strava API responses we actually consume.
// Strava docs: https://developers.strava.com/docs/reference/

export type StravaActivityType =
  | "Run"
  | "Ride"
  | "VirtualRide"
  | "Walk"
  | "Hike"
  | "Swim"
  | "Workout"
  | (string & {}); // accept anything else as opaque string

export interface StravaSummaryActivity {
  id: number;
  name: string;
  type: StravaActivityType;
  start_date: string; // ISO 8601 UTC
  start_date_local?: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed?: number; // m/s
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  average_watts?: number;
  device_watts?: boolean;
}

export interface StravaLap {
  id: number;
  lap_index: number;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  total_elevation_gain?: number;
  start_index?: number;
  end_index?: number;
}

export interface StravaDetailedActivity extends StravaSummaryActivity {
  laps?: StravaLap[];
}

export interface StravaTokenResponse {
  token_type: "Bearer";
  expires_at: number; // unix seconds
  expires_in: number; // seconds until expiry
  refresh_token: string;
  access_token: string;
}

// Webhook event payloads — see https://developers.strava.com/docs/webhooks/
export interface StravaWebhookEvent {
  aspect_type: "create" | "update" | "delete";
  event_time: number; // unix seconds
  object_id: number;
  object_type: "activity" | "athlete";
  owner_id: number; // Strava athlete id
  subscription_id: number;
  updates?: Record<string, string | boolean>;
}
