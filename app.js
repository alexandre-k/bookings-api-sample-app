/*
Copyright 2021 Square Inc.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const express = require("express");
const mongoose = require("mongoose");
const logger = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
require("dotenv").config();

DB_USER = process.env["DB_USER"];
DB_PASSWORD = process.env["DB_PASSWORD"];
DB_HOST = process.env["DB_HOST"];
DB_PORT = process.env["DB_PORT"];
DB_NAME = process.env["DB_NAME"];

mongoose
  .connect(`mongodb://${DB_HOST}:${DB_PORT}/`, {
    user: DB_USER,
    pass: DB_PASSWORD,
  })
  .then(() => {
    console.log("Connected to MongoDB.");
  })
  .catch((err) => console.log("Error while connecting to MongoDB ", err));
const app = express();

// Check that all required .env variables exist
if (!process.env["ENVIRONMENT"]) {
  console.error('.env file missing required field "environment".');
  process.exit(1);
} else if (!process.env["SQUARE_ACCESS_TOKEN"]) {
  console.error('.env file missing required field "SQUARE_ACCESS_TOKEN".');
  process.exit(1);
} else if (!process.env["SQUARE_LOCATION_ID"]) {
  console.error('.env file missing required field "SQUARE_LOCATION_ID".');
  process.exit(1);
}

const routes = require("./routes/index");
const { locationsApi } = require("./util/square-client");

// Get location information and store it in app.locals so it is accessible in all pages.
locationsApi
  .retrieveLocation(process.env["SQUARE_LOCATION_ID"])
  .then(function (response) {
    app.locals.location = response.result.location;
  })
  .catch(function (error) {
    if (error.statusCode === 401) {
      console.error(
        "Configuration has failed. Please verify `.env` file is correct."
      );
    }
    process.exit(1);
  });

// set the view engine to ejs
app.set("view engine", "ejs");

app.use(logger("dev"));

app.use(express.static(__dirname + "/public"));

app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  })
);

const limiter = rateLimit({
  legacyHeaders: false,
  max: 60,
  standardHeaders: true,
  windowMs: 60 * 1000,
});

app.use(limiter);

app.use(cookieParser());
app.use("/", routes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handlers
// For simplicity, we print all error information
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  // when errors is not iterable - return a generic 500 page
  if (!err.errors || !err.errors.length) {
    return res.render("pages/formatted-error", {
      code: 500,
      description: "Something went wrong",
      shortDescription: "Internal Server Error",
    });
  }
  // error when time slot is not available when creating a booking
  const timeNotAvailable = err.errors.find((e) =>
    e.detail.match(/That time slot is no longer available/)
  );
  if (timeNotAvailable) {
    return res.render("pages/formatted-error", {
      code: err.statusCode,
      description:
        "Opps! This appointment time is no longer available. Please try booking again.",
      shortDescription: "Bad Request",
    });
  }
  // error when the service version is stale when creating a booking
  const staleVersion = err.errors.find((e) => e.detail.match(/Stale version/));
  if (staleVersion) {
    return res.render("pages/formatted-error", {
      code: err.statusCode,
      description:
        "The service has been updated since selecting it. Please try booking it again.",
      shortDescription: "Bad Request",
    });
  }
  // error when the booking is past the cancellation period when cancelling a booking
  const pastCancellationPeriod = err.errors.find((e) =>
    e.detail.match(/cannot cancel past cancellation period end/)
  );
  const endedCancellationPeriod = err.errors.find((e) =>
    e.detail.match(/The cancellation period for this booking has ended/)
  );
  if (pastCancellationPeriod || endedCancellationPeriod) {
    return res.render("pages/formatted-error", {
      code: err.statusCode,
      description:
        "Sorry! The booking is past the cancellation period so cannot be cancelled or rescheduled.",
      shortDescription: "Bad Request",
    });
  }
  // if not found
  if (err.statusCode === 404) {
    return res.render("pages/formatted-error", {
      code: err.statusCode,
      description: "The resource was not found",
      shortDescription: "Not Found",
    });
  }
  // if fault
  if (err.statusCode === 500) {
    return res.render("pages/formatted-error", {
      code: err.statusCode,
      description: "Something went wrong",
      shortDescription: "Internal Server Error",
    });
  }
  // other errors
  return res.render("pages/formatted-error", {
    code: err.statusCode,
    description: err.errors ? JSON.stringify(err.errors, null, 4) : err.stack,
    shortDescription: err.message,
  });
});

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

const http = require("http");

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Create Websocket server
 */
const io = require("socket.io")(server);

app.set("ws", io);

module.exports = { app, server, port };
