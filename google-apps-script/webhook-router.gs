// Replace the existing doPost in 程式碼.gs with this function; do not add a
// second doPost. Keep legacy helpers and doGet unchanged.
function doPost(e) {
  var rawData = e && e.postData ? e.postData.contents : '';
  var request;
  try { request = JSON.parse(rawData || '{}'); }
  catch (error) { return handleOrder(rawData); }
  if (typeof isOrderWebhookRequest === 'function' && isOrderWebhookRequest(request)) {
    try { return handleOrderWebhook(e, request); }
    catch (error) {
      console.error('Order webhook failed: ' + error.message);
      return ContentService.createTextOutput('ERROR: Order synchronization incomplete');
    }
  }
  return handleOrder(rawData);
}
