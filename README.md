# PropCare

A property maintenance system for Obs Realty Group, built with **React, ASP.NET Core and PostgreSQL**.

- [Live application](https://propcare-sunx.onrender.com)
- [Group presentation](https://youtu.be/Mp6bIOCUu0U)
- [Requirements and architecture](docs/REQUIREMENTS.md)
- [Hosting and deployment](docs/DEPLOYMENT.md)
- [Test results](docs/AUDIT-2026-10-05.md)
- [GitHub Actions](https://github.com/ST10445479-ConnorBettridge/INSY7315_PROPCARE_2/actions)

  #  Authors

This project was collaboratively developed by:

**ST10404539 — Neville Kabamba**  
**ST10403582 — Zulfique Jattiem**  
**ST10445479 — Connor Bettridge**  
**ST10283036 — Ayakha Ntsomi**  
**ST10439005 — Kwanda Zulu**

## Demo access

The hosted app uses fictional demonstration accounts. The group shares the hosted password privately. Free hosting may take a little time to wake up after inactivity.

| Role | Email |
| --- | --- |
| Tenant | sarahwilliams@example.com |
| Property manager | michael.jacobs@obsrealty.co.za |
| Technician | johan.vdm@obsrealty.co.za |
| Administrator | admin@obsrealty.co.za |

New tenants can register, but an administrator must link them to a property before they can submit maintenance requests.

## Features

- Tenants report issues, attach photos, track progress, comment, confirm repairs and rate completed work.
- Managers review requests, assign and schedule technicians, manage their properties and export reports.
- Technicians accept or reject jobs, update progress, add work notes and photos, and mark repairs complete.
- Administrators manage users, roles, properties, tenant links, categories and technician details.
- Notifications and request history are saved in PostgreSQL. Photo access is restricted to authorised users.

## Local development

Install Node.js 22.12 or newer, the .NET 10 SDK and PostgreSQL 17 or 18. Clone the repository and run these commands from its root directory:

```sh
npm ci
npm ci --prefix frontend
dotnet tool restore
npm run build
```

Create a PostgreSQL database and an application user. Add `.local/settings.json` with your connection details and a randomly generated signing key of at least 32 bytes:

```json
{
  "ConnectionStrings": {
    "PropCare": "Host=127.0.0.1;Port=5432;Database=propcare;Username=propcare;Password=YOUR_DATABASE_PASSWORD"
  },
  "Jwt": { "Key": "YOUR_RANDOM_SIGNING_KEY" },
  "SeedDemo": true,
  "DemoPassword": "YOUR_DEMO_PASSWORD"
}
```

Use a demo password with at least ten characters, uppercase, lowercase and a number. Keep PostgreSQL running, then run `npm start` and open http://127.0.0.1:5124. Startup applies the database migrations and seeds demo accounts when the user table is empty. Changing `DemoPassword` does not reset existing accounts; an administrator can reset them in the app.

For frontend hot reload, run `npm run dev` in a second terminal. Vite uses port 5173 and proxies API requests to port 5124. Run `npm run build` to update the frontend served by ASP.NET Core.

`.local/` contains private settings and local data and is excluded from Git. The archived Express application's `.env` is not used by the current application.

## Tests

Create a separate database named `propcare_test` owned by the application user. Tests use `TEST_DATABASE_CONNECTION`, or derive the connection from the local settings above.

```sh
npm test
# With the application running:
npm run test:browser
npm run test:browser:edge-cases
npm run test:accessibility
```

Browser tests create fictional records in the demo app. Set `DEMO_PASSWORD` to the password you chose during setup. `PPC_BASE` selects another demo URL and `PPC_CHROME` selects the browser executable. Test results and screenshots are saved under ignored `test-results/`.

GitHub Actions builds the app and runs database, API, browser, accessibility, dependency and Docker checks. Successful releases from `main` deploy to Render and run checks against the public app. See [test results](docs/AUDIT-2026-10-05.md) and [deployment setup](docs/DEPLOYMENT.md).

## Project layout

| Directory | Contents |
| --- | --- |
| `frontend/src/` | React views, API client and styles |
| `backend/PropCare.Api/` | Controllers, services, data model and migrations |
| `scripts/` | Launcher and automated checks |
| `docs/` | Requirements, testing and deployment notes |
| `legacy/express/` | Original Express implementation, excluded from the active build |
| `prototype/` | Original prototype |

## Notices

The original source history and notices are retained. Frontend dependency notices are included in `frontend/public/third-party-notices.txt`; other package licences accompany their distributions.

Developed for  ** IIE EMERIS, INSY7315 Information Systems 3E – Work Integrated Learning Task 2** .
