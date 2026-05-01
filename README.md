# Dash

### Every answer your trucking business needs -- in one app

## Overview

If you're here, it's probably because you have relentlessly worked spreadsheets to get answers to your trucking business operation, and realized you need something more.

What you need is Dash. An all-in-one app built by a trucker, for truckers.

## Features

### Loads

- Load Reporting -- All loads easily identified by the freight bill number
- Load Status -- Immediately see where in the stage a load is
- Payment Status -- Track your money at a glance. Mark a load paid, unpaid, or invoiced
- TONU Tracking -- Follow up with agents on overdue TONU charges due
- Load Notes -- Leave notes on individual loads so you never make the same mistake twice

## Tech Stack

### Frontend

- React
- Shadcn--UI
- Tailwind
- React Router
- Axios
- TypeScript

### Backend

- PostGres SQL
- Supabase
- Express
- dotenv

## Getting Started

1. Clone the repo
2. Install backend dependencies

```bash
cd backend && npm install
```

3. Install frontend dependencies

```bash
cd frontend && npm install
```

4. Configure environment variables (see below)
5. Run migrations

```bash
npm run migrate
```

6. Run the dev server

```bash
npm start
```

## Environment Variables

### What needs to be configured

The following need to be configured in the .dotenv file. If there isn't one, create
one in the root directory of your backend

- PGUSER=[username]
- PGPASSWORD=[your password]
- PGHOST=localhost
- PGPORT=[your port]
- PGDATABASE=[your db name]
- DATABASE_URL=[the URL to your db]
- JWT_SECRET=[your jwt secret]
- JWT_EXPIRES_IN=[length of your JWT token]

## Roadmap

### What's Coming

- v0.2.0 -- Load Detail Page
- v0.3.0 -- Broker, Agent, and Market Management Pages
- v0.4.0 -- Fuel Tracking
- v0.5.0 -- Financial Dashboard
- v0.6.0 -- Trips
- v1.0.0 -- Launch
