const mongoose = require("mongoose");

const schema = mongoose.Schema({
  email: String,
  customerId: String,
  orderId: String,
  paymentStatus: String,
  paymentLinkId: String,
  bookingId: String,
  status: String,
  rawBooking: String,
  serviceNames: [String]
});

module.exports = mongoose.model("Booking", schema);
