## About this project

This project is a warehouse inventory detection system using Node.js and Playwright. It provides a web interface for managing users, configurations, and scheduled tasks to check inventory.

## Architecture

- **Backend**: Node.js with Express.js. The main server logic is in `src/server.js`, which sets up API endpoints. The application entry point is `src/app.js`.
- **Frontend**: Static HTML, CSS, and JavaScript files located in the `public/` directory. `public/admin.html` and `public/admin.js` contain the logic for the admin interface.
- **Database**: Uses SQLite for data storage. The database schema and queries are managed in `src/database.js` and `src/db_sqlite.js`. The database file is `data/warehouse.db`.
- **Core Logic**: The inventory detection logic, which uses Playwright for web scraping, is in `src/main.js`.
- **Authentication**: User authentication is handled using JWT. The relevant logic is in `src/auth.js`.
- **Configuration**: Application configuration is stored in `config/config.json`. This includes website credentials and search parameters.

## Development Workflow

### Setup

1.  Install dependencies: `npm install`
2.  Install Playwright browsers: `npm run install-browsers`

### Running the application

-   **Development mode**: `npm run dev`
    -   This starts the server with nodemon for automatic restarts.
-   **Production mode**: `npm run server`
-   **Run the original script**: `npm start`
    -   This runs the original `src/main.js` script directly.

### Testing

-   Run tests with `npm test`. Test files are located in the `tests/` directory.

### Deployment

-   The application can be deployed using Docker. Use `npm run docker:build` to build the image and `npm run docker:compose` to run it with Docker Compose.

## Key Files

-   `src/server.js`: Main Express.js server file, defines API routes.
-   `src/app.js`: Application entry point, initializes the database and sets up scheduled tasks.
-   `src/database.js`: Handles database operations.
-   `src/main.js`: Contains the core Playwright logic for inventory detection.
-   `public/admin.js`: Frontend JavaScript for the admin panel.
-   `config/config.json`: Main configuration file.
-   `docker-compose.yml`: Docker Compose configuration for deployment.
