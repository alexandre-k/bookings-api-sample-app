const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const JSONBig = require("json-bigint");
const { v4: uuidv4 } = require("uuid");
const Booking = require("../models/Booking");
const { paymentsApi } = require("../util/square-client");

require("dotenv").config();

const locationId = process.env["SQUARE_LOCATION_ID"];
// Function to generate signature from url and body and compare to square signature.
const isFromSquare = (
  signatureKey,
  notificationUrl,
  squareSignature,
  rawBody
) => {
  // create hmac signature
  const hmac = crypto.createHmac("sha1", signatureKey);
  hmac.update(notificationUrl + rawBody);
  const hash = hmac.digest("base64");

  // compare to square signature
  return hash === squareSignature;
};

/**
 * POST /events
 *
 * Catch all webhook events and send the content to the client
 */
router.post("", async (req, res, next) => {
  try {
    const signatureKey = process.env["SQUARE_SIGNATURE_KEY"];
    const squareSignature = req.headers["x-square-signature"];
    const host = req.headers["host"];
    const notificationUrl = "https://" + host + req.baseUrl;
    const isSignOk = isFromSquare(
      signatureKey,
      notificationUrl,
      squareSignature,
      JSON.stringify(req.body)
    );
    if (!isSignOk) return res.status(404).send("Signature doesn't match");
    const ws = req.app.get("ws");
    const data = req.body;
    switch (data.type) {
      case "payment.updated": {
        // const filter = { paymentLinkId: data.id };
        const filter = { paymentLinkId: "ZDZUKY5BXYGEPW3P" };
        const customerBooking = await Booking.findOne(filter);
        const { result: payment, ...httpResponse } =
          await paymentsApi.getPayment(customerBooking.paymentLinkId);
        await Booking.updateOne(
          { _id: customerBooking._id },
          {
            $set: {
              paymentStatus: payment.status,
            },
          }
        );
      }
    }

    ws.emit(data.type, data);
    return res.send({ ok: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
