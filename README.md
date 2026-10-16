# Kabwe Clinic Directory — Single-Table CRUD App

ICT251 Web Technologies, Activity 4 — **Question 14: Health Clinic Info Page**
Resource: `clinic` · Table: `clinic` · Stack: SQLite + Node.js/Express + HTML/JavaScript

## Project structure

```
node-sqlite-crud/
├─ backend/
│  ├─ .env              # PORT, DB_FILE, CORS_ORIGIN
│  ├─ .env.example
│  ├─ package.json
│  ├─ schema.sql        # table, updated_at trigger, 12 sample rows
│  ├─ db.js             # opens SQLite, seeds from schema.sql on first run
│  └─ server.js         # Express REST API + serves the frontend
├─ frontend/
│  ├─ index.html
│  └─ app.js
├─ postman/
│  ├─ Clinic_API.postman_collection.json
│  ├─ Clinic_Local.postman_environment.json
│  └─ Clinic_Cloud.postman_environment.json
└─ render.yaml          # one-click cloud deployment
```

## Part A — Database

Table `clinic` (SQLite):

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key, auto-increment |
| clinic_name | VARCHAR(150) | Required |
| doctor_name | VARCHAR(150) | |
| specialty | VARCHAR(100) | |
| location | VARCHAR(150) | |
| phone | VARCHAR(20) | |
| email | VARCHAR(120) | |
| opening_hours | VARCHAR(100) | |
| consultation_fee | DECIMAL(8,2) | Kwacha, must be ≥ 0 |
| accepts_walk_ins | BOOLEAN | 0/1, returned as `true`/`false` |
| created_at | TIMESTAMP | Default `CURRENT_TIMESTAMP` |
| updated_at | TIMESTAMP | Updated automatically by a trigger |

`schema.sql` inserts 12 sample clinics. The database file is created and seeded automatically the first time the server starts. To reset it to the sample data:

```bash
npm run seed
```

## Part B — API

### Run locally

```bash
cd backend
npm install
npm start
```

The API runs at `http://localhost:3000` and the web page at the same address.

### Endpoints

| Method | URL | Purpose | Success |
|---|---|---|---|
| GET | `/api/clinic` | List all clinics (optional `?q=` search) | 200 |
| GET | `/api/clinic/:id` | Get one clinic | 200 |
| POST | `/api/clinic` | Create a clinic | 201 |
| PUT | `/api/clinic/:id` | Update a clinic | 200 |
| DELETE | `/api/clinic/:id` | Delete a clinic | 200 |

Every response is JSON. Errors use `{ "success": false, "error": "...", "details": { field: message } }` with status 400 (invalid input or id), 404 (not found) or 500.

**POST body example**

```json
{
  "clinic_name": "Kabwe North Wellness Clinic",
  "doctor_name": "Dr. Mapalo Kasonde",
  "specialty": "General Practice",
  "location": "Kalonga, Kabwe",
  "phone": "+260 970 000 201",
  "email": "north.wellness@example.com",
  "opening_hours": "Mon-Sat 08:00-18:00",
  "consultation_fee": 120,
  "accepts_walk_ins": true
}
```

**PUT body example** (fields you leave out keep their current value)

```json
{ "opening_hours": "Daily 07:00-21:00", "consultation_fee": 95.5, "accepts_walk_ins": false }
```

### Configuration (`backend/.env`)

```
PORT=3000
DB_FILE=./data/clinic.db
CORS_ORIGIN=*
```

CORS is enabled for the origins in `CORS_ORIGIN` (`*` allows any origin), so the page also works when opened straight from disk.

## Part C — Frontend

Open `http://localhost:3000` (or open `frontend/index.html` directly while the server runs).

- Add a clinic with the form (POST). Fields are checked as you leave them, using the same rules as the API.
- All clinics are listed in a table (GET), with search (press `/` to jump to it).
- Quick filters: **Open now**, **Walk-ins welcome**, **Free visits**, each showing how many clinics match.
- Sort by name, lowest fee, open now first, or most recently updated.
- Each clinic shows whether it is open right now, based on its opening hours and the current time in Kabwe.
- **Edit** loads a clinic into the form; **Save changes** sends a PUT. Press Esc to cancel editing.
- **Delete** first asks "Delete this clinic?" under the row (**Yes, delete** / **Keep it**, or Esc to cancel). Confirming sends a DELETE, and a message with **Undo** appears for 8 seconds. Undo adds the clinic back with a POST, so it gets a new id.
- The table refreshes after every change, and the changed row is briefly highlighted.

## Postman

1. In Postman choose **Import** and select the three files in `postman/`.
2. Pick the **Clinic API - Local** environment (or **Cloud** after deploying).
3. Run the requests in order 1 → 7. Request 2 (POST) stores the new id, which requests 3–6 reuse.

The same collection runs from the command line:

```bash
npx newman run postman/Clinic_API.postman_collection.json -e postman/Clinic_Local.postman_environment.json
```

## Deployment (Render)

1. Push this folder to a GitHub repository.
2. On render.com choose **New → Blueprint**, select the repository; Render reads `render.yaml`.
3. When the deploy finishes, the app is at `https://<service-name>.onrender.com` and the API at `https://<service-name>.onrender.com/api/clinic`.
4. Put that address in `postman/Clinic_Cloud.postman_environment.json` and rerun the collection against it.

Note: free Render instances have no persistent disk, so the database resets to the 12 sample clinics after a restart.

### Links for submission

| Endpoint | Link |
|---|---|
| GET all | `https://<service-name>.onrender.com/api/clinic` |
| GET one | `https://<service-name>.onrender.com/api/clinic/1` |
| POST | `https://<service-name>.onrender.com/api/clinic` |
| PUT | `https://<service-name>.onrender.com/api/clinic/1` |
| DELETE | `https://<service-name>.onrender.com/api/clinic/1` |
