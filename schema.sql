-- GP booking schema. Times are ISO-8601 UTC strings.
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS offer_slots;
DROP TABLE IF EXISTS offers;
DROP TABLE IF EXISTS availability;
DROP TABLE IF EXISTS slots;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS clinicians;

CREATE TABLE clinicians (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('GP', 'Nurse'))
);

CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  flag_chest_or_breathing INTEGER NOT NULL DEFAULT 0,
  flag_rapidly_worse INTEGER NOT NULL DEFAULT 0,
  suggested_urgency TEXT NOT NULL CHECK (suggested_urgency IN ('urgent', 'routine')),
  urgency TEXT CHECK (urgency IN ('urgent', 'routine')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'offered', 'booked', 'needs_times', 'no_reply')),
  created_at TEXT NOT NULL
);

CREATE TABLE slots (
  id INTEGER PRIMARY KEY,
  clinician_id INTEGER NOT NULL REFERENCES clinicians(id),
  starts_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'held', 'booked')),
  request_id INTEGER REFERENCES requests(id)
);
CREATE INDEX slots_by_time ON slots (status, starts_at);

CREATE TABLE availability (
  request_id INTEGER NOT NULL REFERENCES requests(id),
  day TEXT NOT NULL,
  half TEXT NOT NULL CHECK (half IN ('am', 'pm')),
  PRIMARY KEY (request_id, day, half)
);

CREATE TABLE offers (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired'))
);

CREATE TABLE offer_slots (
  offer_id INTEGER NOT NULL REFERENCES offers(id),
  slot_id INTEGER NOT NULL REFERENCES slots(id),
  PRIMARY KEY (offer_id, slot_id)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id),
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
