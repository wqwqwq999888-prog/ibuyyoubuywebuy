function logisticsNumbers(params) {
  const values = {};
  if (params.CVSPaymentNo) values.ecpay_cvs_payment_no = String(params.CVSPaymentNo);
  if (params.CVSValidationNo) values.ecpay_cvs_validation_no = String(params.CVSValidationNo);
  if (params.BookingNote) values.ecpay_booking_note = String(params.BookingNote);
  return values;
}

module.exports = { logisticsNumbers };
