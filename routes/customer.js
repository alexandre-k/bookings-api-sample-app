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

const Booking = require("../models/Booking");
const dateHelpers = require("../util/date-helpers");
const express = require("express");
const JSONBig = require("json-bigint");
const router = express.Router();
const {
  bookingsApi,
  catalogApi,
  checkoutApi,
  customersApi,
  teamApi,
} = require("../util/square-client");
const { v4: uuidv4 } = require("uuid");

require("dotenv").config();
const locationId = process.env["SQUARE_LOCATION_ID"];

/**
 * Convert a duration in milliseconds to minutes
 *
 * @param {*} duration - duration in milliseconds
 * @returns {Number} - duration in minutes
 */
function convertMsToMins(duration) {
  return Math.round(Number(duration) / 1000 / 60);
}

/**
 * Return the id of a customer that matches the firstName, lastName and email
 * If such customer doesn't exist, create a new customer.
 *
 * @param {string} givenName
 * @param {string} familyName
 * @param {string} emailAddress
 */
async function getCustomerID(givenName, familyName, emailAddress) {
  const {
    result: { customers },
  } = await customersApi.searchCustomers({
    query: {
      filter: {
        emailAddress: {
          exact: emailAddress,
        },
      },
    },
  });

  if (customers && customers.length > 0) {
    const matchingCustomers = customers.filter(
      (customer) =>
        customer.givenName === givenName && customer.familyName === familyName
    );

    // If a matching customer is found, return the first matching customer
    if (matchingCustomers.length > 0) {
      return matchingCustomers[0].id;
    }
  }

  // If no matching customer is found, create a new customer and return its ID
  const {
    result: { customer },
  } = await customersApi.createCustomer({
    emailAddress,
    familyName,
    givenName,
    idempotencyKey: uuidv4(),
    referenceId: "BOOKINGS-SAMPLE-APP",
  });

  return customer.id;
}

/**
 * GET /customers/search
 *
 * Get customerId
 */
router.post("/search", async (req, res, next) => {
  const { givenName, familyName, emailAddress } = req.body;
  const customerId = await getCustomerID(givenName, familyName, emailAddress);
  res.send({ customerId });
});

/**
 * GET /customer/booking
 *
 * Get customer associated booking information, useful to get as a summary.
 * Typically this summary should include information such as when, what, how
 * much time, with who.
 */

router.get("/booking", async (req, res, next) => {
  try {
    const email = req.query["email"];
    if (email) {
      const customerBooking = await Booking.findOne({
        email,
        status: "ACCEPTED",
      });
      if (customerBooking === null) return res.send(null);
      const {
        result: { booking },
        ...httpResponse
      } = await bookingsApi.retrieveBooking(customerBooking.bookingId);

      const appointment = booking.appointmentSegments[0];
      const retrieveCatalogObjectPromise = catalogApi.retrieveCatalogObject(
        appointment.serviceVariationId,
        true
      );

      // Send request to list staff booking profiles for the current location.
      const retrieveTeamMemberPromise = teamApi.retrieveTeamMember(
        appointment.teamMemberId
      );

      const retrievePaymentLinkPromise =
        checkoutApi.retrievePaymentLink("SNWAT6DTDRDSBR2P");

      // Wait until all API calls have completed.
      const [
        {
          result: { relatedObjects },
        },
        {
          result: { teamMember },
        },
        {
          result: { paymentLink },
        },
      ] = await Promise.all([
        retrieveCatalogObjectPromise,
        retrieveTeamMemberPromise,
        retrievePaymentLinkPromise,
      ]);

      const relatedObject =
        relatedObjects.length > 0 ? relatedObjects[0] : null;

      res.send(
        JSONBig.parse(
          JSONBig.stringify({
            booking,
            teamMember,
            object: relatedObject,
            paymentLink,
          })
        )
      );
    } else {
      throw "Requires an email query parameter found!";
    }
  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * POST /customer/booking
 *
 * Create a new booking object and return it once created
 */
router.post("/booking", async (req, res, next) => {
  try {
    const appointmentSegments = req.body.booking.appointmentSegments;
    const startAt = req.body.booking.startAt;
    const sellerNote = req.body.booking.sellerNote;
    const customerNote = req.body.booking.customerNote;
    const emailAddress = req.body.booking.emailAddress;
    const customerId = req.body.booking.customerId;
    const familyName = req.body.booking.familyName;
    const givenName = req.body.booking.givenName;

    //   // Retrieve catalog object by the variation ID
    //   const {
    //     result: { object: catalogItemVariation },
    //   } = await catalogApi.retrieveCatalogObject(serviceId);
    //   const durationMinutes = convertMsToMins(
    //     catalogItemVariation.itemVariationData.serviceDuration
    //   );

    // Create booking
    const {
      result: { booking },
    } = await bookingsApi.createBooking({
      booking: {
        appointmentSegments,
        customerId: await getCustomerID(givenName, familyName, emailAddress),

        // locationType: LocationType.BUSINESS_LOCATION,
        // sellerNote,
        customerNote,
        locationId,
        startAt,
      },
      idempotencyKey: uuidv4(),
    });
    const customerBooking = new Booking({
      bookingId: booking.id,
      customerId: customerId,
      email: emailAddress,
      orderId: null,
      status: booking.status,
    });
    await customerBooking.save();

    return res.send(JSONBig.parse(JSONBig.stringify({ booking })));
  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * POST /booking/create
 *
 * Create a new booking, booking details and customer information is submitted
 * by form data. Create a new customer if necessary, otherwise use an existing
 * customer that matches the `firstName`, `lastName` and `emailAddress`
 * to create the booking.
 *
 * accepted query params are:
 * `serviceId` - the ID of the service
 * `staffId` - the ID of the staff
 * `startAt` - starting time of the booking
 * `serviceVariationVersion` - the version of the service initially selected
 */
router.post("/create", async (req, res, next) => {
  try {
    const booking = new Booking({
      email: req.body.email,
      customerId: req.body.customerId,
      orderId: req.body.orderId,
      bookingId: req.body.bookingId,
      status: req.body.status,
    });
    await booking.save();
    return res.send(booking);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

/**
 * DELETE /customer/booking/:bookingId
 *
 * delete a booking by booking ID
 */
router.delete("/booking/:bookingId", async (req, res, next) => {
  const bookingId = req.params.bookingId;

  try {
    const {
      result: { booking },
    } = await bookingsApi.retrieveBooking(bookingId);
    await bookingsApi.cancelBooking(bookingId, {
      bookingVersion: booking.version,
    });
    const filter = { bookingId };
    const update = { status: "CANCELLED_BY_CUSTOMER" };
    await Booking.findOneAndUpdate(filter, update, {
      returnOriginal: false,
    });

    res.send({ bookingId, cancelled: true });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

module.exports = router;
