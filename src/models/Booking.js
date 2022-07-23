const mongoose = require("mongoose");

const schema = mongoose.Schema({
  email: String,
  customerId: String,
  orderId: String,
  orderState: String,
  paymentLinkId: String,
  paid: Boolean,
  bookingId: String,
  status: String,
  rawBooking: String,
  serviceNames: [String]
});

module.exports = mongoose.model("Booking", schema);
