const express = require("express");
const router = express.Router();
const JSONBig = require("json-bigint");
require("dotenv").config();

const locationId = process.env["SQUARE_LOCATION_ID"];

/**
 * POST /events
 *
 * Catch all webhook events and send the content to the client
 */
router.post("", async (req, res, next) => {
  try {
    const ws = req.app.get("ws");
    ws.emit(req.body.type, req.body);
    return res.send({ ok: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
