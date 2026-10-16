-- Health Clinic Info Page (Question 14)
-- Resource: clinic   Table: clinic

DROP TRIGGER IF EXISTS clinic_set_updated_at;
DROP TABLE IF EXISTS clinic;

CREATE TABLE clinic (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_name      VARCHAR(150) NOT NULL,
  doctor_name      VARCHAR(150),
  specialty        VARCHAR(100),
  location         VARCHAR(150),
  phone            VARCHAR(20),
  email            VARCHAR(120),
  opening_hours    VARCHAR(100),
  consultation_fee DECIMAL(8, 2) DEFAULT 0 CHECK (consultation_fee >= 0),
  accepts_walk_ins BOOLEAN NOT NULL DEFAULT 1 CHECK (accepts_walk_ins IN (0, 1)),
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SQLite has no "ON UPDATE CURRENT_TIMESTAMP", so a trigger keeps updated_at current.
CREATE TRIGGER clinic_set_updated_at
AFTER UPDATE ON clinic
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE clinic SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

INSERT INTO clinic (clinic_name, doctor_name, specialty, location, phone, email, opening_hours, consultation_fee, accepts_walk_ins) VALUES
  ('Mulungushi Campus Health Centre', 'Dr. Mwila Chanda',    'General Practice', 'Great North Road, Kabwe',     '+260 970 000 101', 'campus.health@example.com',    'Mon-Fri 08:00-17:00', 0.00,   1),
  ('Kabwe Family Clinic',             'Dr. Natasha Banda',   'Family Medicine',  'Freedom Way, Kabwe',          '+260 970 000 102', 'family.clinic@example.com',    'Mon-Sat 08:00-18:00', 150.00, 1),
  ('Bwacha Eye Care',                 'Dr. Joseph Phiri',    'Ophthalmology',    'Bwacha, Kabwe',               '+260 970 000 103', 'eyecare@example.com',          'Mon-Fri 09:00-16:00', 250.00, 0),
  ('Makandanyama Dental Studio',      'Dr. Grace Mulenga',   'Dentistry',        'Makandanyama, Kabwe',         '+260 970 000 104', 'dental.studio@example.com',    'Mon-Fri 08:30-17:30', 300.00, 0),
  ('Lukanga Children''s Clinic',      'Dr. Peter Zulu',      'Paediatrics',      'Lukanga Road, Kabwe',         '+260 970 000 105', 'kids.clinic@example.com',      'Mon-Sat 07:30-16:00', 180.00, 1),
  ('Chimanimani Women''s Health',     'Dr. Ruth Tembo',      'Obstetrics & Gynaecology', 'Chimanimani, Kabwe',  '+260 970 000 106', 'womens.health@example.com',    'Mon-Fri 08:00-16:30', 280.00, 0),
  ('Highridge Physiotherapy',         'Dr. Kelvin Mumba',    'Physiotherapy',    'Highridge, Kabwe',            '+260 970 000 107', 'physio@example.com',           'Mon-Fri 07:00-19:00', 200.00, 0),
  ('Katondo Skin & Allergy Clinic',   'Dr. Alice Sakala',    'Dermatology',      'Katondo, Kabwe',              '+260 970 000 108', 'skin.allergy@example.com',     'Tue-Sat 09:00-17:00', 260.00, 0),
  ('Ngungu Community Health Post',    'Dr. Brian Mwansa',    'Primary Care',     'Ngungu, Kabwe',               '+260 970 000 109', 'ngungu.post@example.com',      'Daily 08:00-20:00',   0.00,   1),
  ('Railway Mental Wellness Centre',  'Dr. Esther Lungu',    'Psychiatry',       'Railway Compound, Kabwe',     '+260 970 000 110', 'wellness@example.com',         'Mon-Fri 09:00-17:00', 220.00, 0),
  ('Kasanda Heart & Diabetes Clinic', 'Dr. Moses Kunda',     'Internal Medicine','Kasanda, Kabwe',              '+260 970 000 111', 'heart.diabetes@example.com',   'Mon-Fri 08:00-15:00', 320.00, 0),
  ('Mine Township 24h Urgent Care',   'Dr. Chileshe Musonda','Emergency Medicine','Mine Township, Kabwe',       '+260 970 000 112', 'urgent.care@example.com',      'Open 24 hours',       350.00, 1);
