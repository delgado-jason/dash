erDiagram
USERS ||--|| PROFILES : "has"
USERS ||--o{ TRUCKS : "owns"
USERS ||--o{ DRIVERS : "employs"
USERS ||--o{ TRIPS : "creates"
USERS ||--o{ FUEL_ENTRIES : "records"

TRUCKS ||--o{ TRIPS : "assigned_to"
DRIVERS ||--o{ TRIPS : "driven_by"

TRIPS ||--o{ TRIP_STOPS : "has"
TRIPS ||--o{ TRIP_SEGMENTS : "has"
TRIPS ||--o{ LOADS : "contains"
TRIPS ||--o{ FUEL_ENTRIES : "fuel_for"

LOADS ||--o{ ACCESSORIALS : "includes"

TRIP_STOPS ||--o{ TRIP_SEGMENTS : "from_stop"
TRIP_STOPS ||--o{ TRIP_SEGMENTS : "to_stop"

USERS {
uuid id PK
text email "UNIQUE"
text password_hash
timestamptz created_at
}

PROFILES {
uuid user_id PK,FK
text carrier_type
boolean owns_trailer
text home_state
timestamptz created_at
timestamptz updated_at
}

TRUCKS {
uuid id PK
uuid user_id FK
text name
boolean active
timestamptz created_at
}

DRIVERS {
uuid id PK
uuid user_id FK
text name
boolean active
timestamptz created_at
}

TRIPS {
uuid id PK
uuid user_id FK
uuid truck_id FK "nullable"
uuid driver_id FK "nullable"
text trip_type "revenue|deadhead"
text trip_source "user|system"
date trip_date
text status "active|completed"
text origin "nullable"
text final_destination "nullable"
int odometer_start "nullable"
int odometer_end "nullable"
boolean is_estimated
timestamptz created_at
timestamptz updated_at
}

TRIP_STOPS {
uuid id PK
uuid trip_id FK
uuid user_id FK
int stop_order "UNIQUE within trip"
text stop_type "pickup|delivery"
text location
date scheduled_date "nullable"
timestamptz created_at
}

TRIP_SEGMENTS {
uuid id PK
uuid trip_id FK
uuid user_id FK
uuid from_stop_id FK
uuid to_stop_id FK
int segment_order "UNIQUE within trip"
numeric miles
boolean is_estimated
numeric allocated_fuel_cost
timestamptz created_at
}

LOADS {
uuid id PK
uuid trip_id FK
uuid user_id FK
uuid truck_id FK "nullable"
uuid driver_id FK "nullable"
text load_number "nullable"
text origin
text destination
date pickup_date
date delivery_date "nullable"
numeric rate
numeric fuel_surcharge
numeric loaded_miles "PAID miles (practical)"
text mileage_source "user|system_estimated|broker_confirmed"
timestamptz created_at
timestamptz updated_at
}

ACCESSORIALS {
uuid id PK
uuid load_id FK
text type
numeric amount
timestamptz created_at
}

FUEL_ENTRIES {
uuid id PK
uuid user_id FK
uuid truck_id FK "nullable"
uuid trip_id FK "nullable"
date fuel_date
numeric gallons
numeric price_per_gallon
int odometer_reading "nullable"
text location "nullable"
timestamptz created_at
}
