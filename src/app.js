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

// Check that all required .env variables exist
const requiredEnvVariables = [
  "SERVER_PORT",
  "MAGIC_LINK_SECRET_KEY",
  "SQUARE_SIGNATURE_KEY",
  "SQUARE_ENVIRONMENT",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_LOCATION_ID",
  "SQUARE_API_VERSION",
  "MONGODB_USER",
  "MONGODB_PASSWORD",
  "MONGODB_HOST",
  "MONGODB_PORT",
  "MONGODB_DATABASE",
];

const envCheck = requiredEnvVariables.map((variable) => {
  if (variable in process.env) {
    return true;
  }
  console.error(".env file missing required field: ", variable);
  return false;
});

if (envCheck.includes(false)) process.exit(1);

DB_USER = process.env["MONGODB_USER"];
DB_PASSWORD = process.env["MONGODB_PASSWORD"];
DB_HOST = process.env["MONGODB_HOST"];
DB_PORT = process.env["MONGODB_PORT"];
DB_NAME = process.env["MONGODB_DATABASE"];

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
app.use("/api", routes);

// error handlers
app.use(function (err, req, res, next) {
  res.status(500).send(err);
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

const port = normalizePort(process.env.SERVER_PORT || "3000");
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
