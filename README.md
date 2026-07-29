# Port Flow Simulation Frontend

Static HTML/CSS/JavaScript frontend for a three-stage port-flow discrete-event simulation.
The numerical simulation is executed by the FastAPI backend; charts, animations, and ZIP/CSV export remain in the browser.

## Local test

1. Edit `public/config.js` only when needed. Localhost automatically uses `http://127.0.0.1:8000`.
2. Start the backend on port 8000.
3. Run:

```powershell
cd public
py -m http.server 5500
```

4. Open `http://127.0.0.1:5500`.

To override the API URL temporarily:

`http://127.0.0.1:5500/?api=https://your-backend.onrender.com`

## Cloudflare static deployment

- Framework: None
- Root directory: blank
- Build command: `exit 0`
- Output directory: `public`

After backend deployment, replace the placeholder in `public/config.js`, commit, and redeploy.
